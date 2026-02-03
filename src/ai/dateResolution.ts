type RelativeDateResult = { phrase: string; assumed: string; today: string };

type DateNormalizationResult =
  | { status: "ok"; value: string | null }
  | { status: "ambiguous"; prompt: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeDate = (
  value: string | null,
  now: Date,
  timezone: string,
  field: "check_in" | "check_out",
): DateNormalizationResult => {
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
    const spokenToday = formatDateForSpeech(relative.today, timezone);
    const spokenAssumed = formatDateForSpeech(relative.assumed, timezone);
    return {
      status: "ambiguous",
      prompt: `If today is ${spokenToday} in PST, I'm assuming ${label} ${relative.phrase} is ${spokenAssumed} - is that right?`,
    };
  }

  if (isMonthlessDate(value)) {
    const { optionA, optionB } = buildMonthOptions(now, timezone, value);
    const spokenOptionA = formatDateForSpeech(optionA, timezone);
    const spokenOptionB = formatDateForSpeech(optionB, timezone);
    return {
      status: "ambiguous",
      prompt: `Which month is that - ${spokenOptionA} or ${spokenOptionB}?`,
    };
  }

  return {
    status: "ambiguous",
    prompt: `What exact ${field === "check_in" ? "check-in" : "check-out"} date do you want? Please use YYYY-MM-DD.`,
  };
};

export const normalizeCheckOut = (
  checkOut: string | null,
  nights: number | null,
  checkIn: string | null,
  now: Date,
  timezone: string,
): { status: "ok"; value: string | null; nights?: number | null } | { status: "ambiguous"; prompt: string } => {
  if (checkOut) {
    return normalizeDate(checkOut, now, timezone, "check_out");
  }

  if (!nights || !checkIn) {
    return { status: "ok", value: checkOut ?? null };
  }

  if (!Number.isFinite(nights) || nights <= 0) {
    return { status: "ambiguous", prompt: "How many nights would you like to stay?" };
  }

  return { status: "ok", value: addDays(checkIn, nights), nights };
};

export const resolveRelativeDate = (
  input: string,
  now: Date,
  timezone: string,
): RelativeDateResult | null => {
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

  return null;
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

const isWeekendPhrase = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === "this weekend" || normalized === "next weekend";
};

const buildMonthOptions = (now: Date, timezone: string, value: string): { optionA: string; optionB: string } => {
  const dayMatch = value.match(/\d{1,2}/);
  const day = dayMatch ? dayMatch[0].padStart(2, "0") : "01";
  const { month, year } = getMonthYear(now, timezone);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const optionA = `${year}-${pad2(month)}-${day}`;
  const optionB = `${nextYear}-${pad2(nextMonth)}-${day}`;

  return { optionA, optionB };
};

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

export const formatDateForSpeech = (isoDate: string, timezone: string): string => {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return isoDate;
  }

  // Use noon UTC to avoid timezone shifting the local date.
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return formatter.format(date);
};
