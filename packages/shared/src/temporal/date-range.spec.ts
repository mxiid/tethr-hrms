import {
  addIsoDays,
  compareIsoDate,
  countWorkingDays,
  eachIsoDateInclusive,
  isIsoDate,
  isValidRange,
  isWeekend,
  rangeContains,
  rangesOverlap,
  type DateRange,
} from './date-range';

describe('isIsoDate', () => {
  it('accepts well-formed calendar dates', () => {
    expect(isIsoDate('2026-06-18')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    expect(isIsoDate('2026-6-18')).toBe(false);
    expect(isIsoDate('not-a-date')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    // Date.parse would normalize these instead of failing.
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2026-00-10')).toBe(false);
  });

  it('accepts leap days only in leap years', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
  });
});

describe('compareIsoDate', () => {
  it('orders dates lexicographically', () => {
    expect(compareIsoDate('2026-01-01', '2026-12-31')).toBe(-1);
    expect(compareIsoDate('2026-12-31', '2026-01-01')).toBe(1);
    expect(compareIsoDate('2026-06-18', '2026-06-18')).toBe(0);
  });
});

describe('isValidRange', () => {
  it('treats open-ended ranges as valid', () => {
    expect(isValidRange({ validFrom: '2026-01-01', validTo: null })).toBe(true);
  });

  it('requires start strictly before end', () => {
    expect(isValidRange({ validFrom: '2026-01-01', validTo: '2026-02-01' })).toBe(true);
    expect(isValidRange({ validFrom: '2026-02-01', validTo: '2026-02-01' })).toBe(false);
    expect(isValidRange({ validFrom: '2026-03-01', validTo: '2026-02-01' })).toBe(false);
  });
});

describe('rangeContains', () => {
  const range: DateRange = { validFrom: '2026-01-01', validTo: '2026-04-01' };

  it('includes the lower bound and excludes the upper bound (half-open)', () => {
    expect(rangeContains(range, '2026-01-01')).toBe(true);
    expect(rangeContains(range, '2026-02-15')).toBe(true);
    expect(rangeContains(range, '2026-04-01')).toBe(false);
    expect(rangeContains(range, '2025-12-31')).toBe(false);
  });

  it('treats null validTo as open-ended', () => {
    const open: DateRange = { validFrom: '2026-01-01', validTo: null };
    expect(rangeContains(open, '2099-01-01')).toBe(true);
  });
});

describe('rangesOverlap', () => {
  it('adjacent half-open ranges do not overlap', () => {
    const first: DateRange = { validFrom: '2026-01-01', validTo: '2026-04-01' };
    const second: DateRange = { validFrom: '2026-04-01', validTo: '2026-07-01' };
    expect(rangesOverlap(first, second)).toBe(false);
  });

  it('intersecting ranges overlap', () => {
    const first: DateRange = { validFrom: '2026-01-01', validTo: '2026-05-01' };
    const second: DateRange = { validFrom: '2026-04-01', validTo: '2026-07-01' };
    expect(rangesOverlap(first, second)).toBe(true);
  });

  it('an open-ended range overlaps anything that starts after it', () => {
    const open: DateRange = { validFrom: '2026-01-01', validTo: null };
    const later: DateRange = { validFrom: '2030-01-01', validTo: '2030-02-01' };
    expect(rangesOverlap(open, later)).toBe(true);
  });
});

describe('calendar-day helpers', () => {
  it('addIsoDays moves forward and backward across month boundaries', () => {
    expect(addIsoDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('isWeekend identifies Saturday and Sunday', () => {
    expect(isWeekend('2026-06-20')).toBe(true); // Saturday
    expect(isWeekend('2026-06-21')).toBe(true); // Sunday
    expect(isWeekend('2026-06-22')).toBe(false); // Monday
  });

  it('eachIsoDateInclusive enumerates the full inclusive range', () => {
    expect(eachIsoDateInclusive('2026-06-01', '2026-06-03')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
    expect(eachIsoDateInclusive('2026-06-03', '2026-06-01')).toEqual([]);
  });

  it('countWorkingDays excludes weekends and holidays', () => {
    // Mon 2026-06-15 .. Sun 2026-06-21 = 5 weekdays; minus one holiday = 4.
    const holidays = new Set(['2026-06-17']);
    expect(countWorkingDays('2026-06-15', '2026-06-21', holidays)).toBe(4);
    expect(countWorkingDays('2026-06-15', '2026-06-21')).toBe(5);
  });
});
