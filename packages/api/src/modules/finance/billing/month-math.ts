import {
  addIsoDays,
  compareIsoDate,
  countWorkingDays,
  eachIsoDateInclusive,
  isWeekend,
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

export const addMonths = (year: number, month: number, delta: number): { year: number; month: number } => {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
};

export const monthStart = (year: number, month: number): IsoDate => isoMonthRange(year, month).start;

// Fraction of `year-month` worked by someone hired on `hireDate` (null or
// on/before month start → full month; after month end → zero). Rounded to 4 dp —
// use `proratedAmount` for money so no drift accumulates from share rounding.
export const prorationShare = (hireDate: IsoDate | null, year: number, month: number): number => {
  if (!hireDate) {
    return 1;
  }
  const { start, endExclusive } = isoMonthRange(year, month);
  if (compareIsoDate(hireDate, start) <= 0) {
    return 1;
  }
  const lastDay = addIsoDays(endExclusive, -1);
  if (compareIsoDate(hireDate, lastDay) > 0) {
    return 0;
  }
  const totalDays = countWorkingDays(start, lastDay);
  if (totalDays === 0) {
    return 0;
  }
  const workedDays = countWorkingDays(hireDate, lastDay);
  return Math.round((workedDays / totalDays) * 10000) / 10000;
};

// Money-safe pro-rating: applies the raw day ratio to the rate, rounding once at
// the end. E.g. rate 900 hired on the 12th of a 21-working-day month → 600.00.
export const proratedAmount = (
  monthlyRate: number,
  hireDate: IsoDate | null,
  year: number,
  month: number,
): number => {
  if (!hireDate) {
    return Math.round(monthlyRate * 100) / 100;
  }
  const { start, endExclusive } = isoMonthRange(year, month);
  if (compareIsoDate(hireDate, start) <= 0) {
    return Math.round(monthlyRate * 100) / 100;
  }
  const lastDay = addIsoDays(endExclusive, -1);
  if (compareIsoDate(hireDate, lastDay) > 0) {
    return 0;
  }
  const totalDays = countWorkingDays(start, lastDay);
  if (totalDays === 0) {
    return 0;
  }
  const workedDays = countWorkingDays(hireDate, lastDay);
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

// Working-day count of a month (Mon–Fri) — used to sanity-check shares.
export const workingDaysInMonth = (year: number, month: number): number => {
  const { start, endExclusive } = isoMonthRange(year, month);
  return eachIsoDateInclusive(start, addIsoDays(endExclusive, -1)).filter(
    (date) => !isWeekend(date),
  ).length;
};
