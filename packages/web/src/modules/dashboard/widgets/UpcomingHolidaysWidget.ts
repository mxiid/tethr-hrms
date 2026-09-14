import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const HORIZON_DAYS = 90;

const UPCOMING_HOLIDAYS_QUERY = gql`
  query DashboardUpcomingHolidays($from: String!, $to: String!) {
    upcomingHolidays(from: $from, to: $to) {
      id
      date
      name
    }
  }
`;

type Holiday = { readonly id: string; readonly date: string; readonly name: string };
type UpcomingHolidaysData = { readonly upcomingHolidays: readonly Holiday[] };

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const UPCOMING_HOLIDAYS_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'nextHoliday', label: 'Next holiday' },
  { id: 'nextDate', label: 'On' },
  { id: 'daysAway', label: 'Days away' },
  { id: 'count', label: `Next ${HORIZON_DAYS} days` },
];

export const useUpcomingHolidaysData = (): WidgetData => {
  const now = new Date();
  const to = new Date(now);
  to.setDate(to.getDate() + HORIZON_DAYS);

  const { data, loading, error } = useQuery<UpcomingHolidaysData>(UPCOMING_HOLIDAYS_QUERY, {
    variables: { from: isoDate(now), to: isoDate(to) },
  });

  const holidays = [...(data?.upcomingHolidays ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const next = holidays[0];
  const daysAway = next
    ? Math.max(
        0,
        Math.round(
          (new Date(`${next.date}T00:00:00`).getTime() - now.setHours(0, 0, 0, 0)) / 86_400_000,
        ),
      )
    : null;

  return {
    loading,
    error: Boolean(error),
    values: {
      nextHoliday: next?.name ?? 'None scheduled',
      nextDate: next?.date ?? '—',
      daysAway: daysAway ?? '—',
      count: holidays.length,
    },
  };
};
