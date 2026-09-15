import {
  addIsoDays,
  compareIsoDate,
  countWorkingDays,
  isoMonthRange,
  type IsoDate,
} from '@hrms/shared';

// Billing calendar math (pure). The invoice sheet convention this reproduces:
// advance billing — a document cut on/after the anchor day covers the following
// month, and anyone who joined partway through a not-yet-invoiced month shows up
// as a "catch-up" line for the days they actually worked (working days Mon–Fri;
// public holidays are intentionally ignored here because they vary per country
// while rates are agreed monthly).

export const monthLabel = (year: number, month: number): string => {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[month - 1]} ${year}`;
};

// Inverse of `monthLabel`; null when the label isn't a recognized month.
export const parseMonthLabel = (label: string): { year: number; month: number } | null => {
  const names = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!match) {
    return null;
  }
  const month = names.indexOf(match[1].toLowerCase()) + 1;
  return month === 0 ? null : { year: Number(match[2]), month };
};

export const addMonths = (year: number, month: number, delta: number): { year: number; month: number } => {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
};

// Fraction of `year-month` covered by the half-open span [startDate, endDate]
// (both inclusive here; null start = month start, null end = month end). A span
// entirely outside the month is zero. Rounded to 4 dp — use `proratedAmount` for
// money so no drift accumulates from share rounding. `startDate` is normally the
// later of hire date and membership start; `endDate` the earlier of the
// membership end and termination date.
export const prorationShare = (
  startDate: IsoDate | null,
  year: number,
  month: number,
  endDate: IsoDate | null = null,
): number => {
  const { start, endExclusive } = isoMonthRange(year, month);
  const lastDay = addIsoDays(endExclusive, -1);
  const windowStart = startDate && compareIsoDate(startDate, start) > 0 ? startDate : start;
  const windowEnd = endDate && compareIsoDate(endDate, lastDay) < 0 ? endDate : lastDay;
  if (compareIsoDate(windowStart, windowEnd) > 0) {
    return 0;
  }
  const totalDays = countWorkingDays(start, lastDay);
  if (totalDays === 0) {
    return 0;
  }
  const workedDays = countWorkingDays(windowStart, windowEnd);
  return Math.round((workedDays / totalDays) * 10000) / 10000;
};

// Money-safe pro-rating: applies the raw day ratio to the rate, rounding once at
// the end. E.g. rate 900 hired on the 12th of a 21-working-day month → 600.00.
export const proratedAmount = (
  monthlyRate: number,
  startDate: IsoDate | null,
  year: number,
  month: number,
  endDate: IsoDate | null = null,
): number => {
  const { start, endExclusive } = isoMonthRange(year, month);
  const lastDay = addIsoDays(endExclusive, -1);
  const windowStart = startDate && compareIsoDate(startDate, start) > 0 ? startDate : start;
  const windowEnd = endDate && compareIsoDate(endDate, lastDay) < 0 ? endDate : lastDay;
  if (compareIsoDate(windowStart, windowEnd) > 0) {
    return 0;
  }
  const totalDays = countWorkingDays(start, lastDay);
  if (totalDays === 0) {
    return 0;
  }
  const workedDays = countWorkingDays(windowStart, windowEnd);
  return Math.round(((monthlyRate * workedDays) / totalDays) * 100) / 100;
};

// Every month from the hire month through `endYear-endMonth`, inclusive.
export const monthsFromHireThrough = (
  hireDate: IsoDate,
  endYear: number,
  endMonth: number,
): { year: number; month: number }[] => {
  const hireYear = Number(hireDate.slice(0, 4));
  const hireMonth = Number(hireDate.slice(5, 7));
  const result: { year: number; month: number }[] = [];
  let cursor = { year: hireYear, month: hireMonth };
  while (
    cursor.year < endYear ||
    (cursor.year === endYear && cursor.month <= endMonth)
  ) {
    result.push({ ...cursor });
    cursor = addMonths(cursor.year, cursor.month, 1);
  }
  return result;
};
