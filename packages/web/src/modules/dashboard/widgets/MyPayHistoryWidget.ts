import { useQuery } from '@apollo/client';
import { formatDate } from '@hrms/shared';

import { MY_PAYSLIPS_QUERY } from '../../finance/payroll/graphql/payroll.operations';

import type { WidgetData, WidgetFieldDefinition } from './types';

type Payslip = {
  readonly id: string;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly payDate: string | null;
  readonly currency: string;
  readonly grossAmount: number;
  readonly netPayAmount: number;
};
type MyPayslipsData = { readonly myPayslips: readonly Payslip[] };

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const MY_PAY_HISTORY_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'latestNetPay', label: 'Latest net pay' },
  { id: 'latestGrossPay', label: 'Latest gross' },
  { id: 'latestPayDate', label: 'Paid on' },
  { id: 'payslips', label: 'Payslips' },
];

export const useMyPayHistoryData = (): WidgetData => {
  const { data, loading, error } = useQuery<MyPayslipsData>(MY_PAYSLIPS_QUERY);

  const payslips = [...(data?.myPayslips ?? [])].sort(
    (a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth,
  );
  const latest = payslips[payslips.length - 1];
  const currency = latest?.currency ?? 'USD';
  const money = (amount: number): string =>
    new Intl.NumberFormat('en', { currency, maximumFractionDigits: 0, style: 'currency' }).format(
      amount,
    );

  return {
    loading,
    error: Boolean(error),
    values: {
      latestNetPay: latest ? money(latest.netPayAmount) : '—',
      latestGrossPay: latest ? money(latest.grossAmount) : '—',
      latestPayDate: formatDate(latest?.payDate),
      payslips: payslips.length,
    },
    points: payslips.map((payslip) => ({
      label: `${MONTH_LABELS[payslip.periodMonth - 1]} ${payslip.periodYear}`,
      value: payslip.netPayAmount,
    })),
    formatPointValue: money,
  };
};
