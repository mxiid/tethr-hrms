// One progressive band: taxable amounts up to upperBound (annual PKR) are taxed
// at ratePercent above lowerBound, plus flatAdditive carried from all previous
// bands. upperBound === null means the open-ended top band. numeric-as-string in
// storage; plain numbers here.
export type TaxSlabInput = {
  readonly upperBound: number | null;
  readonly ratePercent: number;
  readonly flatAdditive: number;
};

// Progressive withholding calculator (pure, no I/O). Slabs are annual PKR bands
// ordered ascending; `upperBound === null` marks the open top slab. For an annual
// taxable amount S the matching slab contributes flatAdditive + rate% × (S −
// lowerBound), where lowerBound is the previous slab's upper bound (0 for the
// first). Monthly withholding = annual tax / 12, kept at 2 dp — finance can
// always override per line.
//
// The slab rows are tenant data (non-negotiable #5): when statutory bands change,
// finance adds a new group; no code ships.

export const calculateMonthlyWithholding = (
  monthlyTaxable: number,
  slabs: readonly TaxSlabInput[],
): number => {
  if (slabs.length === 0) {
    return 0;
  }
  const ordered = [...slabs].sort((a, b) => {
    if (a.upperBound === null) return 1;
    if (b.upperBound === null) return -1;
    return a.upperBound - b.upperBound;
  });

  const annualTaxable = monthlyTaxable * 12;
  let lowerBound = 0;
  let tax = 0;
  let matched = false;
  for (const slab of ordered) {
    const upper = slab.upperBound ?? Number.POSITIVE_INFINITY;
    if (annualTaxable <= upper || slab.upperBound === null) {
      tax = slab.flatAdditive + ((annualTaxable - lowerBound) * slab.ratePercent) / 100;
      matched = true;
      break;
    }
    lowerBound = slab.upperBound;
  }
  if (!matched) {
    // Amount above every finite band falls through to the top slab by construction;
    // reaching here means malformed rows (no top slab). Treat as non-taxable rather
    // than inventing a rate.
    return 0;
  }
  const monthly = tax / 12;
  return Math.max(0, Math.round(monthly * 100) / 100);
};
