import type { AriSnapshot } from "../../ai/ariSnapshot";
import type { CloudbedsAriRaw } from "./cloudbedsClient";

export const normalizeAriRawToSnapshot = (raw: CloudbedsAriRaw): AriSnapshot => {
  const nights = diffDays(raw.startDate, raw.endDate);

  return {
    propertyId: raw.propertyId,
    currency: raw.currency,
    checkIn: raw.startDate,
    checkOut: raw.endDate,
    nights,
    roomTypes: raw.roomTypes.map((roomType) => ({
      roomTypeId: roomType.roomTypeId,
      roomTypeName: roomType.roomTypeName,
      maxOccupancy: roomType.maxOccupancy,
      roomsAvailable: roomType.roomsAvailable,
      ratePlans: roomType.ratePlans.map((plan) => ({
        ratePlanId: plan.ratePlanId,
        ratePlanName: plan.ratePlanName,
        refundability: plan.refundability,
        paymentTiming: plan.paymentTiming === "PAY_NOW" ? "PAY_NOW" : "PAY_LATER",
        cancellationPolicy: {
          freeCancelUntil: plan.cancellationPolicy.freeCancelUntil,
          penaltyDescription: plan.cancellationPolicy.type === "NO_REFUND" ? "Non-refundable." : undefined,
        },
        pricing: {
          nightly: plan.detailedRates.map((rate) => ({
            date: rate.date,
            baseRate: rate.rate,
          })),
          totalBeforeTax: plan.totalRate,
          taxesAndFees: plan.taxesAndFees,
          totalAfterTax: round2(plan.totalRate + plan.taxesAndFees),
        },
        restrictions: {
          minLos: plan.detailedRates.reduce((max, rate) => Math.max(max, rate.minLos), 1),
          cta: plan.detailedRates.some((rate) => rate.cta),
          ctd: plan.detailedRates.some((rate) => rate.ctd),
        },
      })),
    })),
  };
};

const diffDays = (start: string, end: string): number => {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
