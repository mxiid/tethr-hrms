import { useMutation, useQuery } from '@apollo/client';
import { formatDateTime, type FeedbackStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import { IconAlertTriangle, IconCheck, IconFilterOff, IconMessageCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import {
  DataTable,
  toViewColumns,
  type ColumnDefinition,
} from '../../../components/table/DataTable';
import { useListView } from '../../../components/view-bar/useListView';
import { ViewBar } from '../../../components/view-bar/ViewBar';
import { useTheme } from '../../../providers/theme/useTheme';
import { FEEDBACK_INBOX_QUERY, RESOLVE_FEEDBACK_MUTATION } from '../graphql/engagement.operations';

type FeedbackRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly category: string;
  readonly subject: string;
  readonly body: string;
  readonly status: FeedbackStatus;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type FeedbackData = { readonly employeeFeedback: readonly FeedbackRecord[] };

const statusLabel: Record<FeedbackStatus, string> = {
  submitted: 'Submitted',
  inReview: 'In review',
  resolved: 'Resolved',
};

const statusColor: Record<FeedbackStatus, MainColorName> = {
  submitted: 'amber',
  inReview: 'blue',
  resolved: 'green',
};

export const FeedbackInboxPage = () => {
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useQuery<FeedbackData>(FEEDBACK_INBOX_QUERY);
  const [resolveFeedback, { loading: resolving }] = useMutation(RESOLVE_FEEDBACK_MUTATION);
  const feedback = useMemo(() => data?.employeeFeedback ?? [], [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = feedback.find((item) => item.id === selectedId) ?? null;
  const [status, setStatus] = useState<FeedbackStatus>('submitted');
  const [resolutionNote, setResolutionNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setStatus(selected.status);
    setResolutionNote(selected.resolutionNote ?? '');
  }, [selected]);

  const view = useListView({ routeKey: '/feedback' });
  const categories = useMemo(
    () => [...new Set(feedback.map((item) => item.category))].sort((a, b) => a.localeCompare(b)),
    [feedback],
  );
  const visibleFeedback = useMemo(
    () =>
      feedback.filter((item) => {
        const statuses = view.filters.status ?? [];
        const selectedCategories = view.filters.category ?? [];
        if (statuses.length > 0 && !statuses.includes(item.status)) return false;
        if (selectedCategories.length > 0 && !selectedCategories.includes(item.category)) {
          return false;
        }
        return true;
      }),
    [feedback, view.filters.category, view.filters.status],
  );
  const columns: readonly ColumnDefinition<FeedbackRecord>[] = [
    {
      key: 'subject',
      header: 'Subject',
      width: '46%',
      hideable: false,
      sortValue: (item) => item.subject,
      render: (item) => (
        <>
          <div className="employee-primary">{item.subject}</div>
          <div className="employee-secondary">{item.employeeId}</div>
        </>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '20%',
      sortValue: (item) => item.category,
      render: (item) => item.category,
    },
    {
      key: 'status',
      header: 'Status',
      width: '18%',
      hideable: false,
      sortValue: (item) => item.status,
      render: (item) => (
        <StatusChip color={statusColor[item.status]} label={statusLabel[item.status]} />
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      width: '16%',
      sortValue: (item) => item.createdAt,
      render: (item) => formatDateTime(item.createdAt),
    },
  ];
  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: (Object.keys(statusLabel) as FeedbackStatus[]).map((value) => ({
        value,
        label: statusLabel[value],
      })),
    },
    {
      key: 'category',
      label: 'Category',
      options: categories.map((category) => ({ value: category, label: category })),
    },
  ];

  const onResolve = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selected) return;
    setFormError(null);
    try {
      await resolveFeedback({
        variables: {
          input: {
            employeeFeedbackId: selected.id,
            status,
            resolutionNote: resolutionNote || null,
          },
        },
      });
      await refetch();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not update feedback');
    }
  };

  return (
    <section className="list-with-panel">
      <section className="feedback-content" aria-labelledby="feedback-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="feedback-title">
              Employee feedback
            </h1>
            <p className="page-subtitle">Feedback from employees, for your review.</p>
          </div>
        </header>

        <div className="metric-strip metric-strip-3 employee-metrics">
          <div className="metric-card">
            <div className="metric-label">Open</div>
            <div className="metric-value">
              {loading ? '…' : feedback.filter((item) => item.status !== 'resolved').length}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Resolved</div>
            <div className="metric-value">
              {loading ? '…' : feedback.filter((item) => item.status === 'resolved').length}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total</div>
            <div className="metric-value">{loading ? '…' : feedback.length}</div>
          </div>
        </div>

        <section className="table-shell" aria-label="Feedback inbox">
          <ViewBar
            columns={toViewColumns(columns)}
            count={visibleFeedback.length}
            filters={filters}
            view={view}
            viewLabel="All feedback"
          />
          <DataTable
            columns={columns}
            emptyState={
              error ? (
                <EmptyState
                  icon={IconAlertTriangle}
                  title="Could not load feedback"
                  description="Is the API running, and are you still signed in?"
                />
              ) : feedback.length === 0 ? (
                <EmptyState
                  icon={IconMessageCircle}
                  title="No employee feedback yet"
                  description="Feedback submitted by employees will show up here."
                />
              ) : (
                <EmptyState
                  icon={IconFilterOff}
                  title="No feedback matches these filters"
                  description="Clear a filter to see more."
                  action={
                    <button className="button button-secondary" onClick={view.clearFilters} type="button">
                      Clear filters
                    </button>
                  }
                />
              )
            }
            getRowKey={(item) => item.id}
            hiddenColumns={view.hiddenColumns}
            loading={loading && !error}
            onHideColumn={view.hideColumn}
            onRowClick={(item) => setSelectedId(item.id)}
            onSort={view.setSort}
            rows={error ? [] : visibleFeedback}
            selectedRowKey={selected?.id ?? null}
            sorts={view.sorts}
            tableClassName="data-table feedback-table"
          />
        </section>
      </section>

      <SidePanel
        isOpen={selected != null}
        onClose={() => setSelectedId(null)}
        title="Feedback"
      >
        {selected ? (
          <section className="self-service-section">
            <div className="panel-title-row">
              <div>
                <div className="panel-kicker">{selected.category}</div>
                <h2 className="panel-title">{selected.subject}</h2>
              </div>
              <IconMessageCircle aria-hidden="true" size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
            </div>
            <div className="request-note">
              <div className="employee-secondary">{formatDateTime(selected.createdAt)}</div>
              <p>{selected.body}</p>
            </div>
            <form className="config-form" onSubmit={onResolve}>
              {formError ? (
                <p className="auth-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="field">
                <label htmlFor="feedback-status">Status</label>
                <select
                  id="feedback-status"
                  name="feedback-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
                >
                  {Object.entries(statusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="feedback-resolution">Resolution note</label>
                <textarea
                  id="feedback-resolution"
                  name="feedback-resolution"
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                />
              </div>
              <button className="button button-primary" disabled={resolving} type="submit">
                <IconCheck aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                {resolving ? 'Saving…' : 'Save status'}
              </button>
            </form>
          </section>
        ) : null}
      </SidePanel>
    </section>
  );
};
