import type { RatePlanSnapshot, RoomTypeSnapshot } from "../../ai/ariSnapshot";
import { calendarDayDiff, getLocalDayAndMinutes } from "../../utils/dateTime";
import {
  ATTRIBUTION_TIME_WINDOW_HOURS,
  DATE_SHIFT_TOLERANCE_DAYS,
  LOW_INVENTORY_THRESHOLD,
  OCCUPANCY_THRESHOLD,
  PRICE_DELTA_MAX_ABSOLUTE,
  PRICE_DELTA_MAX_PERCENT,
  SAVER_PRIMARY_PRICE_DELTA_THRESHOLD,
  type StrategyMode,
} from "./commercePolicyV1";

export type PriceBasisUsed = "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";

export type ResolvedPlanPricing = {
  total: number;
  subtotal: number;
  taxesAndFees: number;
  basis: PriceBasisUsed;
  degradedPriceControls: boolean;
};

export type OfferCandidate = {
  roomType: RoomTypeSnapshot;
  plan: RatePlanSnapshot;
  currency: string;
  pricing: ResolvedPlanPricing;
};

export type PropertyCapabilityProfile = {
  canTextLink: boolean;
  canTransferToFrontDesk: boolean;
  canCollectWaitlist: boolean;
  hasWebBookingUrl: boolean;
};

export type FallbackAction =
  | "send_booking_link"
  | "transfer_to_front_desk"
  | "collect_waitlist"
  | "suggest_alternate_dates";

export type PropertyFrontDeskHoursInterval = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
};

export type BookingClickEvent = {
  callId: string;
  quoteToken: string;
  propertyId: string;
  clickedAt: Date;
  checkIn: string;
  nights: number;
  partySize: number;
};

export type BookingRecordForAttribution = {
  propertyId: string;
  bookedAt: Date;
  checkIn: string;
  nights: number;
  partySize: number;
};

export const resolvePlanPricing = (plan: RatePlanSnapshot): ResolvedPlanPricing | null => {
  const pricing = plan.pricing;
  const totalAfterTax = toFiniteNumber(pricing.totalAfterTax);
  if (totalAfterTax !== null) {
    return {
      total: totalAfterTax,
      subtotal: toFiniteNumber(pricing.totalBeforeTax) ?? totalAfterTax,
      taxesAndFees: toFiniteNumber(pricing.taxesAndFees) ?? 0,
      basis: "afterTax",
      degradedPriceControls: false,
    };
  }

  const totalBeforeTax = toFiniteNumber(pricing.totalBeforeTax);
  const taxesAndFees = toFiniteNumber(pricing.taxesAndFees);
  if (totalBeforeTax !== null && taxesAndFees !== null) {
    return {
      total: round2(totalBeforeTax + taxesAndFees),
      subtotal: totalBeforeTax,
      taxesAndFees,
      basis: "beforeTaxPlusTaxes",
      degradedPriceControls: false,
    };
  }

  if (totalBeforeTax !== null) {
    return {
      total: totalBeforeTax,
      subtotal: totalBeforeTax,
      taxesAndFees: 0,
      basis: "beforeTax",
      degradedPriceControls: true,
    };
  }

  return null;
};

export const currencyMatchesRequest = (candidateCurrency: string, requestCurrency: string): boolean =>
  candidateCurrency === requestCurrency;

export const withinPriceDeltaGuardrail = (
  strategy: StrategyMode,
  primaryTotal: number,
  secondaryTotal: number,
): boolean => {
  const delta = Math.abs(primaryTotal - secondaryTotal);
  const minAmount = Math.max(0.01, Math.min(primaryTotal, secondaryTotal));
  const deltaPercent = (delta / minAmount) * 100;
  return (
    deltaPercent <= PRICE_DELTA_MAX_PERCENT[strategy] &&
    delta <= PRICE_DELTA_MAX_ABSOLUTE[strategy]
  );
};

export const estimateOccupancy = (roomType: RoomTypeSnapshot): number | null => {
  const totalInventory = toFiniteNumber(roomType.totalInventory);
  if (totalInventory === null || totalInventory <= 0) {
    return null;
  }
  return 1 - roomType.roomsAvailable / totalInventory;
};

export const canUseSaverPrimaryException = ({
  roomType,
  refundableTotal,
  saverTotal,
  shouldUseStrictPriceControls,
}: {
  roomType: RoomTypeSnapshot;
  refundableTotal: number;
  saverTotal: number;
  shouldUseStrictPriceControls: boolean;
}): boolean => {
  if (!shouldUseStrictPriceControls) {
    return false;
  }

  const lowInventory = roomType.roomsAvailable <= LOW_INVENTORY_THRESHOLD;
  const occupancy = estimateOccupancy(roomType);
  const compressed = occupancy !== null && occupancy >= OCCUPANCY_THRESHOLD;
  if (!lowInventory && !compressed) {
    return false;
  }

  if (refundableTotal <= 0 || refundableTotal <= saverTotal) {
    return false;
  }

  const delta = (refundableTotal - saverTotal) / refundableTotal;
  return delta >= SAVER_PRIMARY_PRICE_DELTA_THRESHOLD;
};

export const resolveFallbackAction = ({
  capabilities,
  isBusinessHours,
}: {
  capabilities: PropertyCapabilityProfile;
  isBusinessHours: boolean;
}): FallbackAction => {
  if (capabilities.hasWebBookingUrl) {
    return "send_booking_link";
  }
  if (capabilities.canTransferToFrontDesk && isBusinessHours) {
    return "transfer_to_front_desk";
  }
  if (capabilities.canCollectWaitlist) {
    return "collect_waitlist";
  }
  return "suggest_alternate_dates";
};

export const isPropertyOpenAt = ({
  nowUtc,
  timezone,
  intervals,
}: {
  nowUtc: Date;
  timezone: string;
  intervals: PropertyFrontDeskHoursInterval[];
}): boolean => {
  if (intervals.length === 0) {
    return false;
  }

  const local = getLocalParts(nowUtc, timezone);
  const todayIntervals = intervals.filter((interval) => interval.dayOfWeek === local.dayOfWeek);
  if (todayIntervals.some((interval) => isOpenInCurrentDayInterval(local.minutesOfDay, interval))) {
    return true;
  }

  const previousDay = (local.dayOfWeek + 6) % 7;
  const previousOvernight = intervals.filter((interval) => {
    if (interval.dayOfWeek !== previousDay) {
      return false;
    }
    const open = parseTime(interval.openTime);
    const close = parseTime(interval.closeTime);
    if (open === null || close === null) {
      return false;
    }
    return open > close;
  });

  return previousOvernight.some((interval) => {
    const close = parseTime(interval.closeTime);
    return close !== null && local.minutesOfDay < close;
  });
};

export const resolveAttributedClick = ({
  clicks,
  booking,
}: {
  clicks: BookingClickEvent[];
  booking: BookingRecordForAttribution;
}): BookingClickEvent | null => {
  const windowStart = booking.bookedAt.getTime() - ATTRIBUTION_TIME_WINDOW_HOURS * 60 * 60 * 1000;
  const candidates = clicks
    .filter((click) => {
      const clickedAt = click.clickedAt.getTime();
      return (
        click.propertyId === booking.propertyId &&
        clickedAt >= windowStart &&
        clickedAt <= booking.bookedAt.getTime()
      );
    })
    .sort((a, b) => b.clickedAt.getTime() - a.clickedAt.getTime());

  const matched = candidates.find((click) => {
    if (click.partySize !== booking.partySize) {
      return false;
    }

    if (click.nights !== booking.nights) {
      return false;
    }

    return dateDifferenceDays(click.checkIn, booking.checkIn) <= DATE_SHIFT_TOLERANCE_DAYS;
  });

  return matched ?? null;
};

const getLocalParts = (nowUtc: Date, timezone: string): { dayOfWeek: number; minutesOfDay: number } => {
  return getLocalDayAndMinutes(nowUtc, timezone);
};

const isOpenInCurrentDayInterval = (minutesOfDay: number, interval: PropertyFrontDeskHoursInterval): boolean => {
  const open = parseTime(interval.openTime);
  const close = parseTime(interval.closeTime);
  if (open === null || close === null) {
    return false;
  }
  if (open === 0 && close === 0) {
    return true;
  }
  if (open <= close) {
    return minutesOfDay >= open && minutesOfDay < close;
  }
  return minutesOfDay >= open || minutesOfDay < close;
};

const parseTime = (value: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
};

const dateDifferenceDays = (left: string, right: string): number => {
  return Math.abs(calendarDayDiff(left, right));
};

const toFiniteNumber = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
