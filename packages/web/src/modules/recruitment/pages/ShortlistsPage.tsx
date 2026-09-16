import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import type { MainColorName } from '@hrms/ui';
import {
  IconAlertTriangle,
  IconBriefcase,
  IconFilterOff,
  IconPlus,
  IconRefresh,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import {
  DataTable,
  toViewColumns,
  type ColumnDefinition,
} from '../../../components/table/DataTable';
import { Tooltip } from '../../../components/tooltip/Tooltip';
import { useListView } from '../../../components/view-bar/useListView';
import { ViewBar } from '../../../components/view-bar/ViewBar';
import { useTheme } from '../../../providers/theme/useTheme';
import { JOB_POSTINGS_QUERY } from '../graphql/ats.operations';
import {
  CLOSE_SHORTLIST_MUTATION,
  CREATE_SHORTLIST_MUTATION,
  POSTING_APPLICATIONS_QUERY,
  PRESENT_SHORTLIST_MUTATION,
  SHORTLISTS_QUERY,
} from '../graphql/shortlist.operations';

type PostingRecord = {
  readonly id: string;
  readonly title: string;
  readonly isPublished: boolean;
};

type EntryRecord = {
  readonly id: string;
  readonly applicationId: string;
  readonly candidateId: string;
  readonly candidateName: string;
  readonly candidateEmail: string;
  readonly currentTitle: string | null;
  readonly manualRating: number | null;
  readonly rank: number;
  readonly clientDecision: 'pending' | 'interested' | 'rejected';
  readonly clientNote: string | null;
  readonly hasResume: boolean;
};

type ShortlistRecord = {
  readonly id: string;
  readonly jobPostingId: string;
  readonly jobPostingTitle: string;
  readonly roundNumber: number;
  readonly status: 'draft' | 'presented' | 'feedbackReceived' | 'closed';
  readonly presentedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly entries: readonly EntryRecord[];
};

type ApplicationOption = {
  readonly id: string;
  readonly candidateName: string;
  readonly currentTitle: string | null;
  readonly manualRating: number | null;
  readonly expectedSalary: number | null;
  readonly salaryCurrency: string | null;
  readonly yearsExperience: number | null;
};

const statusLabels: Record<ShortlistRecord['status'], string> = {
  draft: 'Draft',
  presented: 'Presented',
  feedbackReceived: 'Feedback received',
  closed: 'Closed',
};

const statusColors: Record<ShortlistRecord['status'], MainColorName> = {
  draft: 'gray',
  presented: 'blue',
  feedbackReceived: 'amber',
  closed: 'green',
};

const decisionLabels: Record<EntryRecord['clientDecision'], string> = {
  pending: 'Awaiting client',
  interested: 'Interested',
  rejected: 'Not interested',
};

const decisionColors: Record<EntryRecord['clientDecision'], MainColorName> = {
  pending: 'gray',
  interested: 'green',
  rejected: 'red',
};

const formatDate = (value: string | null): string =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(value),
      );

export const ShortlistsPage = () => {
  const { theme } = useTheme();
  const { data: postingsData, loading: postingsLoading } = useQuery<{
    readonly jobPostings: readonly PostingRecord[];
  }>(JOB_POSTINGS_QUERY);
  const postings = postingsData?.jobPostings ?? [];
  const [selectedPostingId, setSelectedPostingId] = useState<string>('');
  useEffect(() => {
    if (!selectedPostingId && postings.length > 0) {
      setSelectedPostingId(postings[0].id);
    }
  }, [postings, selectedPostingId]);

  const {
    data: shortlistsData,
    loading: shortlistsLoading,
    error: shortlistsError,
    refetch,
  } = useQuery<{ readonly shortlists: readonly ShortlistRecord[] }>(SHORTLISTS_QUERY, {
    variables: { jobPostingId: selectedPostingId },
    skip: selectedPostingId === '',
  });
  const shortlists = shortlistsData?.shortlists ?? [];
  const selectedPosting = postings.find((posting) => posting.id === selectedPostingId) ?? null;
  const [loadApplications, { data: applicationsData, loading: applicationsLoading }] =
    useLazyQuery<{ readonly postingApplications: readonly ApplicationOption[] }>(
      POSTING_APPLICATIONS_QUERY,
      { fetchPolicy: 'network-only' },
    );
  const [createShortlist, { loading: creating }] = useMutation(CREATE_SHORTLIST_MUTATION);
  const [presentShortlist, { loading: presenting }] = useMutation(PRESENT_SHORTLIST_MUTATION);
  const [closeShortlist, { loading: closing }] = useMutation(CLOSE_SHORTLIST_MUTATION);
  const [selectedShortlistId, setSelectedShortlistId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<readonly string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const view = useListView({ routeKey: '/hiring/shortlists' });
  const selectedShortlist = shortlists.find((entry) => entry.id === selectedShortlistId) ?? null;

  const openBuilder = (): void => {
    if (selectedPostingId === '') return;
    setBuilding(true);
    setSelectedApplicationIds([]);
    setFormError(null);
    void loadApplications({ variables: { jobPostingId: selectedPostingId } });
  };

  const toggleApplication = (applicationId: string): void => {
    setSelectedApplicationIds((current) =>
      current.includes(applicationId)
        ? current.filter((id) => id !== applicationId)
        : [...current, applicationId],
    );
  };

  const submitShortlist = async (): Promise<void> => {
    if (selectedApplicationIds.length === 0) {
      setFormError('Select at least one candidate');
      return;
    }
    try {
      await createShortlist({
        variables: {
          input: { jobPostingId: selectedPostingId, applicationIds: [...selectedApplicationIds] },
        },
      });
      setBuilding(false);
      await refetch();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create the shortlist');
    }
  };

  const onPresent = async (shortlist: ShortlistRecord): Promise<void> => {
    await presentShortlist({ variables: { input: { shortlistId: shortlist.id } } });
    await refetch();
  };

  const onClose = async (shortlist: ShortlistRecord): Promise<void> => {
    await closeShortlist({ variables: { input: { shortlistId: shortlist.id } } });
    await refetch();
  };

  const interestedCount = (shortlist: ShortlistRecord): number =>
    shortlist.entries.filter((entry) => entry.clientDecision === 'interested').length;
  const rejectedCount = (shortlist: ShortlistRecord): number =>
    shortlist.entries.filter((entry) => entry.clientDecision === 'rejected').length;

  const columns: readonly ColumnDefinition<ShortlistRecord>[] = [
    {
      key: 'round',
      header: 'Round',
      width: '10%',
      hideable: false,
      sortValue: (shortlist) => shortlist.roundNumber,
      render: (shortlist) => `Round ${shortlist.roundNumber}`,
    },
    {
      key: 'candidates',
      header: 'Candidates',
      width: '32%',
      sortValue: (shortlist) => shortlist.entries.length,
      render: (shortlist) => (
        <>
          <div className="employee-primary">{shortlist.entries.length} presented</div>
          <div className="employee-secondary">
            {shortlist.entries.map((entry) => entry.candidateName).join(', ')}
          </div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '16%',
      hideable: false,
      sortValue: (shortlist) => shortlist.status,
      render: (shortlist) => (
        <StatusChip color={statusColors[shortlist.status]} label={statusLabels[shortlist.status]} />
      ),
    },
    {
      key: 'feedback',
      header: 'Client feedback',
      width: '16%',
      sortValue: (shortlist) => interestedCount(shortlist),
      render: (shortlist) => (
        <>
          <div>{interestedCount(shortlist)} interested</div>
          <div className="employee-secondary">{rejectedCount(shortlist)} not interested</div>
        </>
      ),
    },
    {
      key: 'presented',
      header: 'Presented',
      width: '14%',
      sortValue: (shortlist) => shortlist.presentedAt ?? '',
      render: (shortlist) => formatDate(shortlist.presentedAt),
    },
    {
      key: 'actions',
      header: '',
      width: '12%',
      align: 'right',
      render: (shortlist) => (
        <div className="record-inline-actions">
          {shortlist.status === 'draft' ? (
            <button
              className="button button-secondary"
              disabled={presenting}
              onClick={(event) => {
                event.stopPropagation();
                void onPresent(shortlist);
              }}
              type="button"
            >
              Present
            </button>
          ) : null}
          {shortlist.status === 'presented' || shortlist.status === 'feedbackReceived' ? (
            <button
              className="button button-secondary"
              disabled={closing}
              onClick={(event) => {
                event.stopPropagation();
                void onClose(shortlist);
              }}
              type="button"
            >
              Close
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const postingOptions = useMemo(
    () => postings.map((posting) => ({ id: posting.id, title: posting.title })),
    [postings],
  );

  return (
    <section className="list-with-panel">
      <section className="hiring-content" aria-labelledby="shortlists-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="shortlists-title">
              Shortlists
            </h1>
            <p className="page-subtitle">
              Present candidates to the client in rounds and collect their verdicts.
            </p>
          </div>
          <div className="page-actions">
            <select
              aria-label="Posting"
              className="record-field-control"
              disabled={postingsLoading || postingOptions.length === 0}
              name="posting"
              value={selectedPostingId}
              onChange={(event) => setSelectedPostingId(event.target.value)}
            >
              {postingOptions.length === 0 ? <option value="">No published roles</option> : null}
              {postingOptions.map((posting) => (
                <option key={posting.id} value={posting.id}>
                  {posting.title}
                </option>
              ))}
            </select>
            <Tooltip label="Refresh shortlists">
              <button
                aria-label="Refresh shortlists"
                className="icon-button"
                onClick={() => void refetch()}
                type="button"
              >
                <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </button>
            </Tooltip>
            <button
              className="button button-primary"
              disabled={selectedPostingId === ''}
              onClick={openBuilder}
              type="button"
            >
              <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              New round
            </button>
          </div>
        </header>

        <section className="table-shell" aria-label="Shortlists">
          <ViewBar
            columns={toViewColumns(columns)}
            count={shortlists.length}
            filters={[]}
            view={view}
            viewLabel={selectedPosting ? selectedPosting.title : 'All rounds'}
          />
          <DataTable
            columns={columns}
            emptyState={
              shortlistsError ? (
                <EmptyState
                  icon={IconAlertTriangle}
                  title="Could not load shortlists"
                  description="Is the API running, and are you still signed in?"
                />
              ) : postings.length === 0 ? (
                <EmptyState
                  icon={IconBriefcase}
                  title="No published roles yet"
                  description="Open a client request and publish it to get an apply link first."
                />
              ) : shortlists.length === 0 ? (
                <EmptyState
                  icon={IconUsersGroup}
                  title="No rounds for this role"
                  description="Build the first round from the applications received."
                  action={
                    <button className="button button-primary" onClick={openBuilder} type="button">
                      <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                      New round
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={IconFilterOff}
                  title="Nothing to show"
                  description="Adjust the view."
                />
              )
            }
            getRowKey={(shortlist) => shortlist.id}
            hiddenColumns={view.hiddenColumns}
            loading={shortlistsLoading && !shortlistsError}
            onHideColumn={view.hideColumn}
            onRowClick={(shortlist) => setSelectedShortlistId(shortlist.id)}
            onSort={view.setSort}
            rows={shortlistsError ? [] : shortlists}
            selectedRowKey={selectedShortlistId}
            sorts={view.sorts}
            tableClassName="data-table shortlists-table"
          />
        </section>
      </section>

      <SidePanel
        isOpen={building || selectedShortlist !== null}
        onClose={() => {
          if (building) {
            setBuilding(false);
            return;
          }
          setSelectedShortlistId(null);
        }}
        title={building ? 'New shortlist round' : `Round ${selectedShortlist?.roundNumber ?? ''}`}
      >
        {building ? (
          <section>
            <div className="table-density">Select candidates in the order you want to rank them.</div>
            <div className="record-list">
              {applicationsLoading ? <p className="page-subtitle">Loading applications…</p> : null}
              {(applicationsData?.postingApplications ?? []).map((application) => {
                const rank = selectedApplicationIds.indexOf(application.id) + 1;
                return (
                  <label className="record-item" key={application.id}>
                    <input
                      aria-label={`Select ${application.candidateName}`}
                      checked={rank > 0}
                      name={`shortlist-candidate-${application.id}`}
                      onChange={() => toggleApplication(application.id)}
                      type="checkbox"
                    />
                    <div>
                      <div className="employee-primary">
                        {application.candidateName}
                        {rank > 0 ? ` · rank ${rank}` : ''}
                      </div>
                      <div className="employee-secondary">
                        {[
                          application.currentTitle,
                          application.yearsExperience !== null
                            ? `${application.yearsExperience} yrs`
                            : null,
                          application.manualRating !== null
                            ? `rating ${application.manualRating}/5`
                            : 'unrated',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </label>
                );
              })}
              {(applicationsData?.postingApplications ?? []).length === 0 && !applicationsLoading ? (
                <p className="table-empty">No applications for this role yet.</p>
              ) : null}
            </div>
            {formError ? (
              <p className="auth-error record-panel-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="record-panel-actions">
              <button
                className="button button-primary"
                disabled={creating}
                onClick={() => void submitShortlist()}
                type="button"
              >
                {creating ? 'Creating…' : 'Create draft'}
              </button>
              <button className="button button-secondary" onClick={() => setBuilding(false)} type="button">
                Cancel
              </button>
            </div>
          </section>
        ) : selectedShortlist ? (
          <section>
            <div className="record-inline-actions">
              <StatusChip
                color={statusColors[selectedShortlist.status]}
                label={statusLabels[selectedShortlist.status]}
              />
              <span className="employee-secondary">
                {selectedShortlist.jobPostingTitle} · round {selectedShortlist.roundNumber}
              </span>
              {selectedShortlist.closedAt ? (
                <span className="employee-secondary">
                  Closed {formatDate(selectedShortlist.closedAt)}
                </span>
              ) : null}
            </div>
            <div className="record-list">
              {selectedShortlist.entries.map((entry) => (
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
                      {entry.manualRating !== null ? (
                        <span className="employee-secondary">{entry.manualRating}/5</span>
                      ) : null}
                    </div>
                    <div className="employee-secondary">
                      {[entry.currentTitle, entry.candidateEmail].filter(Boolean).join(' · ')}
                    </div>
                    {entry.clientNote ? (
                      <div className="leave-trail-note">{entry.clientNote}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </SidePanel>
    </section>
  );
};
