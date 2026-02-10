import type { PropertyCancellationPolicyRule } from "./types";

export const selectCancellationPolicy = ({
  policies,
  checkIn,
  roomTypeId,
}: {
  policies: PropertyCancellationPolicyRule[];
  checkIn: string;
  roomTypeId: string;
}): PropertyCancellationPolicyRule | null => {
  const matching = policies.filter((policy) => {
    if (!matchesRoomType(policy, roomTypeId)) {
      return false;
    }
    return matchesSeason(policy, checkIn);
  });

  if (matching.length === 0) {
    return null;
  }

  return matching.sort((left, right) => left.priority - right.priority)[0] ?? null;
};

const matchesRoomType = (policy: PropertyCancellationPolicyRule, roomTypeId: string): boolean => {
  if (policy.appliesToRoomTypeIds.length === 0) {
    return true;
  }

  return policy.appliesToRoomTypeIds.some((value) => normalizeId(value) === normalizeId(roomTypeId));
};

const matchesSeason = (policy: PropertyCancellationPolicyRule, checkIn: string): boolean => {
  const start = policy.effectiveStartMonthDay;
  const end = policy.effectiveEndMonthDay;
  if (!start || !end) {
    return true;
  }

  const monthDay = toMonthDay(checkIn);
  if (!monthDay || !isMonthDay(start) || !isMonthDay(end)) {
    return false;
  }

  if (start <= end) {
    return monthDay >= start && monthDay <= end;
  }

  // Handles ranges that cross year boundaries (e.g. Nov-Feb).
  return monthDay >= start || monthDay <= end;
};

const normalizeId = (value: string): string => value.trim().toLowerCase();

const toMonthDay = (date: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  return `${match[2]}-${match[3]}`;
};

const isMonthDay = (value: string): boolean => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
