import { gql, useQuery } from '@apollo/client';
import { HIRING_REQUEST_STATUSES, type HiringRequestStatus } from '@hrms/shared';

import type { WidgetData, WidgetFieldDefinition } from './types';

const HIRING_PIPELINE_QUERY = gql`
  query DashboardHiringPipeline {
    hiringRequests {
      id
      status
    }
  }
`;

type HiringPipelineData = {
  hiringRequests: ReadonlyArray<{ id: string; status: string }>;
};

const CLOSED_STATUSES: ReadonlySet<string> = new Set(['filled', 'cancelled']);

const STATUS_LABELS: Record<HiringRequestStatus, string> = {
  submitted: 'Submitted',
  open: 'Open',
  onHold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

export const HIRING_PIPELINE_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'total', label: 'Requests' },
  { id: 'active', label: 'Active' },
  ...HIRING_REQUEST_STATUSES.map((status) => ({ id: status, label: STATUS_LABELS[status] })),
];

export const useHiringPipelineData = (): WidgetData => {
  const { data, loading, error } = useQuery<HiringPipelineData>(HIRING_PIPELINE_QUERY);
  const requests = data?.hiringRequests ?? [];
  const countWhere = (status: HiringRequestStatus): number =>
    requests.filter((request) => request.status === status).length;

  return {
    loading,
    error: Boolean(error),
    values: {
      total: requests.length,
      active: requests.filter((request) => !CLOSED_STATUSES.has(request.status)).length,
      submitted: countWhere('submitted'),
      open: countWhere('open'),
      onHold: countWhere('onHold'),
      filled: countWhere('filled'),
      cancelled: countWhere('cancelled'),
    },
    breakdown: HIRING_REQUEST_STATUSES.map((status) => ({
      id: status,
      label: STATUS_LABELS[status],
      value: countWhere(status),
    })),
  };
};
