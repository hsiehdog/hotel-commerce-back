const REASON_CODE_COPY: Record<string, string> = {
  NORMALIZE_OCCUPANCY_DISTRIBUTED: "Distributed guest occupancy across rooms for v1 room-fit evaluation.",
  FILTER_OCCUPANCY: "Excluded room types with maxOccupancy below the party size.",
  FILTER_ACCESSIBILITY: "Filtered out room types that do not satisfy requested accessibility.",
  FILTER_RESTRICTIONS: "Filtered out candidates failing stay restrictions.",
  FILTER_CURRENCY_MISMATCH: "Invalidated candidates with currency mismatch (no FX in v1).",
  FILTER_PRICE_MISSING: "Removed candidates missing valid pricing basis.",
  SELECT_PRIMARY_SAFE: "Selected refundable primary offer for conversion stability.",
  SELECT_PRIMARY_SAVER_ONLY_AVAILABLE: "Selected saver primary because no comparable SAFE primary was available.",
  PROFILE_LATE_ARRIVAL_PRIMARY_SAFE: "Selected refundable as primary due to short lead time / higher change risk.",
  SELECT_PRIMARY_SAVER_EXCEPTION_LOW_INVENTORY:
    "Saver-primary exception applied due to low inventory and large price delta.",
  SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE: "Could not find an eligible second offer in the opposite archetype.",
  SECONDARY_SAME_ARCHETYPE_FALLBACK:
    "Used a second option from the same archetype because an opposite-archetype option was unavailable.",
  SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL: "Price spread guardrail prevented selecting a second offer.",
  SECONDARY_SAVER_LOW_SAVINGS: "Saver secondary kept for contrast, but savings are not emphasized.",
  SELECT_SECONDARY_SAVER: "Selected saver secondary to present a clear policy/price tradeoff.",
  SELECT_SECONDARY_SAFE: "Selected safe secondary to present a flexibility tradeoff.",
  FALLBACK_ALTERNATE_DATES: "Returning alternate date guidance because two comparable offers were unavailable.",
  FALLBACK_TEXT_LINK: "Returning booking link fallback to confirm exact pricing.",
  FALLBACK_TRANSFER_FRONT_DESK: "Returning front desk transfer fallback based on capabilities/hours.",
  FALLBACK_WAITLIST: "Returning waitlist callback fallback.",
  FALLBACK_CONTACT_PROPERTY: "Returning contact-property fallback for web flow.",
  PROFILE_LATE_ARRIVAL: "Late arrival noted; did not refetch ARI (merchandising-only signal).",
  PROFILE_FAMILY_SPACE: "Family/space profile influenced presentation and enhancements.",
  ENHANCEMENT_ATTACHED: "Attached late checkout as request-only enhancement (inventory constrained).",
};

export const reasonCodesToCopy = (reasonCodes: string[]): string[] =>
  reasonCodes.map((code) => REASON_CODE_COPY[code]).filter((line): line is string => Boolean(line));
