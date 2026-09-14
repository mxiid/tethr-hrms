import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const ANNOUNCEMENTS_QUERY = gql`
  query DashboardAnnouncements {
    announcements {
      id
      isPinned
      expiresAt
    }
  }
`;

type AnnouncementsData = {
  announcements: ReadonlyArray<{ id: string; isPinned: boolean; expiresAt: string | null }>;
};

export const ANNOUNCEMENTS_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'total', label: 'Announcements' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
];

export const useAnnouncementsData = (): WidgetData => {
  const { data, loading, error } = useQuery<AnnouncementsData>(ANNOUNCEMENTS_QUERY);
  const announcements = data?.announcements ?? [];
  const now = Date.now();
  const isExpired = (expiresAt: string | null): boolean =>
    expiresAt !== null && new Date(expiresAt).getTime() < now;

  const activeCount = announcements.filter((announcement) => !isExpired(announcement.expiresAt)).length;
  const expiredCount = announcements.filter((announcement) => isExpired(announcement.expiresAt)).length;

  return {
    loading,
    error: Boolean(error),
    values: {
      total: announcements.length,
      pinned: announcements.filter((announcement) => announcement.isPinned).length,
      active: activeCount,
      expired: expiredCount,
    },
    breakdown: [
      { id: 'active', label: 'Active', value: activeCount },
      { id: 'expired', label: 'Expired', value: expiredCount },
    ],
  };
};
