import { OfferIntent } from "./offerIntent";

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
      message: string;
      speech: string;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      missingFields: string[];
      clarificationPrompt: string;
      slots: OfferIntent;
    };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const handleGetOffersToolCall = (
  current: OfferIntent,
  rawArgs: unknown,
  now: Date = new Date(),
): ToolValidationResult => {
  const incoming = coerceArgs(rawArgs);
  const merged = mergeIntent(current, incoming);

  const { intent: withDefaults, missingFields } = applyDefaultsAndMissing(merged);

  const checkInResult = normalizeDate(withDefaults.check_in, now, withDefaults.property_timezone, "check_in");
  if (checkInResult.status === "ambiguous") {
    return buildClarification(withDefaults, ["check_in"], checkInResult.prompt);
  }

  const resolvedCheckIn = checkInResult.value;

  const checkOutResult = normalizeCheckOut(withDefaults, resolvedCheckIn, now, withDefaults.property_timezone);
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

  return {
    status: "OK",
    slots: finalIntent,
    message: "Get offers tool will be called now with the following slots",
    speech: buildSlotSpeech(finalIntent),
  };
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

const normalizeCheckOut = (
  intent: OfferIntent,
  checkIn: string | null,
  now: Date,
  timezone: string,
): { status: "ok"; value: string | null; nights?: number | null } | { status: "ambiguous"; prompt: string } => {
  if (intent.check_out) {
    return normalizeDate(intent.check_out, now, timezone, "check_out");
  }

  if (!intent.nights || !checkIn) {
    return { status: "ok", value: intent.check_out ?? null };
  }

  const nights = toPositiveInt(intent.nights);
  if (!nights) {
    return { status: "ambiguous", prompt: "How many nights would you like to stay?" };
  }

  return { status: "ok", value: addDays(checkIn, nights), nights };
};

const normalizeDate = (
  value: string | null,
  now: Date,
  timezone: string,
  field: "check_in" | "check_out",
): { status: "ok"; value: string | null } | { status: "ambiguous"; prompt: string } => {
  if (!value) {
    return { status: "ok", value: null };
  }

  if (ISO_DATE_PATTERN.test(value)) {
    return { status: "ok", value };
  }

  if (isWeekendPhrase(value)) {
    return { status: "ambiguous", prompt: "Do you mean Friday to Sunday, or Saturday to Monday?" };
  }

  const relative = resolveRelativeDate(value, now, timezone);
  if (relative) {
    const label = field === "check_in" ? "check-in" : "check-out";
    return {
      status: "ambiguous",
      prompt: `If today is ${relative.today} in PST, I'm assuming ${label} ${relative.phrase} is ${relative.assumed} - is that right?`,
    };
  }

  if (isMonthlessDate(value)) {
    const { optionA, optionB } = buildMonthOptions(now, timezone, value);
    return {
      status: "ambiguous",
      prompt: `Which month is that - ${optionA} or ${optionB}?`,
    };
  }

  return {
    status: "ambiguous",
    prompt: `What exact ${field === "check_in" ? "check-in" : "check-out"} date do you want? Please use YYYY-MM-DD.`,
  };
};

const resolveRelativeDate = (
  input: string,
  now: Date,
  timezone: string,
): { phrase: string; assumed: string; today: string } | null => {
  const normalized = input.trim().toLowerCase();
  const today = getTodayInTimezone(now, timezone);

  if (normalized === "today") {
    return { phrase: "today", assumed: today, today };
  }

  if (normalized === "tomorrow") {
    return { phrase: "tomorrow", assumed: addDays(today, 1), today };
  }

  const inDaysMatch = normalized.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const days = Number(inDaysMatch[1]);
    if (Number.isFinite(days) && days > 0) {
      return { phrase: `in ${days} days`, assumed: addDays(today, days), today };
    }
  }

  const inWeeksMatch = normalized.match(/^in\s+(\d+)\s+weeks?$/);
  if (inWeeksMatch) {
    const weeks = Number(inWeeksMatch[1]);
    if (Number.isFinite(weeks) && weeks > 0) {
      return { phrase: `in ${weeks} weeks`, assumed: addDays(today, weeks * 7), today };
    }
  }

  const weekdayMatch = normalized.match(/^(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayMatch) {
    const mode = weekdayMatch[1];
    const day = weekdayMatch[2];
    if (!mode || !day) {
      return null;
    }
    const assumed = resolveWeekday(today, day, mode);
    return { phrase: `${mode} ${day}`, assumed, today };
  }

  if (normalized === "this weekend" || normalized === "next weekend") {
    return null;
  }

  return null;
};

const isWeekendPhrase = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === "this weekend" || normalized === "next weekend";
};

const resolveWeekday = (todayIso: string, weekday: string, mode: string): string => {
  const targetDow = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(
    weekday,
  );
  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const todayDow = todayDate.getUTCDay();
  let delta = (targetDow - todayDow + 7) % 7;

  if (mode === "next") {
    delta = delta === 0 ? 7 : delta + 7;
  }

  return addDays(todayIso, delta);
};

const isMonthlessDate = (value: string): boolean => /\bthe\s+\d{1,2}(st|nd|rd|th)?\b/i.test(value);

const buildMonthOptions = (now: Date, timezone: string, value: string): { optionA: string; optionB: string } => {
  const dayMatch = value.match(/\d{1,2}/);
  const day = dayMatch ? dayMatch[0].padStart(2, "0") : "01";
  const { month, year } = getMonthYear(now, timezone);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const optionA = `${monthName(month)} ${Number(day)}`;
  const optionB = `${monthName(nextMonth)} ${Number(day)}`;

  return { optionA, optionB };
};

const monthName = (month: number): string =>
  [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1] ?? "";

const getTodayInTimezone = (now: Date, timezone: string): string => {
  const { year, month, day } = getDateParts(now, timezone);
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const getMonthYear = (now: Date, timezone: string): { year: number; month: number } => {
  const { year, month } = getDateParts(now, timezone);
  return { year, month };
};

const getDateParts = (now: Date, timezone: string): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
};

const pad2 = (value: number): string => value.toString().padStart(2, "0");

const addDays = (isoDate: string, days: number): string => {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
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

const buildSlotSpeech = (slots: OfferIntent): string => {
  const lines = [
    "Get offers tool will be called now with the following slots:",
    `check_in: ${slots.check_in ?? "null"}`,
    `check_out: ${slots.check_out ?? "null"}`,
    `nights: ${slots.nights ?? "null"}`,
    `adults: ${slots.adults ?? "null"}`,
    `rooms: ${slots.rooms ?? "null"}`,
    `children: ${slots.children ?? "null"}`,
    `pet_friendly: ${slots.pet_friendly ?? "null"}`,
    `accessible_room: ${slots.accessible_room ?? "null"}`,
    `needs_two_beds: ${slots.needs_two_beds ?? "null"}`,
    `budget_cap: ${slots.budget_cap ?? "null"}`,
    `parking_needed: ${slots.parking_needed ?? "null"}`,
  ];

  return lines.join(" ");
};
