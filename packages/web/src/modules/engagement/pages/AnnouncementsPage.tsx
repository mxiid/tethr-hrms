import { useMutation, useQuery } from '@apollo/client';
import type { AnnouncementAudience } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import { IconDeviceFloppy, IconFilterOff, IconPin, IconPlus, IconSpeakerphone } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { FilterBar } from '../../../components/filter-bar/FilterBar';
import { Modal } from '../../../components/modal/Modal';
import { SkeletonText } from '../../../components/skeleton/Skeleton';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  ANNOUNCEMENTS_QUERY,
  PUBLISH_ANNOUNCEMENT_MUTATION,
} from '../graphql/engagement.operations';

type AnnouncementRecord = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly audience: AnnouncementAudience;
  readonly isPinned: boolean;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
};

type AnnouncementsData = { readonly announcements: readonly AnnouncementRecord[] };

type AnnouncementForm = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  expiresAt: string;
};

const emptyForm: AnnouncementForm = {
  title: '',
  body: '',
  audience: 'all',
  isPinned: false,
  expiresAt: '',
};

const audienceLabel: Record<AnnouncementAudience, string> = {
  all: 'All portals',
  tethr: 'Tethr',
  client: 'Clients',
  employee: 'Employees',
};

const audienceColor: Record<AnnouncementAudience, MainColorName> = {
  all: 'blue',
  tethr: 'violet',
  client: 'green',
  employee: 'amber',
};

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

export const AnnouncementsPage = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canPublish = user?.portal === 'tethr';
  const { data, loading, error, refetch } = useQuery<AnnouncementsData>(ANNOUNCEMENTS_QUERY);
  const [publishAnnouncement, { loading: publishing }] = useMutation(PUBLISH_ANNOUNCEMENT_MUTATION);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const announcements = useMemo(() => data?.announcements ?? [], [data]);
  const pinnedCount = announcements.filter((announcement) => announcement.isPinned).length;
  const [filters, setFilters] = useState<Record<string, readonly string[]>>({});
  const visibleAnnouncements = useMemo(() => {
    const audiences = filters.audience ?? [];
    if (audiences.length === 0) return announcements;
    return announcements.filter((announcement) => audiences.includes(announcement.audience));
  }, [announcements, filters]);
  const onFilterChange = (key: string, selectedValues: readonly string[]): void =>
    setFilters((current) => ({ ...current, [key]: selectedValues }));

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setNotice(null);
    setFormError(null);
    try {
      await publishAnnouncement({
        variables: {
          input: {
            title: form.title.trim(),
            body: form.body.trim(),
            audience: form.audience,
            isPinned: form.isPinned,
            expiresAt: form.expiresAt || null,
          },
        },
      });
      setForm(emptyForm);
      setNotice('Announcement published');
      setIsFormOpen(false);
      await refetch();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not publish announcement');
    }
  };

  return (
    <main className="page-frame page-frame-single">
      <section className="announcements-content" aria-labelledby="announcements-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="announcements-title">
              News bulletin
            </h1>
            <p className="page-subtitle">News and updates for your workspace.</p>
          </div>
          {canPublish ? (
            <div className="page-actions">
              <button
                className="button button-primary"
                onClick={() => {
                  setFormError(null);
                  setNotice(null);
                  setForm(emptyForm);
                  setIsFormOpen(true);
                }}
                type="button"
              >
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Add announcement
              </button>
            </div>
          ) : null}
        </header>

        {notice ? (
          <p className="form-success" role="status">
            {notice}
          </p>
        ) : null}

        <div className="metric-strip metric-strip-2 employee-metrics">
          <div className="metric-card">
            <div className="metric-label">Visible posts</div>
            <div className="metric-value">{loading ? '...' : announcements.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Pinned</div>
            <div className="metric-value">{loading ? '...' : pinnedCount}</div>
          </div>
        </div>

        <section className="table-shell">
          <div className="table-title-row">
            <div className="table-title">
              <IconSpeakerphone size={theme.icon.size.md} /> Announcements
            </div>
            <div className="panel-actions">
              <FilterBar
                filters={[
                  {
                    key: 'audience',
                    label: 'Audience',
                    options: (Object.keys(audienceLabel) as AnnouncementAudience[]).map((value) => ({
                      value,
                      label: audienceLabel[value],
                    })),
                  },
                ]}
                values={filters}
                onChange={onFilterChange}
              />
              <div className="table-density">
                {loading
                  ? '…'
                  : visibleAnnouncements.length === announcements.length
                    ? `${announcements.length} update${announcements.length === 1 ? '' : 's'}`
                    : `${visibleAnnouncements.length} of ${announcements.length}`}
              </div>
            </div>
          </div>
          {error ? (
            <EmptyState
              icon={IconSpeakerphone}
              title="Could not load announcements"
              description="Is the API running, and are you still signed in?"
            />
          ) : null}
          {loading ? (
            <div className="announcement-list">
              <SkeletonText lines={3} />
              <SkeletonText lines={2} />
            </div>
          ) : null}
          {!loading && !error && announcements.length === 0 ? (
            <EmptyState
              icon={IconSpeakerphone}
              title="No announcements yet"
              description="Publish one to reach the whole workspace, or a single portal."
            />
          ) : null}
          {!loading && !error && announcements.length > 0 && visibleAnnouncements.length === 0 ? (
            <EmptyState
              icon={IconFilterOff}
              title="No announcements match this audience"
              description="Clear the filter to see them all."
              action={
                <button
                  className="button button-secondary"
                  onClick={() => setFilters({})}
                  type="button"
                >
                  Clear filters
                </button>
              }
            />
          ) : null}
          <div className="announcement-list">
            {visibleAnnouncements.map((announcement) => (
              <article className="announcement-item" key={announcement.id}>
                <div className="announcement-meta">
                  <StatusChip
                    color={audienceColor[announcement.audience]}
                    label={audienceLabel[announcement.audience]}
                  />
                  {announcement.isPinned ? (
                    <StatusChip
                      color="amber"
                      icon={<IconPin size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />}
                      label="Pinned"
                    />
                  ) : null}
                  <span>{formatDateTime(announcement.publishedAt)}</span>
                </div>
                <h2 className="announcement-title">{announcement.title}</h2>
                <p className="announcement-body">{announcement.body}</p>
                {announcement.expiresAt ? (
                  <div className="announcement-expiry">
                    Visible until {formatDate(announcement.expiresAt)}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>

      {canPublish ? (
        <Modal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          title="Publish announcement"
          width="md"
        >
          <form className="config-form" onSubmit={onSubmit}>
            {formError ? (
              <p className="auth-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="field">
              <label htmlFor="announcement-title">Title</label>
              <input
                id="announcement-title"
                required
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="announcement-audience">Audience</label>
              <select
                id="announcement-audience"
                value={form.audience}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    audience: event.target.value as AnnouncementAudience,
                  }))
                }
              >
                {Object.entries(audienceLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="announcement-body">Message</label>
              <textarea
                id="announcement-body"
                required
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="announcement-expires">Expires</label>
              <input
                id="announcement-expires"
                type="date"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiresAt: event.target.value }))
                }
              />
            </div>
            <label className="checkbox-field">
              <input
                checked={form.isPinned}
                type="checkbox"
                onChange={(event) =>
                  setForm((current) => ({ ...current, isPinned: event.target.checked }))
                }
              />
              Pin this update
            </label>
            <button className="button button-primary" disabled={publishing} type="submit">
              <IconDeviceFloppy size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
};
