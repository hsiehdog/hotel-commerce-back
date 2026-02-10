import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { buildSlotSpeech, buildOffersFromSnapshot, resolveOfferSlots, type OfferOption } from "../ai/getOffersTool";
import { getCloudbedsAriRaw } from "../integrations/cloudbeds/cloudbedsAriCache";
import { normalizeAriRawToSnapshot } from "../integrations/cloudbeds/cloudbedsNormalizer";
import { getPropertyContext } from "./propertyContext/getPropertyContext";
import { renderCancellationSummary } from "./propertyContext/renderCancellationSummary";
import { resolvePropertyIdForRequest } from "./propertyContext/resolvePropertyIdForRequest";
import { selectCancellationPolicy } from "./propertyContext/selectCancellationPolicy";

export type GenerateOffersInput = {
  args: unknown;
  currentIntent?: OfferIntent;
  now?: Date;
  propertyId?: string;
  requestCurrency?: string;
};

export type OfferGenerationOutput =
  | {
      status: "OK";
      slots: OfferIntent;
      offers: OfferOption[];
      message: string;
      speech: string;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      missingFields: string[];
      clarificationPrompt: string;
      slots: OfferIntent;
    };

export type OfferApiOutput =
  | {
      status: "OK";
      slots: OfferIntent;
      offers: OfferOption[];
      message: string;
      speech: string;
    }
  | {
      status: "ERROR";
      message: string;
      missingFields: string[];
      slots: OfferIntent;
    };

export const generateOffers = async ({
  args,
  currentIntent,
  now,
  propertyId,
  requestCurrency,
}: GenerateOffersInput): Promise<OfferGenerationOutput> => {
  const intent = currentIntent ?? createEmptyOfferIntent();
  const result = resolveOfferSlots(intent, args, now);

  if (result.status === "NEEDS_CLARIFICATION") {
    return result;
  }
  const resolvedProperty = await resolvePropertyIdForRequest(propertyId);
  const resolvedPropertyId = resolvedProperty.propertyId;

  const ariRaw = await getCloudbedsAriRaw({
    propertyId: resolvedPropertyId,
    checkIn: result.slots.check_in ?? "",
    checkOut: result.slots.check_out ?? undefined,
    nights: result.slots.nights ?? undefined,
    adults: result.slots.adults ?? 1,
    rooms: result.slots.rooms ?? 1,
    children: result.slots.children ?? 0,
    pet_friendly: result.slots.pet_friendly ?? undefined,
    accessible_room: result.slots.accessible_room ?? undefined,
    needs_two_beds: result.slots.needs_two_beds ?? undefined,
    parking_needed: result.slots.parking_needed ?? undefined,
    budget_cap: result.slots.budget_cap ?? undefined,
    stubScenario: result.slots.stub_scenario ?? undefined,
    currency: requestCurrency ?? "USD",
    timezone: result.slots.property_timezone,
  });

  const snapshot = normalizeAriRawToSnapshot(ariRaw);
  if (snapshot.roomTypes.length === 0) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      clarificationPrompt:
        "I'm not seeing availability for those dates with that many rooms. Would you like to try fewer rooms or different dates?",
      slots: result.slots,
    };
  }

  const context = await getPropertyContext(resolvedPropertyId);
  const offers = buildOffersFromSnapshot(snapshot, result.slots).map((offer) => {
    const roomTypeId = offer.commerce_metadata?.roomTypeId;
    if (!roomTypeId || !result.slots.check_in) {
      return offer;
    }

    const matchedPolicy = selectCancellationPolicy({
      policies: context?.cancellationPolicies ?? [],
      checkIn: result.slots.check_in,
      roomTypeId,
    });

    return {
      ...offer,
      cancellation_policy: renderCancellationSummary({
        policy: matchedPolicy,
        refundability: offer.rate_type === "flexible" ? "refundable" : "non_refundable",
        checkInDate: result.slots.check_in,
        propertyTimezone: context?.timezone ?? result.slots.property_timezone ?? "UTC",
        now: now ?? new Date(),
      }),
    };
  });
  if (offers.length === 0) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      clarificationPrompt:
        "I'm having trouble confirming pricing right now. Would you like me to text a booking link or try again in a moment?",
      slots: result.slots,
    };
  }

  return {
    status: "OK",
    slots: result.slots,
    offers,
    message: "Get offers tool will be called now with the following slots",
    speech: buildSlotSpeech(result.slots, offers),
  };
};

const isConfirmationOnlyClarification = (output: OfferGenerationOutput): boolean =>
  output.status === "NEEDS_CLARIFICATION" &&
  output.missingFields.length === 0 &&
  output.slots.confirmation_pending;

const toApiError = (output: Extract<OfferGenerationOutput, { status: "NEEDS_CLARIFICATION" }>): OfferApiOutput => ({
  status: "ERROR",
  message: output.clarificationPrompt,
  missingFields: output.missingFields,
  slots: output.slots,
});

export const generateOffersApi = async ({
  args,
  currentIntent,
  now,
  propertyId,
  requestCurrency,
}: GenerateOffersInput): Promise<OfferApiOutput> => {
  const firstPass = await generateOffers({ args, currentIntent, now, propertyId, requestCurrency });
  if (firstPass.status === "OK") {
    return firstPass;
  }

  if (!isConfirmationOnlyClarification(firstPass)) {
    return toApiError(firstPass);
  }

  const secondPass = await generateOffers({
    args,
    currentIntent: firstPass.slots,
    now,
    propertyId,
    requestCurrency,
  });

  if (secondPass.status === "OK") {
    return secondPass;
  }

  return toApiError(secondPass);
};
