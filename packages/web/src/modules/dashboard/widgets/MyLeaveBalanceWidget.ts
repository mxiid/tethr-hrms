import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const MY_LEAVE_BALANCE_QUERY = gql`
  query DashboardMyLeaveBalance {
    leaveTypes {
      id
      name
    }
    myLeaveBalances {
      id
      leaveTypeId
      periodYear
      entitledDays
      usedDays
      pendingDays
      availableDays
    }
  }
`;

type LeaveType = { readonly id: string; readonly name: string };
type LeaveBalance = {
  readonly id: string;
  readonly leaveTypeId: string;
  readonly periodYear: number;
  readonly entitledDays: number;
  readonly usedDays: number;
  readonly pendingDays: number;
  readonly availableDays: number;
};
type MyLeaveBalanceData = {
  readonly leaveTypes: readonly LeaveType[];
  readonly myLeaveBalances: readonly LeaveBalance[];
};

export const MY_LEAVE_BALANCE_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'available', label: 'Available' },
  { id: 'entitled', label: 'Entitled' },
  { id: 'used', label: 'Used' },
  { id: 'pending', label: 'Pending' },
];

export const useMyLeaveBalanceData = (): WidgetData => {
  const { data, loading, error } = useQuery<MyLeaveBalanceData>(MY_LEAVE_BALANCE_QUERY);

  const balances = data?.myLeaveBalances ?? [];
  // A person can carry balances for several periods — only the most recent one
  // is "my balance right now".
  const latestYear = balances.reduce((year, balance) => Math.max(year, balance.periodYear), 0);
  const current = balances.filter((balance) => balance.periodYear === latestYear);

  const sum = (pick: (balance: LeaveBalance) => number): number =>
    current.reduce((total, balance) => total + pick(balance), 0);

  const nameFor = (leaveTypeId: string): string =>
    data?.leaveTypes.find((type) => type.id === leaveTypeId)?.name ?? 'Leave';

  return {
    loading,
    error: Boolean(error),
    values: {
      available: sum((balance) => balance.availableDays),
      entitled: sum((balance) => balance.entitledDays),
      used: sum((balance) => balance.usedDays),
      pending: sum((balance) => balance.pendingDays),
    },
    breakdown: current.map((balance) => ({
      id: balance.leaveTypeId,
      label: nameFor(balance.leaveTypeId),
      value: balance.availableDays,
    })),
  };
};
