// Single source of truth for deriving money totals from a run line's stored
// inputs (component amounts + resolved withholding tax). Both GraphQL views and
// finalization snapshotting call this exact function, so what finance reviewed
// is byte-for-byte what lands on the payslip. All arithmetic stays at 2 dp.

type CategorizedComponent = {
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

type ResolvedComponentAmount = {
  readonly defaultAmount: number;
  readonly amount: number;
  readonly dependsOnPaymentDays: boolean;
};

// Pro-rate one component's full-period amount by payable days (Frappe's
// depends_on_payment_days). Day-independent components pass through untouched;
// day-dependent ones scale by payable/standard, capped at 1 so an over-count
// can never inflate pay. A zero denominator yields zero rather than unbounded.
export const prorateComponent = (
  defaultAmount: number,
  dependsOnPaymentDays: boolean,
  payableDays: number,
  standardWorkingDays: number,
): ResolvedComponentAmount => {
  const full = toMoney(defaultAmount);
  if (!dependsOnPaymentDays) {
    return { defaultAmount: full, amount: full, dependsOnPaymentDays };
  }
  if (standardWorkingDays <= 0) {
    return { defaultAmount: full, amount: 0, dependsOnPaymentDays };
  }
  const share = Math.min(1, Math.max(0, payableDays) / standardWorkingDays);
  return { defaultAmount: full, amount: toMoney(full * share), dependsOnPaymentDays };
};

// Gross payable for a line: the sum of its pro-rated earning components. Never
// the raw monthly gross — a mid-month joiner or an unpaid-leave month is less.
export const sumEarnings = (
  components: readonly { readonly category: string; readonly amount: number }[],
): number =>
  toMoney(
    components
      .filter((component) => component.category === 'earning')
      .reduce((sum, component) => sum + component.amount, 0),
  );

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
