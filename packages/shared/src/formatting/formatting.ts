// Locale-aware formatting shared by every client surface, so dates and money
// stop being re-implemented per page. `locale` defaults to English — the
// product's current language — and can be passed explicitly as the app grows.

export type FormatOptions = {
  readonly locale?: string;
};

const DEFAULT_LOCALE = 'en';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

// Date-only strings ("2026-09-15") are calendar facts, not instants: parse them
// at local midnight so a UTC-based `new Date()` can never render the day before
// in positive-offset zones. Impossible dates (2026-02-31) are rejected rather
// than silently normalized to the next month.
const toDate = (value: string | Date): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (dateOnlyPattern.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return new Date(Number.NaN);
    }
    return date;
  }
  return new Date(value);
};

const formatWith = (
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = DEFAULT_LOCALE,
): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
};

export const formatDate = (
  value: string | Date | null | undefined,
  options: FormatOptions = {},
): string =>
  formatWith(
    value,
    { day: '2-digit', month: 'short', year: 'numeric' },
    options.locale,
  );

export const formatDateTime = (
  value: string | Date | null | undefined,
  options: FormatOptions = {},
): string =>
  formatWith(
    value,
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    options.locale,
  );

export const formatMoney = (
  amount: number,
  currency: string,
  options: FormatOptions = {},
): string => {
  try {
    return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
      currency,
      style: 'currency',
    }).format(amount);
  } catch {
    // An unknown ISO code should degrade to something readable, not throw.
    return `${currency} ${amount.toFixed(2)}`;
  }
};

/** The local calendar day as YYYY-MM-DD — never shifted by the UTC offset. */
export const todayDateKey = (now: Date = new Date()): string => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * The local calendar key `days` before `now` (default today) as YYYY-MM-DD.
 * Calendar subtraction rather than fixed 24-hour periods: subtracting
 * milliseconds crosses a DST boundary onto the wrong local date.
 */
export const dateKeyDaysAgo = (days: number, now: Date = new Date()): string => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return todayDateKey(date);
};
