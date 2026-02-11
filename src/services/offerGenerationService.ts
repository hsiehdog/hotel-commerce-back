import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { buildSlotSpeech, resolveOfferSlots, type OfferOption } from "../ai/getOffersTool";
import { buildCommerceOffers } from "./commerce/buildCommerceOffers";
import { calendarDayDiff } from "../utils/dateTime";

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
  const commerceResult = await buildCommerceOffers({
    request: {
      property_id: propertyId,
      channel: "voice",
      check_in: result.slots.check_in ?? undefined,
      check_out: result.slots.check_out ?? undefined,
      nights: result.slots.nights ?? undefined,
      adults: result.slots.adults ?? undefined,
      rooms: result.slots.rooms ?? undefined,
      children: result.slots.children ?? undefined,
      currency: requestCurrency,
      stub_scenario: result.slots.stub_scenario ?? undefined,
      debug: true,
    },
  });

  if (commerceResult.status === "ERROR") {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: commerceResult.missingFields,
      clarificationPrompt: commerceResult.message,
      slots: result.slots,
    };
  }

  const rooms = result.slots.rooms ?? 1;
  const nights =
    result.slots.nights ??
    (result.slots.check_in && result.slots.check_out
      ? Math.max(1, calendarDayDiff(result.slots.check_out, result.slots.check_in))
      : 1);
  const strategyMode = commerceResult.data.debug?.resolvedRequest.strategyMode ?? "balanced";
  const saverPrimaryExceptionApplied =
    commerceResult.data.debug?.selectionSummary.saverPrimaryExceptionApplied ?? false;
  const offers = commerceResult.data.offers.map((offer, index) =>
    toToolOffer({
      offer,
      currency: commerceResult.data.currency,
      priceBasisUsed: commerceResult.data.priceBasisUsed,
      rooms,
      nights,
      strategyMode,
      saverPrimaryExceptionApplied,
      isPrimary: index === 0,
    }),
  );

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

const toToolOffer = ({
  offer,
  currency,
  priceBasisUsed,
  rooms,
  nights,
  strategyMode,
  saverPrimaryExceptionApplied,
  isPrimary,
}: {
  offer: {
    offerId: string;
    roomType: { id: string; name: string; description?: string; features?: string[] };
    ratePlan: { id: string; name: string };
    policy: {
      refundability: "refundable" | "non_refundable";
      paymentTiming: "pay_at_property" | "pay_now";
      cancellationSummary: string;
    };
    pricing:
      | {
          basis: "afterTax" | "beforeTaxPlusTaxes";
          total: number;
          totalAfterTax: number;
        }
      | {
          basis: "beforeTax";
          total: number;
        };
    urgency?: {
      type: "scarcity_rooms";
      value: number;
      source: { roomTypeId: string; field: "roomsAvailable" };
    } | null;
  };
  currency: string;
  priceBasisUsed: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";
  rooms: number;
  nights: number;
  strategyMode: "balanced" | "protect_rate" | "fill_rooms";
  saverPrimaryExceptionApplied: boolean;
  isPrimary: boolean;
}): OfferOption => {
  const total = "totalAfterTax" in offer.pricing ? offer.pricing.totalAfterTax : offer.pricing.total;
  const subtotal = offer.pricing.total;
  const taxesAndFees = Math.max(0, round2(total - subtotal));
  const perNight = round2(total / Math.max(1, rooms * nights));
  const description = buildVoiceRoomDescription(offer.roomType.description, offer.roomType.features, offer.roomType.name);

  return {
    id: offer.offerId,
    name: `${offer.roomType.name} - ${offer.ratePlan.name}`,
    description,
    rate_type: offer.policy.refundability === "refundable" ? "flexible" : "non_refundable",
    cancellation_policy: offer.policy.cancellationSummary,
    payment_policy:
      offer.policy.paymentTiming === "pay_now" ? "Payment is due now." : "You can pay when you arrive.",
    price: {
      currency,
      per_night: perNight,
      subtotal,
      taxes_and_fees: taxesAndFees,
      total,
    },
    commerce_metadata: {
      priceBasisUsed,
      degradedPriceControls: priceBasisUsed !== "afterTax",
      isPrimary,
      strategyMode,
      saverPrimaryExceptionApplied,
      roomTypeId: offer.roomType.id,
      roomTypeName: offer.roomType.name,
      ratePlanId: offer.ratePlan.id,
      ratePlanName: offer.ratePlan.name,
      roomsAvailable: offer.urgency?.value ?? 99,
    },
  };
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const buildVoiceRoomDescription = (description?: string, features?: string[], fallbackName?: string): string => {
  const summary = description?.trim();
  if (!summary) {
    return `Room type: ${fallbackName ?? "Standard Room"}.`;
  }

  const featureSummary =
    features && features.length > 0 ? ` Key features: ${features.slice(0, 5).join(", ")}.` : "";
  return `${summary}${featureSummary}`;
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
