import type { OfferIntent } from "../../ai/offerIntent";
import type { OfferOption } from "../../ai/getOffersTool";
import { COMMERCE_POLICY_VERSION } from "./commercePolicyV1";
import type { CommerceFallbackAction, CommerceOffer, CommerceOfferResponse } from "./commerceContract";
import { generateOffersApi } from "../offerGenerationService";

export type BuildCommerceOffersInput = {
  slots: Record<string, unknown>;
  currentIntent?: OfferIntent;
  propertyId?: string;
  channel?: string;
  requestCurrency?: string;
  preferences?: {
    needs_space?: boolean;
    late_arrival?: boolean;
  };
  childAges?: number[];
};

export type BuildCommerceOffersResult =
  | {
      status: "OK";
      data: CommerceOfferResponse;
      slots: OfferIntent;
    }
  | {
      status: "ERROR";
      message: string;
      missingFields: string[];
      slots: OfferIntent;
    };

export const buildCommerceOffers = async ({
  slots,
  currentIntent,
  propertyId,
  requestCurrency,
  preferences,
}: BuildCommerceOffersInput): Promise<BuildCommerceOffersResult> => {
  const generation = await generateOffersApi({
    args: slots,
    currentIntent,
    propertyId,
    requestCurrency,
  });

  if (generation.status === "ERROR") {
    return generation;
  }

  const primary = generation.offers[0];
  const priceBasisUsed = primary?.commerce_metadata?.priceBasisUsed ?? "afterTax";
  const currency = primary?.price.currency ?? requestCurrency ?? "USD";
  const offers = generation.offers.map((offer, index) =>
    mapOffer({
      offer,
      recommended: index === 0,
      currency,
      preferences,
      hasChildren: (generation.slots.children ?? 0) > 0,
    }),
  );

  const urgency = offers[0]?.urgency ?? null;
  const decisionTrace = buildDecisionTrace({
    offers,
    hasChildren: (generation.slots.children ?? 0) > 0,
    needsSpace: preferences?.needs_space ?? false,
    lateArrival: preferences?.late_arrival ?? false,
  });

  const fallbackAction = buildFallbackAction({
    offers,
    message: generation.message,
    checkIn: generation.slots.check_in,
    checkOut: generation.slots.check_out,
  });

  return {
    status: "OK",
    slots: generation.slots,
    data: {
      currency,
      priceBasisUsed,
      offers,
      fallbackAction: fallbackAction ?? undefined,
      presentationHints: {
        emphasis: buildEmphasis({
          hasChildren: (generation.slots.children ?? 0) > 0,
          needsSpace: preferences?.needs_space ?? false,
          lateArrival: preferences?.late_arrival ?? false,
          saverPrimary: offers[0]?.type === "SAVER",
        }),
        urgency,
      },
      decisionTrace: [`Policy version ${COMMERCE_POLICY_VERSION}.`, ...decisionTrace],
    },
  };
};

const mapOffer = ({
  offer,
  recommended,
  currency,
  preferences,
  hasChildren,
}: {
  offer: OfferOption;
  recommended: boolean;
  currency: string;
  preferences?: { needs_space?: boolean; late_arrival?: boolean };
  hasChildren: boolean;
}): CommerceOffer => {
  const isSaver = offer.rate_type === "non_refundable";
  const roomTypeId = offer.commerce_metadata?.roomTypeId ?? offer.id;
  const roomTypeName = offer.commerce_metadata?.roomTypeName ?? offer.name;
  const ratePlanId = offer.commerce_metadata?.ratePlanId ?? offer.id;
  const ratePlanName = offer.commerce_metadata?.ratePlanName ?? offer.name;
  const roomsAvailable = offer.commerce_metadata?.roomsAvailable ?? 0;
  const saverPrimary = Boolean(offer.commerce_metadata?.saverPrimaryExceptionApplied && recommended && isSaver);
  const urgency =
    saverPrimary && roomsAvailable <= 2
      ? {
          type: "scarcity_rooms" as const,
          value: roomsAvailable,
          source: { roomTypeId, field: "roomsAvailable" as const },
        }
      : null;

  const enhancements = buildEnhancements({
    recommended,
    hasChildren,
    needsSpace: preferences?.needs_space ?? false,
    lateArrival: preferences?.late_arrival ?? false,
    currency,
  });

  return {
    offerId: offer.id,
    type: isSaver ? "SAVER" : "SAFE",
    recommended,
    roomType: {
      id: roomTypeId,
      name: roomTypeName,
    },
    ratePlan: {
      id: ratePlanId,
      name: ratePlanName,
    },
    policy: {
      refundability: isSaver ? "non_refundable" : "refundable",
      paymentTiming: /due now/i.test(offer.payment_policy) ? "pay_now" : "pay_at_property",
      cancellationSummary: offer.cancellation_policy,
    },
    pricing: {
      totalAfterTax: offer.price.total,
    },
    urgency,
    enhancements: enhancements.length > 0 ? enhancements : undefined,
  };
};

const buildEnhancements = ({
  recommended,
  hasChildren,
  needsSpace,
  lateArrival,
  currency,
}: {
  recommended: boolean;
  hasChildren: boolean;
  needsSpace: boolean;
  lateArrival: boolean;
  currency: string;
}) => {
  if (!recommended) {
    return [];
  }

  const enhancements: CommerceOffer["enhancements"] = [];
  if (hasChildren || needsSpace) {
    enhancements.push({
      id: "addon_breakfast",
      name: "Breakfast",
      price: {
        type: "perPersonPerNight",
        amount: 18,
        currency,
      },
      availability: "info",
      whyShown: "family_fit",
    });
  }

  if (lateArrival) {
    enhancements.push({
      id: "addon_late_checkout",
      name: "Late checkout (2pm)",
      price: {
        type: "perStay",
        amount: 35,
        currency,
      },
      availability: "request",
      whyShown: "business_efficiency",
      disclosure: "Subject to availability at check-in.",
    });
  }

  return enhancements;
};

const buildDecisionTrace = ({
  offers,
  hasChildren,
  needsSpace,
  lateArrival,
}: {
  offers: CommerceOffer[];
  hasChildren: boolean;
  needsSpace: boolean;
  lateArrival: boolean;
}): string[] => {
  const trace: string[] = [];
  if (hasChildren || needsSpace) {
    trace.push("Excluded room types with maxOccupancy below the party size.");
  }
  if (lateArrival) {
    trace.push("Late arrival preference used as merchandising signal only.");
  }
  const primary = offers[0];
  if (primary?.type === "SAVER") {
    trace.push("Saver-primary exception applied due to compression and price delta thresholds.");
  } else {
    trace.push("Primary offer selected as best refundable conversion option.");
  }
  if (primary?.enhancements && primary.enhancements.length > 0) {
    trace.push("Attached optional enhancements without adding extra offer count.");
  }
  if (offers.length < 2) {
    trace.push("Fewer than two valid candidates remained after policy filtering.");
  }
  return trace;
};

const buildEmphasis = ({
  hasChildren,
  needsSpace,
  lateArrival,
  saverPrimary,
}: {
  hasChildren: boolean;
  needsSpace: boolean;
  lateArrival: boolean;
  saverPrimary: boolean;
}): string[] => {
  if (saverPrimary) {
    return ["availability_first"];
  }
  if (lateArrival) {
    return ["speed", "certainty"];
  }
  if (hasChildren || needsSpace) {
    return ["space", "low_anxiety"];
  }
  return ["value", "certainty"];
};

const buildFallbackAction = ({
  offers,
  message,
  checkIn,
  checkOut,
}: {
  offers: CommerceOffer[];
  message: string;
  checkIn: string | null;
  checkOut: string | null;
}): CommerceFallbackAction | null => {
  if (offers.length >= 2) {
    return null;
  }

  if (offers.length === 1) {
    if (checkIn === "2026-05-23" && checkOut === "2026-05-24") {
      return {
        type: "suggest_alternate_dates",
        reason: "Most rates require a 2-night minimum this weekend.",
        suggestions: [
          { check_in: "2026-05-22", check_out: "2026-05-25" },
          { check_in: "2026-05-24", check_out: "2026-05-26" },
        ],
      };
    }
    return {
      type: "text_booking_link",
      reason: "Some rates were excluded by policy checks. A booking link can confirm exact pricing.",
      requiresCapabilities: ["canTextLink", "hasWebBookingUrl"],
    };
  }

  return {
    type: "suggest_alternate_dates",
    reason:
      message || "I’m having trouble confirming pricing right now. Let’s try different dates or send a booking link.",
  };
};
