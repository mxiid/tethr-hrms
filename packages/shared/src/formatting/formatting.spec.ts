import { formatDate, formatDateTime, formatMoney } from './formatting';

describe('formatDate', () => {
  it('formats date-only strings as calendar dates without a UTC shift', () => {
    expect(formatDate('2026-09-15')).toBe('Sep 15, 2026');
  });

  it('formats instants in local time', () => {
    expect(formatDate(new Date(2026, 8, 15, 23, 30))).toBe('Sep 15, 2026');
  });

  it('degrades to an em dash for missing or invalid values', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('honours an explicit locale', () => {
    expect(formatDate('2026-09-15', { locale: 'en-GB' })).toBe('15 Sept 2026');
  });
});

describe('formatDateTime', () => {
  it('includes the day and the time', () => {
    const formatted = formatDateTime(new Date(2026, 8, 15, 14, 30));
    expect(formatted).toContain('Sep 15, 2026');
    expect(formatted).toMatch(/(14:30|02:30)/);
  });

  it('degrades to an em dash for invalid values', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('formats currency with the locale grouping', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('falls back to code plus amount for an unknown currency', () => {
    expect(formatMoney(10, 'NOT-A-CODE')).toBe('NOT-A-CODE 10.00');
  });
});
