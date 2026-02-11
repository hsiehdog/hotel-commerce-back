import type { PropertyCancellationPolicyRule } from "./types";
import { formatInZone, isValidDate, parseIsoDate, subDaysFromDate, zonedTimeToUtc } from "../../utils/dateTime";

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
      propertyTimezone,
    });
    if (!deadline) {
      return policy.policySummaryTemplate.trim();
    }

    const deadlineHasPassed = now.getTime() > deadline.getTime();
    if (!deadlineHasPassed) {
      return policy.policySummaryTemplate.trim();
    }

    return `The free-cancellation deadline passed on ${formatLocalDateTime(deadline, propertyTimezone)}. ${renderPenaltyClause(policy)}`;
  }

  const deadline = resolveDeadline({
    checkInDate,
    freeCancelDaysBefore: policy.freeCancelDaysBefore,
    freeCancelCutoffTime: policy.freeCancelCutoffTime,
    propertyTimezone,
  });
  if (!deadline) {
    return `Free cancellation until ${formatTime(policy.freeCancelCutoffTime)} ${policy.freeCancelDaysBefore} days before arrival. ${renderPenaltyClause(policy)}`;
  }

  const deadlineHasPassed = now.getTime() > deadline.getTime();
  if (deadlineHasPassed) {
    return `The free-cancellation deadline passed on ${formatLocalDateTime(deadline, propertyTimezone)}. ${renderPenaltyClause(policy)}`;
  }

  return `Free cancellation until ${formatLocalDateTime(deadline, propertyTimezone)}. ${renderPenaltyClause(policy)}`;
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

const resolveDeadline = ({
  checkInDate,
  freeCancelDaysBefore,
  freeCancelCutoffTime,
  propertyTimezone,
}: {
  checkInDate: string;
  freeCancelDaysBefore: number;
  freeCancelCutoffTime: string;
  propertyTimezone: string;
}): Date | null => {
  const checkIn = parseIsoDate(checkInDate);
  const cutoff = parseTime(freeCancelCutoffTime);
  if (!isValidDate(checkIn) || !cutoff) {
    return null;
  }
  const deadlineDate = subDaysFromDate(checkIn, freeCancelDaysBefore);
  const localDate = formatInZone(deadlineDate, propertyTimezone, "yyyy-MM-dd");
  const localDateTime = `${localDate}T${pad2(cutoff.hour)}:${pad2(cutoff.minute)}:00`;
  return zonedTimeToUtc(localDateTime, propertyTimezone);
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

const formatLocalDateTime = (value: Date, timezone: string): string =>
  formatInZone(value, timezone, "MMM d, h:mm a");

const renderPenaltyClause = (policy: PropertyCancellationPolicyRule): string => {
  if (policy.penaltyType === "FIRST_NIGHT_PLUS_TAX") {
    return "Canceling now incurs first night plus tax.";
  }
  const penaltyValue = typeof policy.penaltyValue === "number" ? policy.penaltyValue : 100;
  return `Canceling now incurs ${penaltyValue}% of stay.`;
};

const pad2 = (value: number): string => String(value).padStart(2, "0");
