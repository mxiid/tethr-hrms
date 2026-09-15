// One progressive band: taxable amounts up to upperBound (annual PKR) are taxed
// at ratePercent above lowerBound, plus flatAdditive carried from all previous
// bands. upperBound === null means the open-ended top band. numeric-as-string in
// storage; plain numbers here.
export type TaxSlabInput = {
  readonly upperBound: number | null;
  readonly ratePercent: number;
  readonly flatAdditive: number;
};

// Per-employee facts resolved from their effective-dated tax profile. Every
// field is optional: an employee with no profile gets exactly the tenant ladder.
export type MonthlyWithholdingOptions = {
  // Exempt allowances etc. reduce the monthly taxable base before annualizing.
  readonly monthlyExemptionAmount?: number;
  // Income already taxed by a previous employer this year; its ladder consumption
  // is removed so the employee is not taxed twice over the same bands.
  readonly priorAnnualIncome?: number;
  // Resolved annual credits (e.g. investment/charity credits already computed by
  // finance) subtracted from the annual liability before dividing into months.
  readonly annualTaxCreditAmount?: number;
  // Finance-set monthly amount that overrides the ladder entirely.
  readonly fixedMonthlyWithholding?: number | null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

// Progressive withholding calculator (pure, no I/O). Slabs are annual PKR bands
// ordered ascending; `upperBound === null` marks the open top slab. For an annual
// taxable amount S the matching slab contributes flatAdditive + rate% × (S −
// lowerBound), where lowerBound is the previous slab's upper bound (0 for the
// first). Monthly withholding = annual tax / 12, kept at 2 dp — finance can
// always override per line.
//
// The slab rows are tenant data (non-negotiable #5): when statutory bands change,
// finance adds a new group; no code ships.

const annualTaxAt = (annualTaxable: number, slabs: readonly TaxSlabInput[]): number => {
  const ordered = [...slabs].sort((a, b) => {
    if (a.upperBound === null) return 1;
    if (b.upperBound === null) return -1;
    return a.upperBound - b.upperBound;
  });
  let lowerBound = 0;
  for (const slab of ordered) {
    const upper = slab.upperBound ?? Number.POSITIVE_INFINITY;
    if (annualTaxable <= upper || slab.upperBound === null) {
      return slab.flatAdditive + ((annualTaxable - lowerBound) * slab.ratePercent) / 100;
    }
    lowerBound = slab.upperBound;
  }
  // Amount above every finite band falls through to the top slab by construction;
  // reaching here means malformed rows (no top slab). Treat as non-taxable rather
  // than inventing a rate.
  return 0;
};

export const calculateMonthlyWithholding = (
  monthlyTaxable: number,
  slabs: readonly TaxSlabInput[],
  options: MonthlyWithholdingOptions = {},
): number => {
  // A fixed amount is an explicit finance instruction: it applies even with no
  // ladder configured.
  if (options.fixedMonthlyWithholding != null) {
    return round2(Math.max(0, options.fixedMonthlyWithholding));
  }
  if (slabs.length === 0) {
    return 0;
  }
  const exemptedMonthly = Math.max(0, monthlyTaxable - (options.monthlyExemptionAmount ?? 0));
  const annualCurrent = exemptedMonthly * 12;
  const priorAnnual = Math.max(0, options.priorAnnualIncome ?? 0);
  // Marginal method: tax on (current + prior) minus tax already attributable to
  // the prior income — the employee's remaining bands are what the current
  // employer withholds against.
  const annualTax = annualTaxAt(annualCurrent + priorAnnual, slabs) - annualTaxAt(priorAnnual, slabs);
  const credited = annualTax - Math.max(0, options.annualTaxCreditAmount ?? 0);
  return Math.max(0, round2(credited / 12));
};
