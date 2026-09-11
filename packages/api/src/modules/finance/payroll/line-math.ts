// Single source of truth for deriving money totals from a run line's stored
// inputs (component amounts + resolved withholding tax). Both GraphQL views and
// finalization snapshotting call this exact function, so what finance reviewed
// is byte-for-byte what lands on the payslip. All arithmetic stays at 2 dp.

export type CategorizedComponent = {
  readonly category: string;
  readonly taxable: boolean;
  readonly amount: number;
};

export type DerivedLineTotals = {
  readonly totalEarnings: number;
  readonly taxableAmount: number;
  readonly deductions: number;
  readonly netPayAmount: number;
};

const toMoney = (value: number): number => Math.round(value * 100) / 100;

export const deriveLineTotals = (
  components: readonly CategorizedComponent[],
  incomeTax: number,
): DerivedLineTotals => {
  let totalEarnings = 0;
  let taxableAmount = 0;
  let deductions = 0;
  for (const component of components) {
    if (component.category === 'earning') {
      totalEarnings += component.amount;
      if (component.taxable) {
        taxableAmount += component.amount;
      }
    } else if (component.category === 'deduction') {
      deductions += component.amount;
    }
  }
  return {
    totalEarnings: toMoney(totalEarnings),
    taxableAmount: toMoney(taxableAmount),
    deductions: toMoney(deductions),
    netPayAmount: toMoney(toMoney(totalEarnings) - toMoney(deductions) - toMoney(incomeTax)),
  };
};
