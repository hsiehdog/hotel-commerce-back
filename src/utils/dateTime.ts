import { addDays, differenceInCalendarDays, format, getDay, getHours, getMinutes, parseISO, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const parseIsoDate = (value: string): Date => parseISO(value);

export const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

export const calendarDayDiff = (endIso: string, startIso: string): number =>
  differenceInCalendarDays(parseIsoDate(endIso), parseIsoDate(startIso));

export const addDaysToIsoDate = (isoDate: string, days: number): string =>
  format(addDays(parseIsoDate(isoDate), days), "yyyy-MM-dd");

export const subDaysFromDate = (value: Date, days: number): Date => subDays(value, days);

export const formatInZone = (value: Date, timezone: string, pattern: string): string =>
  formatInTimeZone(value, timezone, pattern);

export const zonedTimeToUtc = (value: string | Date, timezone: string): Date => fromZonedTime(value, timezone);

export const utcToZoned = (value: Date, timezone: string): Date => toZonedTime(value, timezone);

export const getLocalDayAndMinutes = (utcDate: Date, timezone: string): { dayOfWeek: number; minutesOfDay: number } => {
  const zoned = utcToZoned(utcDate, timezone);
  return {
    dayOfWeek: getDay(zoned),
    minutesOfDay: getHours(zoned) * 60 + getMinutes(zoned),
  };
};

export const dayOfWeekFromIsoDate = (isoDate: string): number => getDay(parseIsoDate(isoDate));
