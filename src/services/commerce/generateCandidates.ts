import type { AriSnapshot } from "../../ai/ariSnapshot";
import type { Candidate } from "./types";

export const generateCandidates = (
  snapshot: AriSnapshot,
): Candidate[] => {
  const candidates: Candidate[] = [];

  for (const roomType of snapshot.roomTypes) {
    const roomTier = resolveRoomTier(roomType.roomTypeName);
    for (const plan of roomType.ratePlans) {
      const pricing = resolveCandidatePricing(plan.pricing);
      const includedFees = plan.pricing.includedFees
        ? {
            petFeePerNight: plan.pricing.includedFees.petFeePerNight,
            parkingFeePerNight: plan.pricing.includedFees.parkingFeePerNight,
          }
        : undefined;
      if (!pricing) {
        candidates.push({
          roomTypeId: roomType.roomTypeId,
          roomTypeName: roomType.roomTypeName,
          roomTypeDescription: roomType.roomTypeDescription,
          features: roomType.features,
          isAccessible: roomType.isAccessible,
          roomsAvailable: roomType.roomsAvailable,
          maxOccupancy: roomType.maxOccupancy,
          roomTier,
          ratePlanId: plan.ratePlanId,
          ratePlanName: plan.ratePlanName,
          currency: plan.currency ?? snapshot.currency,
          price: {
            amount: NaN,
            basis: "beforeTax",
            includedFees,
          },
          refundability: toRefundability(plan.refundability),
          paymentTiming: toPaymentTiming(plan.paymentTiming),
          closedToArrival: plan.restrictions.cta,
          closedToDeparture: plan.restrictions.ctd,
          minLengthOfStay: plan.restrictions.minLos,
          maxLengthOfStay: plan.restrictions.maxLos,
        });
        continue;
      }

      candidates.push({
        roomTypeId: roomType.roomTypeId,
        roomTypeName: roomType.roomTypeName,
        roomTypeDescription: roomType.roomTypeDescription,
        features: roomType.features,
        isAccessible: roomType.isAccessible,
        roomsAvailable: roomType.roomsAvailable,
        maxOccupancy: roomType.maxOccupancy,
        roomTier,
        ratePlanId: plan.ratePlanId,
        ratePlanName: plan.ratePlanName,
        currency: plan.currency ?? snapshot.currency,
        price: {
          ...pricing,
          ...(includedFees ? { includedFees } : {}),
        },
        refundability: toRefundability(plan.refundability),
        paymentTiming: toPaymentTiming(plan.paymentTiming),
        closedToArrival: plan.restrictions.cta,
        closedToDeparture: plan.restrictions.ctd,
        minLengthOfStay: plan.restrictions.minLos,
        maxLengthOfStay: plan.restrictions.maxLos,
      });
    }
  }

  return candidates;
};

const resolveCandidatePricing = (
  pricing: {
    nightly: { date: string; baseRate: number }[];
    totalBeforeTax?: number | null;
    taxesAndFees?: number | null;
    totalAfterTax?: number | null;
  },
): Candidate["price"] | null => {
  if (typeof pricing.totalAfterTax === "number" && Number.isFinite(pricing.totalAfterTax)) {
    const subtotal =
      typeof pricing.totalBeforeTax === "number" && Number.isFinite(pricing.totalBeforeTax)
        ? round2(pricing.totalBeforeTax)
        : null;
    const taxes =
      typeof pricing.taxesAndFees === "number" && Number.isFinite(pricing.taxesAndFees)
        ? round2(pricing.taxesAndFees)
        : subtotal !== null
          ? round2(Math.max(0, pricing.totalAfterTax - subtotal))
          : null;
    return {
      amount: pricing.totalAfterTax,
      basis: "afterTax",
      ...(subtotal !== null ? { subtotal } : {}),
      ...(taxes !== null ? { taxesAndFees: taxes } : {}),
      nightly: pricing.nightly.map((nightly) => ({ date: nightly.date, amount: nightly.baseRate })),
    };
  }
  if (
    typeof pricing.totalBeforeTax === "number" &&
    Number.isFinite(pricing.totalBeforeTax) &&
    typeof pricing.taxesAndFees === "number" &&
    Number.isFinite(pricing.taxesAndFees)
  ) {
    return {
      amount: round2(pricing.totalBeforeTax + pricing.taxesAndFees),
      basis: "beforeTaxPlusTaxes",
      subtotal: round2(pricing.totalBeforeTax),
      taxesAndFees: round2(pricing.taxesAndFees),
      nightly: pricing.nightly.map((nightly) => ({ date: nightly.date, amount: nightly.baseRate })),
    };
  }
  if (typeof pricing.totalBeforeTax === "number" && Number.isFinite(pricing.totalBeforeTax)) {
    return {
      amount: pricing.totalBeforeTax,
      basis: "beforeTax",
      subtotal: round2(pricing.totalBeforeTax),
      taxesAndFees: 0,
      nightly: pricing.nightly.map((nightly) => ({ date: nightly.date, amount: nightly.baseRate })),
    };
  }
  return null;
};

const toRefundability = (value: "REFUNDABLE" | "NON_REFUNDABLE" | "PARTIAL"): Candidate["refundability"] => {
  if (value === "REFUNDABLE") {
    return "refundable";
  }
  if (value === "NON_REFUNDABLE") {
    return "non_refundable";
  }
  return "unknown";
};

const toPaymentTiming = (value: "PAY_NOW" | "PAY_LATER"): Candidate["paymentTiming"] => {
  if (value === "PAY_NOW") {
    return "pay_now";
  }
  if (value === "PAY_LATER") {
    return "pay_at_property";
  }
  return "unknown";
};

const resolveRoomTier = (roomTypeName: string): "standard" | "deluxe" | "suite" => {
  const normalized = roomTypeName.toLowerCase();
  if (containsAny(normalized, ["suite", "junior suite", "studio", "penthouse"])) {
    return "suite";
  }
  if (containsAny(normalized, ["deluxe", "premium", "executive", "luxury", "superior"])) {
    return "deluxe";
  }
  return "standard";
};

const containsAny = (text: string, terms: string[]): boolean => terms.some((term) => text.includes(term));
const round2 = (value: number): number => Math.round(value * 100) / 100;
