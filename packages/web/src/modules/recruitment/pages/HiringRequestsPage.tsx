import { useMutation, useQuery } from '@apollo/client';
import type { HiringRequestStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconAlertTriangle,
  IconBriefcase,
  IconClipboardCheck,
  IconFilterOff,
  IconMessageCircle,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { FieldGroup } from '../../../components/record-panel/FieldGroup';
import { FieldRow, type RecordFieldOption } from '../../../components/record-panel/FieldRow';
import { useInlineCreate } from '../../../components/record-panel/useInlineCreate';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import {
  DataTable,
  toViewColumns,
  type ColumnDefinition,
  type DraftRow,
} from '../../../components/table/DataTable';
import { useListView } from '../../../components/view-bar/useListView';
import { ViewBar } from '../../../components/view-bar/ViewBar';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  CREATE_HIRING_REQUEST_MUTATION,
  HIRING_REQUESTS_QUERY,
  UPDATE_HIRING_REQUEST_MUTATION,
} from '../graphql/recruitment.operations';

type HiringRequestRecord = {
  readonly id: string;
  readonly positionTitle: string;
  readonly headcount: number;
  readonly employmentType: string;
  readonly location: string | null;
  readonly preferredStartDate: string | null;
  readonly clientNote: string | null;
  readonly tethrNote: string | null;
  readonly status: HiringRequestStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updates: readonly HiringRequestUpdateRecord[];
};

type HiringRequestUpdateRecord = {
  readonly id: string;
  readonly hiringRequestId: string;
  readonly status: HiringRequestStatus;
  readonly actor: string;
  readonly note: string | null;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

type HiringRequestsData = { readonly hiringRequests: readonly HiringRequestRecord[] };

const statuses: readonly HiringRequestStatus[] = [
  'submitted',
  'inReview',
  'sourcing',
  'interviewing',
  'offer',
  'filled',
  'cancelled',
];

const statusLabels: Record<HiringRequestStatus, string> = {
  submitted: 'Submitted',
  inReview: 'In review',
  sourcing: 'Sourcing',
  interviewing: 'Interviewing',
  offer: 'Offer',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

const statusColors: Record<HiringRequestStatus, MainColorName> = {
  submitted: 'blue',
  inReview: 'violet',
  sourcing: 'cyan',
  interviewing: 'amber',
  offer: 'plum',
  filled: 'green',
  cancelled: 'gray',
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  );
const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('en', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

const updateActorLabel = (actor: string): string => (actor === 'client' ? 'Client' : 'Tethr');

type HiringDraft = {
  positionTitle: string;
  headcount: string;
  employmentType: string;
  location: string;
  preferredStartDate: string;
  clientNote: string;
};

const emptyHiringDraft = (): HiringDraft => ({
  positionTitle: '',
  headcount: '1',
  employmentType: 'permanent',
  location: '',
  preferredStartDate: '',
  clientNote: '',
});

const isHiringDraftComplete = (draft: HiringDraft): boolean =>
  draft.positionTitle.trim() !== '';

const EMPLOYMENT_TYPE_OPTIONS: readonly RecordFieldOption[] = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'fixedTerm', label: 'Fixed term' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
  { value: 'temporary', label: 'Temporary' },
];

const draftAsRequest = (draft: HiringDraft): HiringRequestRecord => ({
  id: '__draft',
  positionTitle: draft.positionTitle,
  headcount: Number(draft.headcount) || 0,
  employmentType: draft.employmentType,
  location: draft.location || null,
  preferredStartDate: draft.preferredStartDate || null,
  clientNote: draft.clientNote || null,
  tethrNote: null,
  status: 'submitted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updates: [],
});

export const HiringRequestsPage = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isTethr = user?.portal === 'tethr';
  // Mirrors the hiringRequestWrite permission: clients raise requests for their
  // own workspace, Tethr staff can raise one on their behalf.
  const canCreateRequest = Boolean(
    user?.roleKeys.includes('tethrAdmin') ||
      user?.roleKeys.includes('tethrHr') ||
      user?.roleKeys.includes('clientAdmin') ||
      user?.roleKeys.includes('clientMember'),
  );
  const { data, loading, error, refetch } = useQuery<HiringRequestsData>(HIRING_REQUESTS_QUERY);
  const [createRequest] = useMutation(CREATE_HIRING_REQUEST_MUTATION);
  const [updateRequest, { loading: updating }] = useMutation(UPDATE_HIRING_REQUEST_MUTATION);
  const requests = useMemo(() => data?.hiringRequests ?? [], [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const view = useListView({ routeKey: '/hiring' });
  const visibleRequests = useMemo(() => {
    const selectedStatuses = view.filters.status ?? [];
    if (selectedStatuses.length === 0) return requests;
    return requests.filter((request) => selectedStatuses.includes(request.status));
  }, [requests, view.filters.status]);
  const columns: readonly ColumnDefinition<HiringRequestRecord>[] = [
    {
      key: 'role',
      header: 'Role',
      width: '28%',
      hideable: false,
      sortValue: (request) => request.positionTitle,
      render: (request) => (
        <>
          <div className="employee-primary">{request.positionTitle}</div>
          <div className="employee-secondary">{request.employmentType}</div>
        </>
      ),
    },
    {
      key: 'headcount',
      header: 'Headcount',
      width: '12%',
      align: 'right',
      sortValue: (request) => request.headcount,
      render: (request) => request.headcount,
    },
    {
      key: 'location',
      header: 'Location',
      width: '16%',
      sortValue: (request) => request.location ?? '',
      render: (request) => request.location ?? '—',
    },
    {
      key: 'start',
      header: 'Target start',
      width: '16%',
      sortValue: (request) => request.preferredStartDate ?? '',
      render: (request) =>
        request.preferredStartDate ? formatDate(request.preferredStartDate) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      width: '14%',
      hideable: false,
      sortValue: (request) => request.status,
      render: (request) => (
        <StatusChip color={statusColors[request.status]} label={statusLabels[request.status]} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '14%',
      sortValue: (request) => request.updatedAt,
      render: (request) => formatDate(request.updatedAt),
    },
  ];
  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: (Object.keys(statusLabels) as HiringRequestStatus[]).map((value) => ({
        value,
        label: statusLabels[value],
      })),
    },
  ];
  const [updateForm, setUpdateForm] = useState({
    status: 'submitted' as HiringRequestStatus,
    tethrNote: '',
  });
  const create = useInlineCreate<HiringDraft, HiringRequestRecord>({
    createEmptyDraft: emptyHiringDraft,
    isComplete: isHiringDraftComplete,
    createRecord: async (draft) => {
      const result = await createRequest({
        variables: {
          input: {
            positionTitle: draft.positionTitle.trim(),
            headcount: Number(draft.headcount) || 1,
            employmentType: draft.employmentType,
            location: draft.location || undefined,
            preferredStartDate: draft.preferredStartDate || undefined,
            clientNote: draft.clientNote || undefined,
          },
        },
      });
      await refetch();
      return result.data?.createHiringRequest ?? null;
    },
    onCreated: (record) => setSelectedId(record.id),
  });
  const selectedRequestId = selected?.id ?? null;
  const selectedStatus = selected?.status ?? null;
  const selectedTethrNote = selected?.tethrNote ?? null;

  useEffect(() => {
    if (!selectedRequestId || !selectedStatus) return;
    setUpdateForm({ status: selectedStatus, tethrNote: selectedTethrNote ?? '' });
  }, [selectedRequestId, selectedStatus, selectedTethrNote]);

  const selectRequest = (request: HiringRequestRecord): void => {
    if (create.draft !== null) create.discard();
    setSelectedId(request.id);
    setUpdateForm({ status: request.status, tethrNote: request.tethrNote ?? '' });
  };

  // A fresh draft takes over the panel; clearing the selection means discarding
  // it closes the panel rather than falling back to the last record opened.
  const startCreate = (): void => {
    setSelectedId(null);
    create.start();
  };

  const onUpdate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selected) return;
    await updateRequest({
      variables: {
        input: {
          hiringRequestId: selected.id,
          status: updateForm.status,
          tethrNote: updateForm.tethrNote || null,
        },
      },
    });
    await refetch();
  };

  const renderUpdateTrail = (request: HiringRequestRecord) => (
    <section className="hiring-update-trail" aria-label="Hiring request updates">
      <div className="table-density">
        {request.updates.length} update{request.updates.length === 1 ? '' : 's'}
      </div>
      <div className="record-list">
        {request.updates.map((update) => (
          <div className="record-item" key={update.id}>
            <IconMessageCircle size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            <div>
              <div className="record-inline-actions">
                <StatusChip
                  color={statusColors[update.status]}
                  label={statusLabels[update.status]}
                />
                <span className="employee-secondary">
                  {updateActorLabel(update.actor)} · {formatDateTime(update.createdAt)}
                </span>
              </div>
              <div className="leave-trail-note">{update.note ?? 'No update note.'}</div>
            </div>
          </div>
        ))}
        {request.updates.length === 0 ? (
          <p className="table-empty">No recruitment updates have been recorded yet.</p>
        ) : null}
      </div>
    </section>
  );

  const draftRow: DraftRow<HiringRequestRecord> | null =
    create.draft !== null
      ? {
          rowKey: '__draft',
          renderCell: (column) => {
            const draft = create.draft;
            return draft ? column.render(draftAsRequest(draft)) : null;
          },
        }
      : null;

  return (
    <main className="list-with-panel">
      <section className="hiring-content" aria-labelledby="hiring-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="hiring-title">
              Hiring requests
            </h1>
            <p className="page-subtitle">Track open roles from request to hire.</p>
          </div>
          {canCreateRequest ? (
            <div className="page-actions">
              <button className="button button-primary" onClick={startCreate} type="button">
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                New request
              </button>
            </div>
          ) : null}
        </header>

        <section className="table-shell" aria-label="Hiring requests">
          <ViewBar
            actions={
              <button
                className="icon-button"
                onClick={() => void refetch()}
                title="Refresh requests"
                type="button"
              >
                <IconRefresh size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </button>
            }
            columns={toViewColumns(columns)}
            count={visibleRequests.length}
            filters={filters}
            view={view}
            viewLabel="All requests"
          />
          <DataTable
            columns={columns}
            draftRow={draftRow}
            emptyState={
              error ? (
                <EmptyState
                  icon={IconAlertTriangle}
                  title="Could not load hiring requests"
                  description="Is the API running, and are you still signed in?"
                />
              ) : requests.length === 0 ? (
                <EmptyState
                  icon={IconBriefcase}
                  title="No hiring requests yet"
                  description={
                    isTethr
                      ? 'Raise one here, or clients can submit them from their workspace.'
                      : 'Requests you submit will show up here for recruitment.'
                  }
                  action={
                    canCreateRequest ? (
                      <button className="button button-primary" onClick={startCreate} type="button">
                        <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                        New request
                      </button>
                    ) : null
                  }
                />
              ) : (
                <EmptyState
                  icon={IconFilterOff}
                  title="No requests match this filter"
                  description="Clear the filter to see more."
                  action={
                    <button className="button button-secondary" onClick={view.clearFilters} type="button">
                      Clear filters
                    </button>
                  }
                />
              )
            }
            getRowKey={(request) => request.id}
            hiddenColumns={view.hiddenColumns}
            loading={loading && !error}
            onHideColumn={view.hideColumn}
            onRowClick={selectRequest}
            onSort={view.setSort}
            rows={error ? [] : visibleRequests}
            selectedRowKey={selected?.id ?? null}
            sorts={view.sorts}
            tableClassName="data-table hiring-table"
          />
        </section>
      </section>

      <SidePanel
        isOpen={create.draft !== null || selected != null}
        onClose={() => {
          if (create.draft !== null) {
            create.discard();
            return;
          }
          setSelectedId(null);
        }}
        title={
          create.draft !== null
            ? 'New request'
            : isTethr
              ? 'Hiring request'
              : 'Recruitment updates'
        }
      >
        {create.draft !== null ? (
          <div>
            <FieldGroup title="Role">
              <FieldRow
                alwaysEditing
                label="Role title"
                onChange={(value) => create.patchDraft({ positionTitle: value })}
                required
                type="text"
                value={create.draft.positionTitle}
              />
              <FieldRow
                alwaysEditing
                label="Headcount"
                min={1}
                onChange={(value) => create.patchDraft({ headcount: value })}
                type="number"
                value={create.draft.headcount}
              />
              <FieldRow
                alwaysEditing
                label="Employment type"
                onChange={(value) => create.patchDraft({ employmentType: value })}
                options={EMPLOYMENT_TYPE_OPTIONS}
                type="select"
                value={create.draft.employmentType}
              />
            </FieldGroup>
            <FieldGroup title="Details">
              <FieldRow
                alwaysEditing
                label="Location"
                onChange={(value) => create.patchDraft({ location: value })}
                type="text"
                value={create.draft.location}
              />
              <FieldRow
                alwaysEditing
                label="Target start"
                onChange={(value) => create.patchDraft({ preferredStartDate: value })}
                type="date"
                value={create.draft.preferredStartDate}
              />
              <FieldRow
                alwaysEditing
                label="Role brief"
                onChange={(value) => create.patchDraft({ clientNote: value })}
                placeholder="What the client needs"
                type="text"
                value={create.draft.clientNote}
              />
            </FieldGroup>
            {create.error ? (
              <p className="auth-error record-panel-error" role="alert">
                {create.error}
              </p>
            ) : null}
            <div className="record-panel-actions">
              <button
                className="button button-primary"
                disabled={!create.canCreate || create.isSaving}
                onClick={() => void create.commit()}
                type="button"
              >
                {create.isSaving ? 'Submitting…' : 'Submit request'}
              </button>
              <button className="button button-secondary" onClick={create.discard} type="button">
                Cancel
              </button>
            </div>
          </div>
        ) : selected ? (
          isTethr ? (
            <section>
              <div className="panel-title-row">
                <div>
                  <div className="panel-kicker">Recruitment update</div>
                  <h2 className="panel-title">{selected.positionTitle}</h2>
                </div>
                <IconClipboardCheck size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
              </div>
              {renderUpdateTrail(selected)}
              <form className="config-form" onSubmit={onUpdate}>
                <div className="field">
                  <label htmlFor="request-status">Status</label>
                  <select
                    id="request-status"
                    value={updateForm.status}
                    onChange={(event) =>
                      setUpdateForm((current) => ({
                        ...current,
                        status: event.target.value as HiringRequestStatus,
                      }))
                    }
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="tethr-note">Client update</label>
                  <textarea
                    id="tethr-note"
                    value={updateForm.tethrNote}
                    onChange={(event) =>
                      setUpdateForm((current) => ({ ...current, tethrNote: event.target.value }))
                    }
                  />
                </div>
                <section className="request-note">
                  <div className="field-label">Client brief</div>
                  <p>{selected.clientNote ?? 'No additional detail provided.'}</p>
                </section>
                <button className="button button-primary" disabled={updating} type="submit">
                  {updating ? 'Saving...' : 'Save update'}
                </button>
              </form>
            </section>
          ) : (
            <section>
              <div className="panel-title-row">
                <div>
                  <div className="panel-kicker">Recruitment updates</div>
                  <h2 className="panel-title">{selected.positionTitle}</h2>
                </div>
                <IconBriefcase size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
              </div>
              {renderUpdateTrail(selected)}
            </section>
          )
        ) : null}
      </SidePanel>
    </main>
  );
};
