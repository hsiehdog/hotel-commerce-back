import type { PropertyCancellationPolicyRule } from "./types";

export const renderCancellationSummary = ({
  policy,
  refundability,
  checkInDate,
  propertyTimezone,
  now,
}: {
  policy: PropertyCancellationPolicyRule | null;
  refundability: "refundable" | "non_refundable";
  checkInDate: string;
  propertyTimezone: string;
  now: Date;
}): string => {
  if (refundability === "non_refundable") {
    return "This rate is non-refundable.";
  }

  if (!policy) {
    return "You can cancel for free up to a day before check-in.";
  }

  if (policy.policySummaryTemplate && policy.policySummaryTemplate.trim().length > 0) {
    const deadline = resolveDeadline({
      checkInDate,
      freeCancelDaysBefore: policy.freeCancelDaysBefore,
      freeCancelCutoffTime: policy.freeCancelCutoffTime,
    });
    if (!deadline) {
      return policy.policySummaryTemplate.trim();
    }

    const nowLocal = getLocalDateTimeParts(now, propertyTimezone);
    const deadlineHasPassed = compareLocalDateTime(nowLocal, deadline) > 0;
    if (!deadlineHasPassed) {
      return policy.policySummaryTemplate.trim();
    }

    return `The free-cancellation deadline passed on ${formatLocalDateTime(deadline)}. ${renderPenaltyClause(policy)}`;
  }

  const deadline = resolveDeadline({
    checkInDate,
    freeCancelDaysBefore: policy.freeCancelDaysBefore,
    freeCancelCutoffTime: policy.freeCancelCutoffTime,
  });
  if (!deadline) {
    return `Free cancellation until ${formatTime(policy.freeCancelCutoffTime)} ${policy.freeCancelDaysBefore} days before arrival. ${renderPenaltyClause(policy)}`;
  }

  const nowLocal = getLocalDateTimeParts(now, propertyTimezone);
  const deadlineHasPassed = compareLocalDateTime(nowLocal, deadline) > 0;
  if (deadlineHasPassed) {
    return `The free-cancellation deadline passed on ${formatLocalDateTime(deadline)}. ${renderPenaltyClause(policy)}`;
  }

  return `Free cancellation until ${formatLocalDateTime(deadline)}. ${renderPenaltyClause(policy)}`;
};

const formatTime = (value: string): string => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return value;
  }
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
};

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const resolveDeadline = ({
  checkInDate,
  freeCancelDaysBefore,
  freeCancelCutoffTime,
}: {
  checkInDate: string;
  freeCancelDaysBefore: number;
  freeCancelCutoffTime: string;
}): LocalDateTimeParts | null => {
  const checkIn = parseIsoDate(checkInDate);
  const cutoff = parseTime(freeCancelCutoffTime);
  if (!checkIn || !cutoff) {
    return null;
  }
  const deadlineDateUtc = new Date(Date.UTC(checkIn.year, checkIn.month - 1, checkIn.day));
  deadlineDateUtc.setUTCDate(deadlineDateUtc.getUTCDate() - freeCancelDaysBefore);
  return {
    year: deadlineDateUtc.getUTCFullYear(),
    month: deadlineDateUtc.getUTCMonth() + 1,
    day: deadlineDateUtc.getUTCDate(),
    hour: cutoff.hour,
    minute: cutoff.minute,
  };
};

const parseIsoDate = (value: string): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const parseTime = (value: string): { hour: number; minute: number } | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return null;
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
};

const getLocalDateTimeParts = (value: Date, timezone: string): LocalDateTimeParts => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
  };
};

const compareLocalDateTime = (left: LocalDateTimeParts, right: LocalDateTimeParts): number => {
  const l = [left.year, left.month, left.day, left.hour, left.minute];
  const r = [right.year, right.month, right.day, right.hour, right.minute];
  for (let index = 0; index < l.length; index += 1) {
    if (l[index] !== r[index]) {
      return (l[index] ?? 0) - (r[index] ?? 0);
    }
  }
  return 0;
};

const formatLocalDateTime = (value: LocalDateTimeParts): string => {
  const monthName = new Date(Date.UTC(value.year, value.month - 1, value.day)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const hour12 = value.hour % 12 || 12;
  const suffix = value.hour >= 12 ? "PM" : "AM";
  const minute = String(value.minute).padStart(2, "0");
  return `${monthName} ${value.day}, ${hour12}:${minute} ${suffix}`;
};

const renderPenaltyClause = (policy: PropertyCancellationPolicyRule): string => {
  if (policy.penaltyType === "FIRST_NIGHT_PLUS_TAX") {
    return "Canceling now incurs first night plus tax.";
  }
  const penaltyValue = typeof policy.penaltyValue === "number" ? policy.penaltyValue : 100;
  return `Canceling now incurs ${penaltyValue}% of stay.`;
};
