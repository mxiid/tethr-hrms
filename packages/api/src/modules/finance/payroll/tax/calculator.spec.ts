import { calculateMonthlyWithholding } from './calculator';

// Progressive bands in the shape finance maintains as tenant data (annual PKR).
const SLABS = [
  { upperBound: 600_000, ratePercent: 0, flatAdditive: 0 },
  { upperBound: 1_200_000, ratePercent: 5, flatAdditive: 0 },
  { upperBound: 2_200_000, ratePercent: 15, flatAdditive: 30_000 },
  { upperBound: null, ratePercent: 25, flatAdditive: 180_000 },
];

describe('calculateMonthlyWithholding', () => {
  it('returns zero below the first band threshold', () => {
    expect(calculateMonthlyWithholding(40_000, SLABS)).toBe(0);
  });

  it('applies the second band rate to only the excess over its lower bound', () => {
    // Annual 720,000 → 5% × (720,000 − 600,000) = 6,000 → 500/month.
    expect(calculateMonthlyWithholding(60_000, SLABS)).toBe(500);
  });

  it('adds the carried flat amount when reaching deeper bands', () => {
    // Annual 1,800,000 → 30,000 + 15% × (1,800,000 − 1,200,000) = 120,000 → 10,000/month.
    expect(calculateMonthlyWithholding(150_000, SLABS)).toBe(10_000);
  });

  it('uses the open top band for amounts above every finite bound', () => {
    // Annual 3,000,000 → 180,000 + 25% × (3,000,000 − 2,200,000) = 380,000 → 31,666.67/month.
    expect(calculateMonthlyWithholding(250_000, SLABS)).toBe(31_666.67);
  });

  it('rounds half-paisa results to whole paisa at two decimals', () => {
    // Annual 612,000 → 5% × 12,000 = 600 → exactly 50/month.
    expect(calculateMonthlyWithholding(51_000, SLABS)).toBe(50);
  });

  it('returns zero when no ladder exists so runs never invent tax', () => {
    expect(calculateMonthlyWithholding(100_000, [])).toBe(0);
  });
});
