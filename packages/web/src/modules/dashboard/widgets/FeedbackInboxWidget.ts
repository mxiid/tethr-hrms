import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const FEEDBACK_INBOX_QUERY = gql`
  query DashboardFeedbackInbox {
    employeeFeedback {
      id
      status
    }
  }
`;

type FeedbackInboxData = {
  employeeFeedback: ReadonlyArray<{ id: string; status: string }>;
};

export const FEEDBACK_INBOX_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'total', label: 'Feedback' },
  { id: 'open', label: 'Open' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'inReview', label: 'In review' },
  { id: 'resolved', label: 'Resolved' },
];

export const useFeedbackInboxData = (): WidgetData => {
  const { data, loading, error } = useQuery<FeedbackInboxData>(FEEDBACK_INBOX_QUERY);
  const feedback = data?.employeeFeedback ?? [];
  const countWhere = (status: string): number =>
    feedback.filter((item) => item.status === status).length;

  return {
    loading,
    error: Boolean(error),
    values: {
      total: feedback.length,
      open: feedback.filter((item) => item.status !== 'resolved').length,
      submitted: countWhere('submitted'),
      inReview: countWhere('inReview'),
      resolved: countWhere('resolved'),
    },
    breakdown: [
      { id: 'submitted', label: 'Submitted', value: countWhere('submitted') },
      { id: 'inReview', label: 'In review', value: countWhere('inReview') },
      { id: 'resolved', label: 'Resolved', value: countWhere('resolved') },
    ],
  };
};
