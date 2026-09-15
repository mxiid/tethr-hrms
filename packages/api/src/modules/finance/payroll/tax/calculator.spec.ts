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

  it('reduces the taxable base by the profile exemption before annualizing', () => {
    // 100,000 − 20,000 = 80,000/month → annual 960,000 → 5% × 360,000 = 18,000 → 1,500.
    expect(
      calculateMonthlyWithholding(100_000, SLABS, { monthlyExemptionAmount: 20_000 }),
    ).toBe(1_500);
  });

  it('removes prior-employer income from the annual liability (marginal method)', () => {
    // Annual 1,200,000 + prior 600,000 = 1,800,000.
    // Tax(1,800,000) = 30,000 + 15% × 600,000 = 120,000; tax(600,000) = 0.
    // Net 120,000 → 10,000/month.
    expect(
      calculateMonthlyWithholding(100_000, SLABS, { priorAnnualIncome: 600_000 }),
    ).toBe(10_000);
    // Prior income that itself consumes a band reduces the delta.
    // Tax(2,400,000) − tax(1,200,000) = 230,000 − 30,000 = 200,000 → 16,666.67/month.
    expect(
      calculateMonthlyWithholding(100_000, SLABS, { priorAnnualIncome: 1_200_000 }),
    ).toBe(16_666.67);
  });

  it('subtracts resolved annual tax credits before dividing into months', () => {
    // Annual 1,200,000 → 30,000 tax; credit 24,000 → 6,000 → 500/month.
    expect(
      calculateMonthlyWithholding(100_000, SLABS, { annualTaxCreditAmount: 24_000 }),
    ).toBe(500);
  });

  it('never returns a negative withholding when credits exceed the liability', () => {
    expect(
      calculateMonthlyWithholding(100_000, SLABS, { annualTaxCreditAmount: 500_000 }),
    ).toBe(0);
  });

  it('lets a fixed monthly amount override the ladder (even without slabs)', () => {
    expect(
      calculateMonthlyWithholding(100_000, SLABS, { fixedMonthlyWithholding: 12_345.678 }),
    ).toBe(12_345.68);
    expect(calculateMonthlyWithholding(100_000, [], { fixedMonthlyWithholding: 4_000 })).toBe(
      4_000,
    );
  });
});
