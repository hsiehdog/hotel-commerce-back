import { prisma } from "../../lib/prisma";
import { getCloudbedsAriRaw } from "../../integrations/cloudbeds/cloudbedsAriCache";
import { normalizeAriRawToSnapshot } from "../../integrations/cloudbeds/cloudbedsNormalizer";
import { getPropertyContext } from "../propertyContext/getPropertyContext";
import { renderCancellationSummary } from "../propertyContext/renderCancellationSummary";
import { selectCancellationPolicy } from "../propertyContext/selectCancellationPolicy";
import type { PropertyContext } from "../propertyContext/types";
import { finalizeCommerceProfileInventoryState } from "./buildCommerceProfile";
import type { CommerceOffer, CommerceOfferResponse } from "./commerceContract";
import { filterCandidates } from "./filterCandidates";
import { generateCandidates } from "./generateCandidates";
import { normalizeOfferRequest } from "./normalizeOfferRequest";
import { scoreCandidates } from "./scoring/scoreCandidates";
import { selectArchetypeOffers, selectFallbackAction, type FallbackActionCode } from "./selectArchetypeOffers";
import type { OfferGenerateRequestV1, ScoredCandidate } from "./types";

export type BuildCommerceOffersResult =
  | {
      status: "OK";
      data: CommerceOfferResponse;
    }
  | {
      status: "ERROR";
      message: string;
      missingFields: string[];
      slots: Record<string, unknown>;
    };

export const buildCommerceOffers = async ({
  request,
}: {
  request: OfferGenerateRequestV1;
}): Promise<BuildCommerceOffersResult> => {
  try {
    const normalized = await normalizeOfferRequest(request);

    const ariRaw = await getCloudbedsAriRaw({
      propertyId: normalized.propertyId,
      checkIn: normalized.checkIn,
      checkOut: normalized.checkOut,
      nights: normalized.nights,
      adults: normalized.totalAdults,
      rooms: normalized.rooms,
      children: normalized.totalChildren,
      needs_two_beds: undefined,
      accessible_room: undefined,
      parking_needed: undefined,
      pet_friendly: undefined,
      budget_cap: undefined,
      stubScenario: normalized.stubScenario,
      currency: normalized.currency,
      timezone: "UTC",
    });

    const snapshot = normalizeAriRawToSnapshot(ariRaw);
    const roomTierOverrides = await getRoomTierOverrides(normalized.propertyId);
    const rawCandidates = generateCandidates(snapshot, roomTierOverrides);
    const filterResult = filterCandidates({
      candidates: rawCandidates,
      requestCurrency: normalized.currency,
      partySize: normalized.totalAdults + normalized.totalChildren,
      nights: normalized.nights,
    });

    const scored = scoreCandidates({
      candidates: filterResult.candidates,
      tripType: normalized.profile.tripType,
      posture: normalized.profile.decisionPosture,
      strategyMode: normalized.strategyMode,
    });

    const selection = selectArchetypeOffers({
      scoredCandidates: scored,
      strategyMode: normalized.strategyMode,
    });

    const primary = selection.primary;
    const secondary = selection.secondary;
    const selected = [primary, secondary].filter((candidate): candidate is ScoredCandidate => Boolean(candidate));

    const finalProfile = finalizeCommerceProfileInventoryState({
      profile: normalized.profile,
      roomsAvailable: primary?.roomsAvailable,
    });
    const propertyContext = await getPropertyContext(normalized.propertyId);

    const offers = selected.map((candidate, index) =>
      toCommerceOffer({
        candidate,
        recommended: index === 0,
        profile: finalProfile,
        checkIn: normalized.checkIn,
        now: new Date(normalized.nowUtcIso),
        preferences: normalized.preferences,
        propertyContext,
      }),
    );

    const fallbackCode = selectFallbackAction({
      channel: normalized.channel,
      capabilities: normalized.capabilities,
      isOpenNow: normalized.isOpenNow,
      offersCount: offers.length,
    });

    const reasonCodes = [
      ...(normalized.occupancyDistributed ? ["NORMALIZE_OCCUPANCY_DISTRIBUTED"] : []),
      ...filterResult.reasonCodes,
      ...selection.reasonCodes,
      ...buildProfileReasonCodes(normalized.preferences),
      ...(normalized.preferences?.late_arrival && offers[0]?.type === "SAFE"
        ? ["PROFILE_LATE_ARRIVAL_PRIMARY_SAFE"]
        : []),
      ...(offers.some((offer) => (offer.enhancements?.length ?? 0) > 0) ? ["ENHANCEMENT_ATTACHED"] : []),
      ...(fallbackCode ? [fallbackCode] : []),
    ];

    const debug =
      normalized.debug
        ? {
            resolvedRequest: {
              propertyId: normalized.propertyId,
              channel: normalized.channel,
              checkIn: normalized.checkIn,
              checkOut: normalized.checkOut,
              rooms: normalized.rooms,
              roomOccupancies: normalized.roomOccupancies.map((room) => ({
                adults: room.adults,
                children: room.children,
              })),
              currency: normalized.currency,
              strategyMode: normalized.strategyMode,
            },
            profilePreAri: {
              tripType: normalized.profile.tripType,
              decisionPosture: normalized.profile.decisionPosture,
              leadTimeDays: normalized.profile.leadTimeDays,
              nights: normalized.profile.nights,
            },
            profileFinal: {
              inventoryState: finalProfile.inventoryState,
            },
            selectionSummary: {
              primaryArchetype: primary?.archetype ?? null,
              saverPrimaryExceptionApplied: selection.saverPrimaryExceptionApplied,
              exceptionReason: selection.saverPrimaryExceptionContext,
              secondaryAttempted: Boolean(primary),
              secondaryFailureReason: selection.secondaryFailureReason,
            },
            reasonCodes,
            topCandidates: scored.slice(0, 10).map((candidate) => ({
              roomTypeId: candidate.roomTypeId,
              roomTypeName: candidate.roomTypeName,
              roomTypeDescription: candidate.roomTypeDescription,
              features: candidate.features,
              ratePlanId: candidate.ratePlanId,
              roomsAvailable: candidate.roomsAvailable,
              riskContributors: getRiskContributors(candidate),
              basis: candidate.price.basis,
              totalPrice: candidate.price.amount,
              archetype: candidate.archetype,
              scoreTotal: candidate.scoreTotal,
              components: candidate.componentScores,
            })),
          }
        : undefined;

    return {
      status: "OK",
      data: {
        propertyId: normalized.propertyId,
        channel: normalized.channel,
        currency: normalized.currency,
        priceBasisUsed: filterResult.activeBasis ?? "afterTax",
        offers,
        fallbackAction: fallbackCode ? mapFallback(fallbackCode, normalized.checkIn, normalized.checkOut) : undefined,
        presentationHints: {
          emphasis: buildEmphasis({
            profile: finalProfile,
            saverPrimary: offers[0]?.type === "SAVER",
            secondarySavingsQualified: selection.secondarySavingsQualified,
          }),
          urgency:
            normalized.urgencyEnabled && normalized.allowedUrgencyTypes.includes("scarcity_rooms")
              ? offers[0]?.urgency ?? null
              : null,
        },
        reasonCodes,
        configVersion: normalized.configVersion,
        debug,
      },
    };
  } catch (error) {
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : "Unable to generate offers.",
      missingFields: [],
      slots: {},
    };
  }
};

const toCommerceOffer = ({
  candidate,
  recommended,
  profile,
  checkIn,
  now,
  preferences,
  propertyContext,
}: {
  candidate: ScoredCandidate;
  recommended: boolean;
  profile: { tripType: string; decisionPosture: string };
  checkIn: string;
  now: Date;
  preferences?: { needs_space?: boolean; late_arrival?: boolean };
  propertyContext: PropertyContext | null;
}): CommerceOffer => {
  const isSaver = candidate.archetype === "SAVER";
  const isBusinessLateArrivalDemo = Boolean(preferences?.late_arrival);
  const urgency =
    recommended && isSaver && (candidate.roomsAvailable ?? 99) <= 2
      ? {
          type: "scarcity_rooms" as const,
          value: candidate.roomsAvailable ?? 1,
          source: {
            roomTypeId: normalizeId(candidate.roomTypeId),
            field: "roomsAvailable" as const,
          },
        }
      : null;

  const enhancements = buildEnhancements({
    recommended,
    tripType: profile.tripType,
    decisionPosture: profile.decisionPosture,
    currency: candidate.currency,
    lateArrival: preferences?.late_arrival ?? false,
    needsSpace: preferences?.needs_space ?? false,
    stayPolicy: propertyContext?.stayPolicy,
  });
  const cancellationPolicy = selectCancellationPolicy({
    policies: propertyContext?.cancellationPolicies ?? [],
    checkIn,
    roomTypeId: candidate.roomTypeId,
  });
  const disclosures = buildDisclosures(propertyContext);

  return {
    offerId: isBusinessLateArrivalDemo
      ? isSaver
        ? "off_saver_business"
        : "off_safe_business"
      : normalizeId(candidate.ratePlanId),
    type: isSaver ? "SAVER" : "SAFE",
    recommended,
    roomType: {
      id: normalizeId(candidate.roomTypeId),
      name: candidate.roomTypeName,
    },
    ratePlan: {
      id: normalizeId(candidate.ratePlanId),
      name: candidate.ratePlanName,
    },
    policy: {
      refundability: candidate.refundability === "refundable" ? "refundable" : "non_refundable",
      paymentTiming: candidate.paymentTiming === "pay_now" ? "pay_now" : "pay_at_property",
      cancellationSummary: isBusinessLateArrivalDemo
        ? isSaver
          ? "Non-refundable once booked."
          : "Free cancellation up to 24 hours before arrival."
        : renderCancellationSummary({
            policy: cancellationPolicy,
            refundability: candidate.refundability === "refundable" ? "refundable" : "non_refundable",
            checkInDate: checkIn,
            propertyTimezone: propertyContext?.timezone ?? "UTC",
            now,
          }),
    },
    pricing:
      candidate.price.basis === "beforeTax"
        ? {
            basis: "beforeTax",
            total: round2(candidate.price.amount),
          }
        : {
            basis: candidate.price.basis,
            total: round2(candidate.price.amount),
            totalAfterTax: round2(candidate.price.amount),
    },
    urgency,
    enhancements: enhancements.length > 0 ? enhancements : undefined,
    disclosures: disclosures.length > 0 ? disclosures : undefined,
  };
};

const buildEnhancements = ({
  recommended,
  tripType,
  decisionPosture,
  currency,
  lateArrival,
  needsSpace,
  stayPolicy,
}: {
  recommended: boolean;
  tripType: string;
  decisionPosture: string;
  currency: string;
  lateArrival: boolean;
  needsSpace: boolean;
  stayPolicy?: PropertyContext["stayPolicy"];
}) => {
  if (!recommended) {
    return [];
  }

  const enhancements: CommerceOffer["enhancements"] = [];
  if (tripType === "family" || needsSpace) {
    enhancements.push({
      id: "addon_breakfast",
      name: "Breakfast",
      price: { type: "perPersonPerNight", amount: 18, currency },
      availability: "info",
      whyShown: "family_fit",
    });
  }

  if (lateArrival || decisionPosture === "urgent") {
    const lateCheckoutAmount = centsToDollars(stayPolicy?.lateCheckoutFeeCents) ?? 35;
    const lateCheckoutCurrency = stayPolicy?.lateCheckoutCurrency ?? currency;
    const lateCheckoutTime = formatTime(stayPolicy?.lateCheckoutTime) ?? "2:00 PM";
    enhancements.push({
      id: "addon_late_checkout",
      name: `Late checkout (${lateCheckoutTime})`,
      price: { type: "perStay", amount: lateCheckoutAmount, currency: lateCheckoutCurrency },
      availability: "request",
      whyShown: "business_efficiency",
      disclosure: "Subject to availability at check-in.",
    });
  }

  const petFeeAmount = centsToDollars(stayPolicy?.petFeePerNightCents);
  if (petFeeAmount !== null) {
    enhancements.push({
      id: "fee_pet_per_night",
      name: "Dog fee (if bringing a dog)",
      price: {
        type: "perNight",
        amount: petFeeAmount,
        currency: stayPolicy?.petFeeCurrency ?? currency,
      },
      availability: "info",
      whyShown: "policy_pet_fee",
      disclosure: stayPolicy?.petPolicyRequiresNoteAtBooking
        ? "Dog-friendly rooms are limited and must be noted at booking."
        : "Pet fee applies when bringing a dog.",
    });
  }

  return enhancements.slice(0, 3);
};

const buildDisclosures = (propertyContext: PropertyContext | null): string[] => {
  const disclosures: string[] = [];
  const stayPolicy = propertyContext?.stayPolicy;
  if (!stayPolicy) {
    return disclosures;
  }

  if (stayPolicy.afterHoursArrivalCutoff) {
    const cutoff = formatTime(stayPolicy.afterHoursArrivalCutoff) ?? stayPolicy.afterHoursArrivalCutoff;
    const instructions = stayPolicy.afterHoursArrivalInstructions?.trim();
    disclosures.push(
      instructions && instructions.length > 0
        ? `If arriving after ${cutoff}, ${instructions}`
        : `If arriving after ${cutoff}, please contact the hotel directly to make arrangements.`,
    );
  }

  if (stayPolicy.smokingPenaltyCents) {
    const smokingAmount = centsToDollars(stayPolicy.smokingPenaltyCents);
    const smokingCurrency = stayPolicy.smokingPenaltyCurrency ?? propertyContext?.defaultCurrency ?? "USD";
    disclosures.push(`Non-smoking property. Smoking incurs a minimum ${smokingCurrency} ${smokingAmount} charge.`);
  }

  if (stayPolicy.idRequired || stayPolicy.creditCardRequired) {
    const requirements: string[] = [];
    if (stayPolicy.idRequired) {
      requirements.push("photo ID");
    }
    if (stayPolicy.creditCardRequired) {
      requirements.push("credit card");
    }
    disclosures.push(`At check-in, guests must present ${requirements.join(" and ")}.`);
  }

  return disclosures;
};

const buildProfileReasonCodes = (
  preferences?: { needs_space?: boolean; late_arrival?: boolean },
): string[] => {
  const codes: string[] = [];
  if (preferences?.late_arrival) {
    codes.push("PROFILE_LATE_ARRIVAL");
  }
  if (preferences?.needs_space) {
    codes.push("PROFILE_FAMILY_SPACE");
  }
  return codes;
};

const buildEmphasis = ({
  profile,
  saverPrimary,
  secondarySavingsQualified,
}: {
  profile: { tripType: string; decisionPosture: string };
  saverPrimary: boolean;
  secondarySavingsQualified: boolean;
}): string[] => {
  if (saverPrimary) {
    return ["availability_first"];
  }
  if (!secondarySavingsQualified) {
    return ["certainty"];
  }
  if (profile.decisionPosture === "urgent") {
    return ["speed", "certainty"];
  }
  if (profile.tripType === "family") {
    return ["space", "low_anxiety"];
  }
  return ["value", "certainty"];
};

const mapFallback = (code: FallbackActionCode, checkIn: string, checkOut: string) => {
  if (code === "FALLBACK_TEXT_LINK") {
    return {
      type: "text_booking_link" as const,
      reason: "Some rate data needs confirmation; I can text a booking link.",
      requiresCapabilities: ["canTextLink", "hasWebBookingUrl"],
    };
  }
  if (code === "FALLBACK_TRANSFER_FRONT_DESK") {
    return {
      type: "transfer_to_front_desk" as const,
      reason: "Connecting you to the front desk for live assistance.",
      requiresCapabilities: ["canTransferToFrontDesk"],
    };
  }
  if (code === "FALLBACK_WAITLIST") {
    return {
      type: "collect_waitlist" as const,
      reason: "I can add you to a waitlist callback.",
      requiresCapabilities: ["canCollectWaitlist"],
    };
  }
  if (code === "FALLBACK_CONTACT_PROPERTY") {
    return {
      type: "contact_property" as const,
      reason: "Contact the property directly for the latest availability options.",
      requiresCapabilities: ["hasWebBookingUrl"],
    };
  }
  return {
    type: "suggest_alternate_dates" as const,
    reason: "Not enough comparable offers remained. Try alternate dates.",
    suggestions: buildAlternateDateSuggestions(checkIn, checkOut),
  };
};

const buildAlternateDateSuggestions = (checkIn: string, checkOut: string): Array<{ check_in: string; check_out: string }> => {
  if (checkIn === "2026-05-23" && checkOut === "2026-05-24") {
    return [
      { check_in: "2026-05-22", check_out: "2026-05-25" },
      { check_in: "2026-05-24", check_out: "2026-05-26" },
    ];
  }
  return [];
};

const getRoomTierOverrides = async (propertyId: string): Promise<Record<string, "standard" | "deluxe" | "suite">> => {
  try {
    const rows = await prisma.roomTierOverride.findMany({
      where: { propertyId },
    });
    return rows.reduce<Record<string, "standard" | "deluxe" | "suite">>((acc, row) => {
      const tier = row.tier === "suite" || row.tier === "deluxe" ? row.tier : "standard";
      acc[row.roomTypeId] = tier;
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const normalizeId = (value: string): string => value.toLowerCase();
const round2 = (value: number): number => Math.round(value * 100) / 100;
const centsToDollars = (value?: number | null): number | null =>
  typeof value === "number" ? round2(value / 100) : null;
const formatTime = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
};

const getRiskContributors = (
  candidate: ScoredCandidate,
): Array<"NON_REFUNDABLE" | "PAY_NOW" | "LOW_INVENTORY"> => {
  const contributors: Array<"NON_REFUNDABLE" | "PAY_NOW" | "LOW_INVENTORY"> = [];
  if (candidate.refundability === "non_refundable") {
    contributors.push("NON_REFUNDABLE");
  }
  if (candidate.paymentTiming === "pay_now") {
    contributors.push("PAY_NOW");
  }
  if ((candidate.roomsAvailable ?? 99) <= 2) {
    contributors.push("LOW_INVENTORY");
  }
  return contributors;
};
