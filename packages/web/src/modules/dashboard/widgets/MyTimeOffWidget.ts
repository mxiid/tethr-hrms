import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const MY_TIME_OFF_QUERY = gql`
  query DashboardMyTimeOff {
    myLeaveRequests {
      id
      status
      dayCount
      startDate
    }
  }
`;

type LeaveRequest = {
  readonly id: string;
  readonly status: string;
  readonly dayCount: number;
  readonly startDate: string;
};
type MyTimeOffData = { readonly myLeaveRequests: readonly LeaveRequest[] };

export const MY_TIME_OFF_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'daysThisYear', label: 'Days this year' },
  { id: 'total', label: 'Total requests' },
];

export const useMyTimeOffData = (): WidgetData => {
  const { data, loading, error } = useQuery<MyTimeOffData>(MY_TIME_OFF_QUERY);
  const requests = data?.myLeaveRequests ?? [];
  const thisYear = new Date().getFullYear();
  const countWhere = (status: string): number =>
    requests.filter((request) => request.status === status).length;

  const approvedDaysThisYear = requests
    .filter(
      (request) =>
        request.status === 'approved' &&
        new Date(`${request.startDate}T00:00:00`).getFullYear() === thisYear,
    )
    .reduce((total, request) => total + request.dayCount, 0);

  return {
    loading,
    error: Boolean(error),
    values: {
      pending: countWhere('pending'),
      approved: countWhere('approved'),
      daysThisYear: approvedDaysThisYear,
      total: requests.length,
    },
    breakdown: [
      { id: 'pending', label: 'Pending', value: countWhere('pending') },
      { id: 'approved', label: 'Approved', value: countWhere('approved') },
      { id: 'rejected', label: 'Rejected', value: countWhere('rejected') },
      { id: 'cancelled', label: 'Cancelled', value: countWhere('cancelled') },
    ],
  };
};
