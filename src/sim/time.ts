/**
 * Calendar (SPEC §3): 1 sim tick = 1 in-game hour. Uses a simplified 12x30-day calendar (360-day
 * year) rather than the real Gregorian calendar, so "monthly"/"yearly" processing steps (§3, §8.2,
 * §8.3, §9) land on exact tick boundaries without irregular month-length bookkeeping.
 */

export const HOURS_PER_DAY = 24;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export const MONTH_NAMES = [
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
] as const;

export interface Calendar {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–30 */
  day: number;
  /** 0–23 */
  hour: number;
}

/** Derives the calendar date from elapsed ticks since the game's `startYear` began. */
export function calendarFromTicks(startYear: number, ticks: number): Calendar {
  const totalDays = Math.floor(ticks / HOURS_PER_DAY);
  const hour = ticks % HOURS_PER_DAY;
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  const day = (totalDays % DAYS_PER_MONTH) + 1;
  const month = (totalMonths % MONTHS_PER_YEAR) + 1;
  const year = startYear + Math.floor(totalMonths / MONTHS_PER_YEAR);
  return { year, month, day, hour };
}

/** True the instant `ticks` crosses into a new day (the tick landed exactly on a day boundary). */
export function isDayBoundary(ticks: number): boolean {
  return ticks > 0 && ticks % HOURS_PER_DAY === 0;
}

/** True the instant `ticks` crosses into a new month. */
export function isMonthBoundary(ticks: number): boolean {
  return ticks > 0 && ticks % (HOURS_PER_DAY * DAYS_PER_MONTH) === 0;
}

/** True the instant `ticks` crosses into a new year. */
export function isYearBoundary(ticks: number): boolean {
  return ticks > 0 && ticks % (HOURS_PER_DAY * DAYS_PER_YEAR) === 0;
}
