import { gql, useApolloClient, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';

import type { WidgetData, WidgetFieldDefinition } from './types';

const PAYROLL_RUNS_QUERY = gql`
  query DashboardPayrollTrendRuns {
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
  query DashboardPayrollTrendPayslips($runId: ID!) {
    runPayslips(runId: $runId) {
      id
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
type RunPayslipsData = { readonly runPayslips: ReadonlyArray<{ id: string; netPayAmount: number }> };

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const PAYROLL_TREND_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'periodsTracked', label: 'Periods tracked' },
  { id: 'latestNetPay', label: 'Latest net pay' },
];

export const usePayrollTrendData = (): WidgetData => {
  const client = useApolloClient();
  const { data: runsData, loading: runsLoading, error: runsError } =
    useQuery<PayrollRunsData>(PAYROLL_RUNS_QUERY);

  const finalizedRuns = (runsData?.payrollRuns ?? [])
    .filter((run) => run.status === 'finalized')
    .sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);

  const [netPayByRunId, setNetPayByRunId] = useState<Readonly<Record<string, number>>>({});
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [payslipsError, setPayslipsError] = useState(false);
  const runIdsKey = finalizedRuns.map((run) => run.id).join(',');

  useEffect(() => {
    if (finalizedRuns.length === 0) {
      setNetPayByRunId({});
      return;
    }
    let cancelled = false;
    setPayslipsLoading(true);
    setPayslipsError(false);

    Promise.all(
      finalizedRuns.map((run) =>
        client
          .query<RunPayslipsData>({ query: RUN_PAYSLIPS_QUERY, variables: { runId: run.id } })
          .then((result) => ({
            runId: run.id,
            netPay: result.data.runPayslips.reduce((sum, payslip) => sum + payslip.netPayAmount, 0),
          })),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        setNetPayByRunId(
          Object.fromEntries(results.map((result) => [result.runId, result.netPay])),
        );
      })
      .catch(() => {
        if (!cancelled) setPayslipsError(true);
      })
      .finally(() => {
        if (!cancelled) setPayslipsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runIdsKey, client]);

  const points = finalizedRuns.map((run) => ({
    label: `${MONTH_LABELS[run.periodMonth - 1]} ${run.periodYear}`,
    value: netPayByRunId[run.id] ?? 0,
  }));

  const latestRun = finalizedRuns[finalizedRuns.length - 1];
  const latestNetPay = latestRun ? (netPayByRunId[latestRun.id] ?? 0) : 0;
  const formatMoney = (amount: number, currency: string): string =>
    new Intl.NumberFormat('en', { currency, maximumFractionDigits: 0, style: 'currency' }).format(
      amount,
    );

  const currency = latestRun?.currency ?? 'USD';

  return {
    loading: runsLoading || payslipsLoading,
    error: Boolean(runsError) || payslipsError,
    values: {
      periodsTracked: finalizedRuns.length,
      latestNetPay: latestRun ? formatMoney(latestNetPay, currency) : '—',
    },
    points,
    formatPointValue: (value) => formatMoney(value, currency),
  };
};
