import {
  addMonths,
  monthLabel,
  monthsFromHireThrough,
  proratedAmount,
  prorationShare,
} from './month-math';

describe('billing month math', () => {
  it('formats month labels like the finance sheet', () => {
    expect(monthLabel(2026, 9)).toBe('September 2026');
    expect(monthLabel(2026, 12)).toBe('December 2026');
  });

  it('crosses year boundaries when adding months', () => {
    expect(addMonths(2026, 11, 2)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('prorates a mid-month joiner by working days', () => {
    // August 2026: 21 working days; from the 12th → 14 worked days.
    expect(prorationShare('2026-08-12', 2026, 8)).toBeCloseTo(14 / 21, 4);
    // Money-safe amount rounds once at the end: 900 × 14/21 = exactly 600.
    expect(proratedAmount(900, '2026-08-12', 2026, 8)).toBe(600);
  });

  it('treats full-month and future hires at the extremes', () => {
    expect(prorationShare(null, 2026, 8)).toBe(1);
    expect(prorationShare('2026-01-01', 2026, 8)).toBe(1);
    expect(prorationShare('2026-09-01', 2026, 8)).toBe(0);
    expect(proratedAmount(900, '2026-09-01', 2026, 8)).toBe(0);
    expect(proratedAmount(900, null, 2026, 8)).toBe(900);
  });

  it('lists months from hire through the end boundary inclusively', () => {
    const months = monthsFromHireThrough('2026-07-15', 2026, 9);
    expect(months).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });
});
