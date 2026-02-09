import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { buildSlotSpeech, buildOffersFromSnapshot, resolveOfferSlots, type OfferOption } from "../ai/getOffersTool";
import { getCloudbedsAriRaw } from "../integrations/cloudbeds/cloudbedsAriCache";
import { normalizeAriRawToSnapshot } from "../integrations/cloudbeds/cloudbedsNormalizer";

export type GenerateOffersInput = {
  args: unknown;
  currentIntent?: OfferIntent;
  now?: Date;
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

export const generateOffers = async ({ args, currentIntent, now }: GenerateOffersInput): Promise<OfferGenerationOutput> => {
  const intent = currentIntent ?? createEmptyOfferIntent();
  const result = resolveOfferSlots(intent, args, now);

  if (result.status === "NEEDS_CLARIFICATION") {
    return result;
  }

  const ariRaw = await getCloudbedsAriRaw({
    propertyId: "demo_property",
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
    currency: "USD",
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

  const offers = buildOffersFromSnapshot(snapshot, result.slots);
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

export const generateOffersApi = async ({ args, currentIntent, now }: GenerateOffersInput): Promise<OfferApiOutput> => {
  const firstPass = await generateOffers({ args, currentIntent, now });
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
  });

  if (secondPass.status === "OK") {
    return secondPass;
  }

  return toApiError(secondPass);
};
