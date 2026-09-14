import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const LEAVE_OVERVIEW_QUERY = gql`
  query DashboardLeaveOverview {
    leaveTypes {
      id
    }
    leaveRequestInbox {
      id
      status
    }
  }
`;

type LeaveOverviewData = {
  leaveTypes: ReadonlyArray<{ id: string }>;
  leaveRequestInbox: ReadonlyArray<{ id: string; status: string }>;
};

export const LEAVE_OVERVIEW_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'leaveTypes', label: 'Leave types' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'totalRequests', label: 'Total requests' },
];

export const useLeaveOverviewData = (): WidgetData => {
  const { data, loading, error } = useQuery<LeaveOverviewData>(LEAVE_OVERVIEW_QUERY);
  const inbox = data?.leaveRequestInbox ?? [];
  const countWhere = (status: string): number =>
    inbox.filter((request) => request.status === status).length;

  return {
    loading,
    error: Boolean(error),
    values: {
      leaveTypes: data?.leaveTypes.length ?? 0,
      pending: countWhere('pending'),
      approved: countWhere('approved'),
      rejected: countWhere('rejected'),
      cancelled: countWhere('cancelled'),
      totalRequests: inbox.length,
    },
    breakdown: [
      { id: 'pending', label: 'Pending', value: countWhere('pending') },
      { id: 'approved', label: 'Approved', value: countWhere('approved') },
      { id: 'rejected', label: 'Rejected', value: countWhere('rejected') },
      { id: 'cancelled', label: 'Cancelled', value: countWhere('cancelled') },
    ],
  };
};
