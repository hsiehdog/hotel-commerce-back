import { OfferIntent } from "./offerIntent";
import { calendarDayDiff } from "../utils/dateTime";
import { formatDateForSpeech, normalizeCheckOut, normalizeDate } from "./dateResolution";
import { coerceOfferSlotsInput, type OfferSlotsInput } from "../offers/offerSchema";
import { type PriceBasisUsed } from "../services/commerce/commerceEvaluators";
import { type StrategyMode } from "../services/commerce/commercePolicyV1";
export type GetOffersToolArgs = OfferSlotsInput;

export type ToolValidationResult =
  | {
      status: "OK";
      slots: OfferIntent;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      missingFields: string[];
      clarificationPrompt: string;
      slots: OfferIntent;
    };

export type OfferOption = {
  id: string;
  name: string;
  description: string;
  rate_type: "flexible" | "non_refundable";
  cancellation_policy: string;
  payment_policy: string;
  price: {
    currency: string;
    per_night: number;
    subtotal: number;
    taxes_and_fees: number;
    total: number;
  };
  commerce_metadata?: {
    priceBasisUsed: PriceBasisUsed;
    degradedPriceControls: boolean;
    isPrimary: boolean;
    strategyMode: StrategyMode;
    saverPrimaryExceptionApplied: boolean;
    roomTypeId: string;
    roomTypeName: string;
    ratePlanId: string;
    ratePlanName: string;
    roomsAvailable: number;
  };
};

export const resolveOfferSlots = (
  current: OfferIntent,
  rawArgs: unknown,
  now: Date = new Date(),
): ToolValidationResult => {
  const incoming = coerceArgs(rawArgs);
  const hasUpdates = hasSlotUpdates(current, incoming);
  const merged = mergeIntent(current, incoming);

  const { intent: withDefaults, missingFields } = applyDefaultsAndMissing(merged);

  const checkInResult = normalizeDate(withDefaults.check_in, now, withDefaults.property_timezone, "check_in");
  if (checkInResult.status === "ambiguous") {
    return buildClarification(withDefaults, ["check_in"], checkInResult.prompt);
  }

  const resolvedCheckIn = checkInResult.value;

  const checkOutResult = normalizeCheckOut(
    withDefaults.check_out,
    withDefaults.nights,
    resolvedCheckIn,
    now,
    withDefaults.property_timezone,
  );
  if (checkOutResult.status === "ambiguous") {
    return buildClarification(withDefaults, ["check_out"], checkOutResult.prompt);
  }

  const resolvedCheckOut = checkOutResult.value;

  const finalIntent: OfferIntent = {
    ...withDefaults,
    check_in: resolvedCheckIn,
    check_out: resolvedCheckOut,
    nights: checkOutResult.nights ?? withDefaults.nights,
  };

  const missingRequired = missingFields.filter((field) =>
    ["check_in", "check_out", "adults", "rooms"].includes(field),
  );

  if (missingRequired.length > 0) {
    return buildClarification(finalIntent, missingRequired, buildMissingPrompt(missingRequired));
  }

  if (resolvedCheckIn && resolvedCheckOut && resolvedCheckOut <= resolvedCheckIn) {
    return buildClarification(
      finalIntent,
      ["check_in", "check_out"],
      `Just to confirm, is your check-in ${resolvedCheckIn} and check-out ${resolvedCheckOut}?`,
    );
  }

  if (finalIntent.confirmation_pending) {
    if (hasUpdates) {
      return buildClarification(
        { ...finalIntent, confirmation_pending: true },
        [],
        buildConfirmationPrompt(finalIntent),
      );
    }

    return {
      status: "OK",
      slots: { ...finalIntent, confirmation_pending: false },
    };
  }

  return buildClarification(
    { ...finalIntent, confirmation_pending: true },
    [],
    buildConfirmationPrompt(finalIntent),
  );
};

const buildClarification = (slots: OfferIntent, missingFields: string[], clarificationPrompt: string): ToolValidationResult => ({
  status: "NEEDS_CLARIFICATION",
  missingFields,
  clarificationPrompt,
  slots,
});

const buildMissingPrompt = (missingFields: string[]): string => {
  if (missingFields.includes("check_in") || missingFields.includes("check_out")) {
    if (missingFields.includes("check_out") && !missingFields.includes("check_in")) {
      return "Great. How many nights, or what's your check-out date?";
    }
    return "Sure - what check-in and check-out dates are you considering?";
  }

  if (missingFields.includes("adults") || missingFields.includes("rooms")) {
    return "Got it. How many adults, and how many rooms?";
  }

  return "Could you clarify the details?";
};

const applyDefaultsAndMissing = (intent: OfferIntent): { intent: OfferIntent; missingFields: string[] } => {
  const missingFields: string[] = [];
  const next = { ...intent };

  if (!next.rooms) {
    next.rooms = 1;
  }

  if (next.children === null || typeof next.children === "undefined") {
    next.children = 0;
  }

  if (!next.check_in) {
    missingFields.push("check_in");
  }

  if (!next.check_out && !next.nights) {
    missingFields.push("check_out");
  }

  if (!next.adults) {
    missingFields.push("adults");
  }

  if (!next.rooms) {
    missingFields.push("rooms");
  }

  return { intent: next, missingFields };
};


const coerceArgs = (rawArgs: unknown): GetOffersToolArgs => {
  return coerceOfferSlotsInput(rawArgs);
};

const mergeIntent = (current: OfferIntent, incoming: GetOffersToolArgs): OfferIntent => ({
  ...current,
  check_in: incoming.check_in ?? current.check_in,
  check_out: incoming.check_out ?? current.check_out,
  nights: typeof incoming.nights === "number" ? incoming.nights : current.nights,
  adults: typeof incoming.adults === "number" ? incoming.adults : current.adults,
  rooms: typeof incoming.rooms === "number" ? incoming.rooms : current.rooms,
  children: typeof incoming.children === "number" ? incoming.children : current.children,
  pet_friendly: typeof incoming.pet_friendly === "boolean" ? incoming.pet_friendly : current.pet_friendly,
  accessible_room: typeof incoming.accessible_room === "boolean" ? incoming.accessible_room : current.accessible_room,
  needs_two_beds: typeof incoming.needs_two_beds === "boolean" ? incoming.needs_two_beds : current.needs_two_beds,
  budget_cap: typeof incoming.budget_cap === "number" ? incoming.budget_cap : current.budget_cap,
  parking_needed: typeof incoming.parking_needed === "boolean" ? incoming.parking_needed : current.parking_needed,
  stub_scenario: typeof incoming.stub_scenario === "string" ? incoming.stub_scenario : current.stub_scenario,
});

export const buildSlotSpeech = (slots: OfferIntent, offers: OfferOption[]): string => {
  const spokenCheckIn = slots.check_in
    ? formatDateForSpeech(slots.check_in, slots.property_timezone)
    : "null";
  const spokenCheckOut = slots.check_out
    ? formatDateForSpeech(slots.check_out, slots.property_timezone)
    : "null";
  const nights = resolveNights(slots);
  const rooms = slots.rooms ?? 1;
  const lines = [
    "Get offers tool will be called now with the following slots:",
    `check_in: ${spokenCheckIn}`,
    `check_out: ${spokenCheckOut}`,
    `nights: ${slots.nights ?? "null"}`,
    `adults: ${slots.adults ?? "null"}`,
    `rooms: ${slots.rooms ?? "null"}`,
    `children: ${slots.children ?? "null"}`,
    `pet_friendly: ${slots.pet_friendly ?? "null"}`,
    `accessible_room: ${slots.accessible_room ?? "null"}`,
    `needs_two_beds: ${slots.needs_two_beds ?? "null"}`,
    `budget_cap: ${slots.budget_cap ?? "null"}`,
    `parking_needed: ${slots.parking_needed ?? "null"}`,
    offers.length > 1 ? "Here are two options:" : "Here is the best available option:",
  ];

  for (const [index, offer] of offers.entries()) {
    const offerPrefix = index === 0 ? "Option one" : "Option two";
    const savingsNote =
      offer.rate_type === "non_refundable"
        ? "It's a bit cheaper if you're set on your dates."
        : "It's a little more flexible if plans might change.";
    lines.push(
      `${offerPrefix}: ${offer.name}. ${offer.description} ${offer.cancellation_policy} ${offer.payment_policy} ${savingsNote} Total ${formatMoney(offer.price.total)} for ${nights} night${nights === 1 ? "" : "s"} and ${rooms} room${rooms === 1 ? "" : "s"}.`,
    );
  }

  return lines.join(" ");
};

const resolveNights = (slots: OfferIntent): number => {
  if (slots.nights && slots.nights > 0) {
    return slots.nights;
  }

  if (slots.check_in && slots.check_out) {
    const diffDays = calendarDayDiff(slots.check_out, slots.check_in);
    return Math.max(1, diffDays);
  }

  return 1;
};

const formatMoney = (amount: number): string => {
  const rounded = round2(amount);
  const dollars = Math.floor(rounded);
  const cents = Math.round((rounded - dollars) * 100);
  if (cents === 0) {
    return `${dollars} dollars`;
  }
  const centLabel = cents === 1 ? "cent" : "cents";
  return `${dollars} dollars and ${cents} ${centLabel}`;
};
const formatOptionalFlag = (value: boolean | null): string => {
  if (value === null) {
    return "not mentioned";
  }
  return value ? "yes" : "no";
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const hasSlotUpdates = (current: OfferIntent, incoming: GetOffersToolArgs): boolean => {
  const entries: Array<[keyof GetOffersToolArgs, unknown]> = Object.entries(incoming) as Array<
    [keyof GetOffersToolArgs, unknown]
  >;

  return entries.some(([key, value]) => {
    if (typeof value === "undefined") {
      return false;
    }
    return current[key as keyof OfferIntent] !== value;
  });
};

const buildConfirmationPrompt = (slots: OfferIntent): string => {
  const spokenCheckIn = slots.check_in
    ? formatDateForSpeech(slots.check_in, slots.property_timezone)
    : "not provided";
  const spokenCheckOut = slots.check_out
    ? formatDateForSpeech(slots.check_out, slots.property_timezone)
    : "not provided";
  const lines = [
    "Just to confirm, here are the details I have:",
    `check-in ${spokenCheckIn}, check-out ${spokenCheckOut},`,
    `nights ${slots.nights ?? "not provided"},`,
    `adults ${slots.adults ?? "not provided"},`,
    `rooms ${slots.rooms ?? "not provided"},`,
    `children ${slots.children ?? 0},`,
    `pet-friendly ${formatOptionalFlag(slots.pet_friendly)},`,
    `accessible room ${formatOptionalFlag(slots.accessible_room)},`,
    `two beds ${formatOptionalFlag(slots.needs_two_beds)},`,
    `budget cap ${typeof slots.budget_cap === "number" ? formatMoney(slots.budget_cap) : "none"},`,
    `parking needed ${formatOptionalFlag(slots.parking_needed)}.`,
    "Is that all correct?",
  ];

  return lines.join(" ");
};
