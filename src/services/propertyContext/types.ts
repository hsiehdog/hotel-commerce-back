import type { CancellationPenaltyType } from "@prisma/client";

export type PropertyContext = {
  propertyId: string;
  timezone: string;
  defaultCurrency: string;
  name?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  content?: {
    overviewMarketing?: string | null;
    neighborhoodHighlights?: unknown;
    vibeTags: string[];
  };
  amenities: Array<{
    key: string;
    detailsJson?: unknown;
  }>;
  stayPolicy?: {
    checkInTime?: string | null;
    checkOutTime?: string | null;
    lateCheckoutTime?: string | null;
    lateCheckoutFeeCents?: number | null;
    lateCheckoutCurrency?: string | null;
    afterHoursArrivalCutoff?: string | null;
    afterHoursArrivalInstructions?: string | null;
    smokingPenaltyCents?: number | null;
    smokingPenaltyCurrency?: string | null;
    petFeePerNightCents?: number | null;
    petFeeCurrency?: string | null;
    petPolicyRequiresNoteAtBooking: boolean;
    dogFriendlyRoomsLimited: boolean;
    idRequired: boolean;
    creditCardRequired: boolean;
    termsText?: string | null;
  };
  cancellationPolicies: PropertyCancellationPolicyRule[];
};

export type PropertyCancellationPolicyRule = {
  id: string;
  name: string;
  appliesToRoomTypeIds: string[];
  effectiveStartMonthDay?: string | null;
  effectiveEndMonthDay?: string | null;
  freeCancelDaysBefore: number;
  freeCancelCutoffTime: string;
  penaltyType: CancellationPenaltyType;
  penaltyValue?: number | null;
  chargeHoursBeforeArrival?: number | null;
  policyTextLong?: string | null;
  policySummaryTemplate?: string | null;
  priority: number;
};
