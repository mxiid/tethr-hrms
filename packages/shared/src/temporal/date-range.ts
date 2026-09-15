// Effective-dating primitives (non-negotiable #4). Backbone facts carry a
// validity range; queries ask "as of date X". Modeled as half-open intervals
// [validFrom, validTo): validFrom inclusive, validTo exclusive, null validTo =
// open-ended. Half-open is deliberate — adjacent records (one ends exactly where
// the next begins) then neither overlap nor leave a gap, which is what makes a
// clean "close one assignment, open the next" transfer possible.
//
// Dates are ISO calendar dates ('YYYY-MM-DD'), compared lexicographically — which
// is correct for that fixed-width format and free of timezone hazards.

export type IsoDate = string;

export type DateRange = {
  readonly validFrom: IsoDate;
  readonly validTo: IsoDate | null;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A shape check is not enough: `Date.parse('2026-02-31')` returns a timestamp
// (JavaScript normalizes it to March 3), so a regex-plus-parse check would let
// impossible calendar dates through. Round-tripping the components through UTC
// rejects them without timezone drift.
export const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

// -1 if a < b, 0 if equal, 1 if a > b. Lexicographic compare is valid for
// fixed-width 'YYYY-MM-DD'.
export const compareIsoDate = (a: IsoDate, b: IsoDate): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

// A range is well-formed when it is open-ended or starts strictly before it ends.
export const isValidRange = (range: DateRange): boolean =>
  range.validTo === null || compareIsoDate(range.validFrom, range.validTo) < 0;

// Is `date` inside the range? validFrom inclusive, validTo exclusive.
export const rangeContains = (range: DateRange, date: IsoDate): boolean =>
  compareIsoDate(range.validFrom, date) <= 0 &&
  (range.validTo === null || compareIsoDate(date, range.validTo) < 0);

// Do two half-open ranges share any day? null validTo is treated as +infinity.
export const rangesOverlap = (a: DateRange, b: DateRange): boolean => {
  const aEndsAtOrBeforeBStarts =
    a.validTo !== null && compareIsoDate(a.validTo, b.validFrom) <= 0;
  const bEndsAtOrBeforeAStarts =
    b.validTo !== null && compareIsoDate(b.validTo, a.validFrom) <= 0;
  return !(aEndsAtOrBeforeBStarts || bEndsAtOrBeforeAStarts);
};

// --- Calendar-day helpers (used by leave/attendance day counting) ---
// All operate in UTC so they are deterministic and timezone-free.

const MILLISECONDS_PER_DAY = 86_400_000;
const toUtcMs = (date: IsoDate): number => Date.parse(`${date}T00:00:00Z`);
const fromUtcMs = (milliseconds: number): IsoDate =>
  new Date(milliseconds).toISOString().slice(0, 10);

// Add (or subtract, with a negative count) whole days to an ISO date.
export const addIsoDays = (date: IsoDate, days: number): IsoDate =>
  fromUtcMs(toUtcMs(date) + days * MILLISECONDS_PER_DAY);

// Saturday or Sunday.
export const isWeekend = (date: IsoDate): boolean => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
};

// Every ISO date from `from` to `to`, inclusive. Empty if from > to.
export const eachIsoDateInclusive = (from: IsoDate, to: IsoDate): IsoDate[] => {
  const dates: IsoDate[] = [];
  for (let milliseconds = toUtcMs(from); milliseconds <= toUtcMs(to); milliseconds += MILLISECONDS_PER_DAY) {
    dates.push(fromUtcMs(milliseconds));
  }
  return dates;
};

// Count working days in [from, to] inclusive, excluding weekends and any date in
// `holidays`. This is the shared rule both leave requests and accrual rely on.
export const countWorkingDays = (
  from: IsoDate,
  to: IsoDate,
  holidays: ReadonlySet<IsoDate> = new Set(),
): number =>
  eachIsoDateInclusive(from, to).filter((date) => !isWeekend(date) && !holidays.has(date)).length;

// The half-open month range [start, endExclusive) for a calendar year/month.
// Payroll periods are keyed by (year, month) and resolve to this range so every
// consumer derives identical period boundaries.
export const isoMonthRange = (
  year: number,
  month: number,
): { readonly start: IsoDate; readonly endExclusive: IsoDate } => {
  const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, endExclusive };
};
