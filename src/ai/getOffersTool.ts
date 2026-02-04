import { OfferIntent } from "./offerIntent";
import { formatDateForSpeech, normalizeCheckOut, normalizeDate } from "./dateResolution";

export type GetOffersToolArgs = Partial<{
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  rooms: number;
  children: number;
  pet_friendly: boolean;
  accessible_room: boolean;
  needs_two_beds: boolean;
  budget_cap: number;
  parking_needed: boolean;
}>;

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
    currency: "USD";
    per_night: number;
    total: number;
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


const toPositiveInt = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return undefined;
};

const coerceArgs = (rawArgs: unknown): GetOffersToolArgs => {
  if (!rawArgs || typeof rawArgs !== "object") {
    return {};
  }

  const args = rawArgs as Record<string, unknown>;

  return {
    check_in: typeof args.check_in === "string" ? args.check_in : undefined,
    check_out: typeof args.check_out === "string" ? args.check_out : undefined,
    nights: toPositiveInt(args.nights),
    adults: toPositiveInt(args.adults),
    rooms: toPositiveInt(args.rooms),
    children: typeof args.children === "number" ? Math.max(0, Math.floor(args.children)) : undefined,
    pet_friendly: typeof args.pet_friendly === "boolean" ? args.pet_friendly : undefined,
    accessible_room: typeof args.accessible_room === "boolean" ? args.accessible_room : undefined,
    needs_two_beds: typeof args.needs_two_beds === "boolean" ? args.needs_two_beds : undefined,
    budget_cap: typeof args.budget_cap === "number" ? args.budget_cap : undefined,
    parking_needed: typeof args.parking_needed === "boolean" ? args.parking_needed : undefined,
  };
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
});

export const buildStubOffers = (slots: OfferIntent): OfferOption[] => {
  const nights = resolveNights(slots);
  const rooms = slots.rooms ?? 1;
  const adults = slots.adults ?? 2;
  const children = slots.children ?? 0;

  const flexiblePerNight = buildFlexibleRate(slots, adults, children);
  const nonRefundPerNight = Math.max(80, Math.round(flexiblePerNight * 0.85));

  const flexibleTotal = flexiblePerNight * nights * rooms;
  const nonRefundTotal = nonRefundPerNight * nights * rooms;

  const roomName = buildRoomName(slots);
  const roomDescription = buildRoomDescription(slots, adults, children);

  return [
    {
      id: "offer_flexible",
      name: `${roomName} - Flexible`,
      description: roomDescription,
      rate_type: "flexible",
      cancellation_policy: "You can cancel for free up to a day before check-in.",
      payment_policy: "You can pay when you arrive.",
      price: {
        currency: "USD",
        per_night: flexiblePerNight,
        total: flexibleTotal,
      },
    },
    {
      id: "offer_non_refundable",
      name: `${roomName} - Pay Now Saver`,
      description: roomDescription,
      rate_type: "non_refundable",
      cancellation_policy: "This one is non-refundable.",
      payment_policy: "Payment is due now.",
      price: {
        currency: "USD",
        per_night: nonRefundPerNight,
        total: nonRefundTotal,
      },
    },
  ];
};

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
    "Here are two options:",
  ];

  for (const offer of offers) {
    const offerPrefix = offer.rate_type === "flexible" ? "Option one" : "Option two";
    const savingsNote =
      offer.rate_type === "non_refundable"
        ? "It's a bit cheaper if you're set on your dates."
        : "It's a little more flexible if plans might change.";
    lines.push(
      `${offerPrefix}: ${offer.name}. ${offer.description} ${offer.cancellation_policy} ${offer.payment_policy} ${savingsNote} ${formatMoney(offer.price.per_night)} per night, total ${formatMoney(offer.price.total)} for ${nights} night${nights === 1 ? "" : "s"} and ${rooms} room${rooms === 1 ? "" : "s"}.`,
    );
  }

  return lines.join(" ");
};

const resolveNights = (slots: OfferIntent): number => {
  if (slots.nights && slots.nights > 0) {
    return slots.nights;
  }

  if (slots.check_in && slots.check_out) {
    const start = new Date(`${slots.check_in}T00:00:00Z`);
    const end = new Date(`${slots.check_out}T00:00:00Z`);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return Math.max(1, diffDays);
  }

  return 1;
};

const buildFlexibleRate = (slots: OfferIntent, adults: number, children: number): number => {
  let rate = 160;

  if (adults > 2) {
    rate += (adults - 2) * 20;
  }

  if (children > 0) {
    rate += children * 10;
  }

  if (slots.needs_two_beds) {
    rate += 15;
  }

  if (slots.accessible_room) {
    rate += 10;
  }

  if (slots.pet_friendly) {
    rate += 25;
  }

  if (slots.parking_needed) {
    rate += 15;
  }

  if (typeof slots.budget_cap === "number" && slots.budget_cap > 0) {
    rate = Math.min(rate, Math.max(80, Math.floor(slots.budget_cap * 0.95)));
  }

  return Math.max(80, Math.round(rate));
};

const buildRoomName = (slots: OfferIntent): string => {
  const bedLabel = slots.needs_two_beds ? "Double Queen" : "King";
  if (slots.accessible_room) {
    return `Accessible ${bedLabel} Room`;
  }
  return `${bedLabel} Room`;
};

const buildRoomDescription = (slots: OfferIntent, adults: number, children: number): string => {
  const occupancy = Math.max(2, adults + children);
  const bedLine = slots.needs_two_beds ? "Two queen beds" : "One king bed";
  const details: string[] = [`Sleeps up to ${occupancy}.`, `${bedLine}.`, "Free Wi-Fi."];

  if (children > 0) {
    details.push("Sofa bed available for kids.");
  }

  if (slots.accessible_room) {
    details.push("Roll-in shower and wider doorways.");
  }

  if (slots.pet_friendly) {
    details.push("Pet-friendly.");
  }

  if (slots.parking_needed) {
    details.push("On-site parking available.");
  }

  return details.join(" ");
};

const formatMoney = (amount: number): string => `$${amount}`;
const formatOptionalFlag = (value: boolean | null): string => {
  if (value === null) {
    return "not mentioned";
  }
  return value ? "yes" : "no";
};

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
