import { useMutation, useQuery } from '@apollo/client';
import {
  HIRING_REQUEST_PRIORITIES,
  HIRING_REQUEST_STATUSES,
  type HiringRequestPriority,
  type HiringRequestStatus,
} from '@hrms/shared';
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
  POSTING_FOR_REQUEST_QUERY,
  PUBLISH_HIRING_REQUEST_MUTATION,
  UNPUBLISH_JOB_POSTING_MUTATION,
} from '../graphql/ats.operations';
import { MY_INTERVIEW_OUTCOMES_QUERY } from '../graphql/interview.operations';
import {
  CLIENT_HIRING_REQUESTS_QUERY,
  CREATE_HIRING_REQUEST_MUTATION,
  HIRING_REQUESTS_QUERY,
  RECRUITMENT_EMPLOYEE_OPTIONS_QUERY,
  UPDATE_HIRING_REQUEST_MUTATION,
} from '../graphql/recruitment.operations';
import {
  MY_SHORTLISTS_QUERY,
  RECORD_SHORTLIST_DECISION_MUTATION,
} from '../graphql/shortlist.operations';

type InterviewOutcomeRecord = {
  readonly interviewId: string;
  readonly roundName: string;
  readonly jobPostingTitle: string;
  readonly scheduledAt: string;
  readonly status: 'scheduled' | 'completed' | 'cancelled';
  readonly outcome: 'passed' | 'failed' | 'noShow' | null;
};

type PostingRecord = {
  readonly id: string;
  readonly title: string;
  readonly isPublished: boolean;
  readonly applyPath: string | null;
};

type HiringRequestRecord = {
  readonly id: string;
  readonly positionTitle: string;
  readonly jobDescription: string | null;
  readonly headcount: number;
  readonly employmentType: string;
  readonly location: string | null;
  readonly preferredStartDate: string | null;
  readonly targetFillDate: string | null;
  readonly salaryMin: number | null;
  readonly salaryMax: number | null;
  readonly salaryCurrency: string | null;
  readonly hiringManagerEmployeeId: string | null;
  readonly reportsToEmployeeId: string | null;
  readonly priority: HiringRequestPriority;
  readonly positionId: string | null;
  readonly clientNote: string | null;
  readonly tethrNote: string | null;
  readonly status: HiringRequestStatus;
  readonly organizationId?: string;
  readonly organizationName?: string;
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

type HiringRequestsData = {
  readonly hiringRequests?: readonly HiringRequestRecord[];
  readonly clientHiringRequests?: readonly HiringRequestRecord[];
};

type ClientShortlistEntryRecord = {
  readonly id: string;
  readonly candidateName: string;
  readonly currentTitle: string | null;
  readonly yearsExperience: number | null;
  readonly location: string | null;
  readonly skills: string | null;
  readonly coverNote: string | null;
  readonly expectedSalary: number | null;
  readonly salaryCurrency: string | null;
  readonly rank: number;
  readonly clientDecision: 'pending' | 'interested' | 'rejected';
  readonly clientNote: string | null;
};

type ClientShortlistRecord = {
  readonly id: string;
  readonly jobPostingTitle: string;
  readonly roundNumber: number;
  readonly status: string;
  readonly presentedAt: string | null;
  readonly entries: readonly ClientShortlistEntryRecord[];
};

const decisionLabels: Record<ClientShortlistEntryRecord['clientDecision'], string> = {
  pending: 'Awaiting your decision',
  interested: 'Interested',
  rejected: 'Not interested',
};

const decisionColors: Record<ClientShortlistEntryRecord['clientDecision'], MainColorName> = {
  pending: 'gray',
  interested: 'green',
  rejected: 'red',
};

const statusLabels: Record<HiringRequestStatus, string> = {
  submitted: 'Submitted',
  open: 'Open',
  onHold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

const statusColors: Record<HiringRequestStatus, MainColorName> = {
  submitted: 'blue',
  open: 'cyan',
  onHold: 'amber',
  filled: 'green',
  cancelled: 'gray',
};

// Mirrors the server's transition map (recruitment.service.ts). The server is
// authoritative; this only keeps the select honest.
const ALLOWED_TRANSITIONS: Record<HiringRequestStatus, readonly HiringRequestStatus[]> = {
  submitted: ['open', 'cancelled'],
  open: ['onHold', 'filled', 'cancelled'],
  onHold: ['open', 'cancelled'],
  filled: [],
  cancelled: [],
};

const priorityLabels: Record<HiringRequestPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const priorityColors: Record<HiringRequestPriority, MainColorName> = {
  urgent: 'red',
  high: 'amber',
  normal: 'gray',
  low: 'gray',
};

type EmployeeOption = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roleTitle: string | null;
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

const formatSalary = (request: HiringRequestRecord): string => {
  const currency = request.salaryCurrency ?? '';
  if (request.salaryMin === null && request.salaryMax === null) return '—';
  const range = [request.salaryMin, request.salaryMax]
    .filter((value): value is number => value !== null)
    .map((value) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value))
    .join(' – ');
  return `${currency} ${range}`.trim();
};

const updateActorLabel = (actor: string): string => (actor === 'client' ? 'Client' : 'Tethr');

type HiringDraft = {
  positionTitle: string;
  jobDescription: string;
  headcount: string;
  employmentType: string;
  location: string;
  preferredStartDate: string;
  targetFillDate: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  hiringManagerEmployeeId: string;
  reportsToEmployeeId: string;
  priority: HiringRequestPriority;
  clientNote: string;
};

const emptyHiringDraft = (): HiringDraft => ({
  positionTitle: '',
  jobDescription: '',
  headcount: '1',
  employmentType: 'permanent',
  location: '',
  preferredStartDate: '',
  targetFillDate: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: 'USD',
  hiringManagerEmployeeId: '',
  reportsToEmployeeId: '',
  priority: 'normal',
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

const DRAFT_RECORD_ID = '__draft';

const draftAsRequest = (draft: HiringDraft): HiringRequestRecord => ({
  id: DRAFT_RECORD_ID,
  positionTitle: draft.positionTitle,
  jobDescription: draft.jobDescription || null,
  headcount: Number(draft.headcount) || 0,
  employmentType: draft.employmentType,
  location: draft.location || null,
  preferredStartDate: draft.preferredStartDate || null,
  targetFillDate: draft.targetFillDate || null,
  salaryMin: draft.salaryMin === '' ? null : Number(draft.salaryMin),
  salaryMax: draft.salaryMax === '' ? null : Number(draft.salaryMax),
  salaryCurrency: draft.salaryCurrency || null,
  hiringManagerEmployeeId: draft.hiringManagerEmployeeId || null,
  reportsToEmployeeId: draft.reportsToEmployeeId || null,
  priority: draft.priority,
  positionId: null,
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
  // Tethr reads the platform board (every client workspace + its own); a client
  // reads only their own tenant-scoped list.
  const queryDocument = isTethr ? CLIENT_HIRING_REQUESTS_QUERY : HIRING_REQUESTS_QUERY;
  const { data, loading, error, refetch } = useQuery<HiringRequestsData>(queryDocument);
  const [createRequest] = useMutation(CREATE_HIRING_REQUEST_MUTATION);
  const [updateRequest, { loading: updating }] = useMutation(UPDATE_HIRING_REQUEST_MUTATION);
  const [publishRequest, { loading: publishing }] = useMutation(PUBLISH_HIRING_REQUEST_MUTATION);
  const [applyLink, setApplyLink] = useState<string | null>(null);
  const {
    data: shortlistsData,
    refetch: refetchShortlists,
  } = useQuery<{ readonly myShortlists: readonly ClientShortlistRecord[] }>(MY_SHORTLISTS_QUERY, {
    skip: isTethr,
  });
  const [recordDecision, { loading: deciding }] = useMutation(RECORD_SHORTLIST_DECISION_MUTATION);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const { data: outcomesData } = useQuery<{
    readonly myInterviewOutcomes: readonly InterviewOutcomeRecord[];
  }>(MY_INTERVIEW_OUTCOMES_QUERY, { skip: isTethr });
  const interviewOutcomes = outcomesData?.myInterviewOutcomes ?? [];
  const [panelError, setPanelError] = useState<string | null>(null);
  const requests = useMemo(
    () => data?.clientHiringRequests ?? data?.hiringRequests ?? [],
    [data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const [unpublishPosting, { loading: unpublishing }] = useMutation(
    UNPUBLISH_JOB_POSTING_MUTATION,
  );
  // The posting's live state, so an operator sees the truth after a reload —
  // the publish response only carries the id in-session.
  const { data: postingData, refetch: refetchPosting } = useQuery<{
    readonly postingForRequest: PostingRecord | null;
  }>(POSTING_FOR_REQUEST_QUERY, {
    skip: !isTethr || !selectedId,
    variables: { hiringRequestId: selectedId },
  });
  const livePosting = postingData?.postingForRequest ?? null;
  const view = useListView({ routeKey: '/hiring' });
  const visibleRequests = useMemo(() => {
    const selectedStatuses = view.filters.status ?? [];
    const selectedWorkspaces = view.filters.workspace ?? [];
    return requests.filter((request) => {
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(request.status)) return false;
      if (
        selectedWorkspaces.length > 0 &&
        !selectedWorkspaces.includes(request.organizationName ?? '')
      ) {
        return false;
      }
      return true;
    });
  }, [requests, view.filters.status, view.filters.workspace]);

  const { data: employeesData } = useQuery<{ readonly employees: readonly EmployeeOption[] }>(
    RECRUITMENT_EMPLOYEE_OPTIONS_QUERY,
    { skip: !canCreateRequest },
  );
  const employeeOptions = useMemo(
    () =>
      (employeesData?.employees ?? [])
        .slice()
        .sort((left, right) => left.firstName.localeCompare(right.firstName))
        .map((employee) => ({
          value: employee.id,
          label: `${employee.firstName} ${employee.lastName}${
            employee.roleTitle ? ` · ${employee.roleTitle}` : ''
          }`,
        })),
    [employeesData?.employees],
  );

  const columns: readonly ColumnDefinition<HiringRequestRecord>[] = [
    {
      key: 'role',
      header: 'Role',
      width: '26%',
      hideable: false,
      sortValue: (request) => request.positionTitle,
      render: (request) => (
        <>
          <div className="employee-primary">{request.positionTitle}</div>
          <div className="employee-secondary">{request.employmentType}</div>
        </>
      ),
    },
    ...(isTethr
      ? [
          {
            key: 'workspace',
            header: 'Workspace',
            width: '16%',
            hideable: false,
            sortValue: (request: HiringRequestRecord) => request.organizationName ?? '',
            render: (request: HiringRequestRecord) => request.organizationName ?? '—',
          } satisfies ColumnDefinition<HiringRequestRecord>,
        ]
      : []),
    {
      key: 'priority',
      header: 'Priority',
      width: '10%',
      sortValue: (request) => HIRING_REQUEST_PRIORITIES.indexOf(request.priority),
      render: (request) => (
        <StatusChip
          color={priorityColors[request.priority]}
          label={priorityLabels[request.priority]}
        />
      ),
    },
    {
      key: 'headcount',
      header: 'Headcount',
      width: '10%',
      align: 'right',
      sortValue: (request) => request.headcount,
      render: (request) => request.headcount,
    },
    {
      key: 'targetFill',
      header: 'Target fill',
      width: '13%',
      sortValue: (request) => request.targetFillDate ?? '',
      render: (request) =>
        request.targetFillDate ? formatDate(request.targetFillDate) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      width: '13%',
      hideable: false,
      sortValue: (request) => request.status,
      render: (request) => (
        <StatusChip color={statusColors[request.status]} label={statusLabels[request.status]} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '12%',
      sortValue: (request) => request.updatedAt,
      render: (request) => formatDate(request.updatedAt),
    },
  ];

  const workspaceOptions = useMemo(() => {
    const names = [
      ...new Set(
        requests
          .map((request) => request.organizationName)
          .filter((name): name is string => typeof name === 'string' && name !== ''),
      ),
    ].sort((left, right) => left.localeCompare(right));
    return names.map((name) => ({ value: name, label: name }));
  }, [requests]);

  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: HIRING_REQUEST_STATUSES.map((value) => ({
        value,
        label: statusLabels[value],
      })),
    },
    ...(isTethr && workspaceOptions.length > 1
      ? [{ key: 'workspace', label: 'Workspace', options: workspaceOptions }]
      : []),
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
            jobDescription: draft.jobDescription || undefined,
            headcount: Number(draft.headcount) || 1,
            employmentType: draft.employmentType,
            location: draft.location || undefined,
            preferredStartDate: draft.preferredStartDate || undefined,
            targetFillDate: draft.targetFillDate || undefined,
            salaryMin: draft.salaryMin === '' ? undefined : Number(draft.salaryMin),
            salaryMax: draft.salaryMax === '' ? undefined : Number(draft.salaryMax),
            salaryCurrency: draft.salaryCurrency || undefined,
            hiringManagerEmployeeId: draft.hiringManagerEmployeeId || undefined,
            reportsToEmployeeId: draft.reportsToEmployeeId || undefined,
            priority: draft.priority,
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
    setPanelError(null);
    setApplyLink(null);
    setUpdateForm({ status: request.status, tethrNote: request.tethrNote ?? '' });
  };

  // A fresh draft takes over the panel; clearing the selection means discarding
  // it closes the panel rather than falling back to the last record opened.
  const startCreate = (): void => {
    setSelectedId(null);
    setPanelError(null);
    create.start();
  };

  const onUpdate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selected) return;
    setPanelError(null);
    try {
      await updateRequest({
        variables: {
          input: {
            hiringRequestId: selected.id,
            status: updateForm.status,
            tethrNote: updateForm.tethrNote || null,
            // The board passes the row's workspace so the server switches there.
            organizationId: selected.organizationId ?? null,
          },
        },
      });
      await refetch();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Could not save the update');
    }
  };

  const statusOptionsFor = (status: HiringRequestStatus): readonly HiringRequestStatus[] => [
    status,
    ...ALLOWED_TRANSITIONS[status],
  ];

  const onPublish = async (): Promise<void> => {
    if (!selected) return;
    setApplyLink(null);
    setPanelError(null);
    try {
      const result = await publishRequest({
        variables: {
          input: {
            hiringRequestId: selected.id,
            organizationId: selected.organizationId ?? null,
          },
        },
      });
      setApplyLink(result.data?.publishHiringRequest?.applyPath ?? null);
      await refetchPosting();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Could not publish the request');
    }
  };

  const onUnpublish = async (): Promise<void> => {
    if (!livePosting) return;
    setPanelError(null);
    try {
      await unpublishPosting({ variables: { postingId: livePosting.id } });
      setApplyLink(null);
      await refetchPosting();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Could not unpublish the posting');
    }
  };

  const onDecision = async (
    entry: ClientShortlistEntryRecord,
    decision: 'interested' | 'rejected',
  ): Promise<void> => {
    setDecisionError(null);
    try {
      await recordDecision({
        variables: {
          input: {
            shortlistEntryId: entry.id,
            decision,
            note: decisionNotes[entry.id] || null,
          },
        },
      });
      await refetchShortlists();
    } catch (caught) {
      setDecisionError(
        caught instanceof Error ? caught.message : 'Could not record your decision',
      );
    }
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
                  color={statusColors[update.status] ?? 'gray'}
                  label={statusLabels[update.status] ?? update.status}
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

  const renderBrief = (request: HiringRequestRecord) => (
    <section className="request-note">
      <div className="field-label">Client brief</div>
      <p>{request.clientNote ?? 'No additional detail provided.'}</p>
      {request.jobDescription ? (
        <>
          <div className="field-label">Role description</div>
          <p>{request.jobDescription}</p>
        </>
      ) : null}
      <div className="field-label">Compensation</div>
      <p>{formatSalary(request)}</p>
    </section>
  );

  const draftRow: DraftRow<HiringRequestRecord> | null =
    create.draft !== null
      ? {
          rowKey: DRAFT_RECORD_ID,
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
            <p className="page-subtitle">
              {isTethr
                ? 'Every client workspace, from request to hire.'
                : 'Track open roles from request to hire.'}
            </p>
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

        {!isTethr && (shortlistsData?.myShortlists ?? []).length > 0 ? (
          <section className="table-shell" aria-label="Candidates presented to you">
            <div className="table-density">Candidates presented to you</div>
            <div className="record-list">
              {(shortlistsData?.myShortlists ?? []).map((shortlist) => (
                <div key={shortlist.id}>
                  <div className="field-label">
                    {shortlist.jobPostingTitle} · Round {shortlist.roundNumber}
                  </div>
                  {shortlist.entries.map((entry) => (
                    <div className="record-item" key={entry.id}>
                      <div>
                        <div className="record-inline-actions">
                          <span className="employee-primary">
                            {entry.rank}. {entry.candidateName}
                          </span>
                          <StatusChip
                            color={decisionColors[entry.clientDecision]}
                            label={decisionLabels[entry.clientDecision]}
                          />
                        </div>
                        <div className="employee-secondary">
                          {[
                            entry.currentTitle,
                            entry.yearsExperience !== null ? `${entry.yearsExperience} yrs` : null,
                            entry.location,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No profile details'}
                        </div>
                        {entry.coverNote ? (
                          <div className="leave-trail-note">{entry.coverNote}</div>
                        ) : null}
                        {shortlist.status === 'presented' ||
                        shortlist.status === 'feedbackReceived' ? (
                          <>
                            <div className="field">
                              <label htmlFor={`shortlist-note-${entry.id}`}>Note (optional)</label>
                              <input
                                id={`shortlist-note-${entry.id}`}
                                value={decisionNotes[entry.id] ?? ''}
                                onChange={(event) =>
                                  setDecisionNotes((current) => ({
                                    ...current,
                                    [entry.id]: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="record-inline-actions">
                              <button
                                className="button button-primary"
                                disabled={deciding}
                                onClick={() => void onDecision(entry, 'interested')}
                                type="button"
                              >
                                Interested
                              </button>
                              <button
                                className="button button-secondary"
                                disabled={deciding}
                                onClick={() => void onDecision(entry, 'rejected')}
                                type="button"
                              >
                                Not interested
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="employee-secondary">
                            This round is closed — your decisions are final.
                          </div>
                        )}
                        {decisionError ? (
                          <p className="auth-error" role="alert">
                            {decisionError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!isTethr && interviewOutcomes.length > 0 ? (
          <section className="table-shell" aria-label="Interview outcomes">
            <div className="table-density">Interview outcomes</div>
            <div className="record-list">
              {interviewOutcomes.map((outcome) => (
                <div className="record-item" key={outcome.interviewId}>
                  <div>
                    <div className="record-inline-actions">
                      <span className="employee-primary">{outcome.roundName}</span>
                      <StatusChip
                        color={
                          outcome.status === 'completed'
                            ? 'green'
                            : outcome.status === 'cancelled'
                              ? 'gray'
                              : 'blue'
                        }
                        label={outcome.status === 'completed' ? 'Completed' : outcome.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
                      />
                      {outcome.outcome ? (
                        <span className="employee-secondary">
                          {outcome.outcome === 'noShow' ? 'No-show' : outcome.outcome}
                        </span>
                      ) : null}
                    </div>
                    <div className="employee-secondary">
                      {outcome.jobPostingTitle} · {formatDateTime(outcome.scheduledAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

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
            viewLabel={isTethr ? 'All clients' : 'All requests'}
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
              <FieldRow
                alwaysEditing
                label="Priority"
                onChange={(value) =>
                  create.patchDraft({ priority: value as HiringRequestPriority })
                }
                options={HIRING_REQUEST_PRIORITIES.map((priority) => ({
                  value: priority,
                  label: priorityLabels[priority],
                }))}
                type="select"
                value={create.draft.priority}
              />
            </FieldGroup>
            <FieldGroup title="Brief">
              <div className="field">
                <label htmlFor="hiring-description">Role description</label>
                <textarea
                  id="hiring-description"
                  value={create.draft.jobDescription}
                  onChange={(event) =>
                    create.patchDraft({ jobDescription: event.target.value })
                  }
                />
              </div>
              <FieldRow
                alwaysEditing
                label="Location"
                onChange={(value) => create.patchDraft({ location: value })}
                type="text"
                value={create.draft.location}
              />
              <FieldRow
                alwaysEditing
                label="Preferred start"
                onChange={(value) => create.patchDraft({ preferredStartDate: value })}
                type="date"
                value={create.draft.preferredStartDate}
              />
              <FieldRow
                alwaysEditing
                label="Target fill by"
                onChange={(value) => create.patchDraft({ targetFillDate: value })}
                type="date"
                value={create.draft.targetFillDate}
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
            <FieldGroup title="Compensation">
              <FieldRow
                alwaysEditing
                label="Salary min"
                min={0}
                onChange={(value) => create.patchDraft({ salaryMin: value })}
                type="number"
                value={create.draft.salaryMin}
              />
              <FieldRow
                alwaysEditing
                label="Salary max"
                min={0}
                onChange={(value) => create.patchDraft({ salaryMax: value })}
                type="number"
                value={create.draft.salaryMax}
              />
              <FieldRow
                alwaysEditing
                label="Currency"
                onChange={(value) => create.patchDraft({ salaryCurrency: value.toUpperCase() })}
                placeholder="USD"
                type="text"
                value={create.draft.salaryCurrency}
              />
            </FieldGroup>
            <FieldGroup title="Ownership">
              <FieldRow
                alwaysEditing
                label="Hiring manager"
                onChange={(value) => create.patchDraft({ hiringManagerEmployeeId: value })}
                options={employeeOptions}
                type="select"
                value={create.draft.hiringManagerEmployeeId}
              />
              <FieldRow
                alwaysEditing
                label="Reports to"
                onChange={(value) => create.patchDraft({ reportsToEmployeeId: value })}
                options={employeeOptions}
                type="select"
                value={create.draft.reportsToEmployeeId}
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
                  <div className="panel-kicker">
                    {selected.organizationName ? `${selected.organizationName} · ` : ''}
                    Recruitment update
                  </div>
                  <h2 className="panel-title">{selected.positionTitle}</h2>
                </div>
                <IconClipboardCheck size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
              </div>
              <div className="record-inline-actions">
                <StatusChip color={statusColors[selected.status]} label={statusLabels[selected.status]} />
                <StatusChip
                  color={priorityColors[selected.priority]}
                  label={priorityLabels[selected.priority]}
                />
                <span className="employee-secondary">{formatSalary(selected)}</span>
                {selected.targetFillDate ? (
                  <span className="employee-secondary">
                    Target fill {formatDate(selected.targetFillDate)}
                  </span>
                ) : null}
              </div>
              {panelError ? (
                <p className="auth-error record-panel-error" role="alert">
                  {panelError}
                </p>
              ) : null}
              {renderUpdateTrail(selected)}
              {selected.status === 'open' ? (
                <section className="request-note">
                  <div className="field-label">Public application</div>
                  {livePosting?.isPublished ? (
                    <>
                      <p>This posting is live and accepting applications.</p>
                      {/* The link is re-minted on read, so it survives a reload. */}
                      {livePosting.applyPath ?? applyLink ? (
                        <p>
                          Live link:{' '}
                          <code>{`${window.location.origin}${livePosting.applyPath ?? applyLink}`}</code>
                        </p>
                      ) : null}
                      <div className="record-panel-actions">
                        {livePosting.applyPath ?? applyLink ? (
                          <button
                            className="button button-secondary"
                            onClick={() =>
                              void navigator.clipboard.writeText(
                                `${window.location.origin}${livePosting.applyPath ?? applyLink}`,
                              )
                            }
                            type="button"
                          >
                            Copy link
                          </button>
                        ) : null}
                        <button
                          className="button button-secondary"
                          disabled={unpublishing}
                          onClick={() => void onUnpublish()}
                          type="button"
                        >
                          {unpublishing ? 'Unpublishing…' : 'Unpublish'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className="button button-secondary"
                      disabled={publishing}
                      onClick={() => void onPublish()}
                      type="button"
                    >
                      {publishing ? 'Publishing…' : 'Publish & get apply link'}
                    </button>
                  )}
                </section>
              ) : null}
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
                    {statusOptionsFor(selected.status).map((status) => (
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
                {renderBrief(selected)}
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
              <div className="record-inline-actions">
                <StatusChip color={statusColors[selected.status]} label={statusLabels[selected.status]} />
              </div>
              {renderUpdateTrail(selected)}
              {renderBrief(selected)}
            </section>
          )
        ) : null}
      </SidePanel>
    </main>
  );
};
