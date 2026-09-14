import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const PAYROLL_RUNS_QUERY = gql`
  query DashboardPayrollRuns {
    payrollRuns {
      id
      status
      currency
      periodYear
      periodMonth
    }
  }
`;

const RUN_PAYSLIPS_QUERY = gql`
  query DashboardRunPayslips($runId: ID!) {
    runPayslips(runId: $runId) {
      id
      grossAmount
      netPayAmount
    }
  }
`;

type PayrollRun = {
  readonly id: string;
  readonly status: string;
  readonly currency: string;
  readonly periodYear: number;
  readonly periodMonth: number;
};

type PayrollRunsData = { readonly payrollRuns: readonly PayrollRun[] };
type RunPayslipsData = {
  readonly runPayslips: ReadonlyArray<{ id: string; grossAmount: number; netPayAmount: number }>;
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', { currency, maximumFractionDigits: 0, style: 'currency' }).format(
    amount,
  );

const latestFinalizedRun = (runs: readonly PayrollRun[]): PayrollRun | null =>
  runs
    .filter((run) => run.status === 'finalized')
    .sort((a, b) => b.periodYear - a.periodYear || b.periodMonth - a.periodMonth)[0] ?? null;

export const PAYROLL_SNAPSHOT_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'totalRuns', label: 'Payroll runs' },
  { id: 'finalizedRuns', label: 'Finalized' },
  { id: 'draftRuns', label: 'Draft' },
  { id: 'latestNetPay', label: 'Latest net pay' },
  { id: 'latestGrossPay', label: 'Latest gross pay' },
];

export const usePayrollSnapshotData = (): WidgetData => {
  const { data: runsData, loading: runsLoading, error: runsError } =
    useQuery<PayrollRunsData>(PAYROLL_RUNS_QUERY);

  const runs = runsData?.payrollRuns ?? [];
  const latestRun = latestFinalizedRun(runs);

  const { data: payslipsData, loading: payslipsLoading, error: payslipsError } =
    useQuery<RunPayslipsData>(RUN_PAYSLIPS_QUERY, {
      variables: { runId: latestRun?.id },
      skip: !latestRun,
    });

  const payslips = payslipsData?.runPayslips ?? [];
  const totalNetPay = payslips.reduce((sum, payslip) => sum + payslip.netPayAmount, 0);
  const totalGrossPay = payslips.reduce((sum, payslip) => sum + payslip.grossAmount, 0);
  const periodLabel = latestRun
    ? ` — ${MONTH_LABELS[latestRun.periodMonth - 1]} ${latestRun.periodYear}`
    : '';

  return {
    loading: runsLoading || payslipsLoading,
    error: Boolean(runsError) || Boolean(payslipsError),
    values: {
      totalRuns: runs.length,
      finalizedRuns: runs.filter((run) => run.status === 'finalized').length,
      draftRuns: runs.filter((run) => run.status === 'draft').length,
      latestNetPay: latestRun ? `${formatMoney(totalNetPay, latestRun.currency)}${periodLabel}` : '—',
      latestGrossPay: latestRun ? `${formatMoney(totalGrossPay, latestRun.currency)}${periodLabel}` : '—',
    },
  };
};
