import type { AriSnapshot } from "../../ai/ariSnapshot";
import { calendarDayDiff } from "../../utils/dateTime";
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
      roomTypeDescription: roomType.roomTypeDescription,
      features: roomType.features,
      isAccessible: roomType.isAccessible,
      maxOccupancy: roomType.maxOccupancy,
      roomsAvailable: roomType.roomsAvailable,
      totalInventory: roomType.totalInventory ?? null,
      ratePlans: roomType.ratePlans.map((plan) => ({
        ratePlanId: plan.ratePlanId,
        ratePlanName: plan.ratePlanName,
        refundability: plan.refundability,
        paymentTiming: plan.paymentTiming === "PAY_NOW" ? "PAY_NOW" : "PAY_LATER",
        currency: plan.currency ?? raw.currency,
        cancellationPolicy: {
          freeCancelUntil: plan.cancellationPolicy.freeCancelUntil,
          penaltyDescription: plan.cancellationPolicy.type === "NO_REFUND" ? "Non-refundable." : undefined,
        },
        pricing: {
          nightly: plan.detailedRates.map((rate) => ({
            date: rate.date,
            baseRate: rate.rate,
          })),
          totalBeforeTax: plan.totalRate ?? null,
          taxesAndFees: plan.taxesAndFees ?? null,
          totalAfterTax:
            typeof plan.totalAfterTax === "number"
              ? round2(plan.totalAfterTax)
              : typeof plan.totalRate === "number" && typeof plan.taxesAndFees === "number"
                ? round2(plan.totalRate + plan.taxesAndFees)
                : null,
          includedFees: plan.includedFees
            ? {
                petFeePerNight: plan.includedFees.petFeePerNight,
                parkingFeePerNight: plan.includedFees.parkingFeePerNight,
              }
            : undefined,
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
  return Math.max(1, calendarDayDiff(end, start));
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
