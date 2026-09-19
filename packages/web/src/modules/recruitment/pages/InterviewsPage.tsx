import { useMutation, useQuery } from '@apollo/client';
import {
  formatDateTime,
  INTERVIEW_OUTCOMES,
  type InterviewOutcome,
  type InterviewStatus,
} from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconAlertTriangle,
  IconCalendarPlus,
  IconListCheck,
  IconRefresh,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { useConfirm } from '../../../components/confirm/ConfirmProvider';
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
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { useTheme } from '../../../providers/theme/useTheme';
import {
  INTERVIEWS_QUERY,
  INTERVIEW_ROUNDS_QUERY,
  RECORD_INTERVIEW_FEEDBACK_MUTATION,
  SCHEDULE_INTERVIEW_MUTATION,
  SHORTLIST_READY_APPLICATIONS_QUERY,
  UPDATE_INTERVIEW_MUTATION,
  WITHDRAW_INTERVIEW_FEEDBACK_MUTATION,
} from '../graphql/interview.operations';

type PanelMemberRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly displayName: string;
  readonly hasFiledFeedback: boolean;
};

type FeedbackRecord = {
  readonly id: string;
  readonly panelMemberId: string;
  readonly overallNote: string | null;
  readonly submittedAt: string;
  readonly average: number | null;
  readonly scores: readonly { readonly skill: string; readonly score: number }[];
};

type InterviewRecord = {
  readonly id: string;
  readonly applicationId: string;
  readonly candidateName: string;
  readonly jobPostingTitle: string;
  readonly round: { readonly id: string; readonly name: string; readonly skills: readonly string[] };
  readonly scheduledAt: string;
  readonly status: InterviewStatus;
  readonly outcome: InterviewOutcome | null;
  readonly average: number | null;
  readonly feedbacksExpected: number;
  readonly skillAverages: readonly { readonly skill: string; readonly average: number }[];
  readonly panel: readonly PanelMemberRecord[];
  readonly feedbacks: readonly FeedbackRecord[];
};

type RoundRecord = {
  readonly id: string;
  readonly name: string;
  readonly skills: readonly string[];
};

type ReadyApplicationRecord = {
  readonly id: string;
  readonly candidateName: string;
  readonly jobPostingTitle: string;
  readonly manualRating: number | null;
};

const statusLabels: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusColors: Record<InterviewStatus, MainColorName> = {
  scheduled: 'blue',
  completed: 'green',
  cancelled: 'gray',
};

const outcomeLabels: Record<InterviewOutcome, string> = {
  passed: 'Passed',
  failed: 'Failed',
  noShow: 'No-show',
};

export const InterviewsPage = () => {
  const { theme } = useTheme();
  const confirm = useConfirm();
  const { data, loading, error, refetch } = useQuery<{
    readonly interviews: readonly InterviewRecord[];
  }>(INTERVIEWS_QUERY);
  const { data: roundsData } = useQuery<{ readonly interviewRounds: readonly RoundRecord[] }>(
    INTERVIEW_ROUNDS_QUERY,
  );
  const { data: readyData } = useQuery<{
    readonly shortlistReadyApplications: readonly ReadyApplicationRecord[];
  }>(SHORTLIST_READY_APPLICATIONS_QUERY);
  const [scheduleInterview, { loading: scheduling }] = useMutation(SCHEDULE_INTERVIEW_MUTATION);
  const [updateInterview] = useMutation(UPDATE_INTERVIEW_MUTATION);
  const [recordFeedback, { loading: filing }] =
    useMutation(RECORD_INTERVIEW_FEEDBACK_MUTATION);
  const [withdrawFeedback] = useMutation(WITHDRAW_INTERVIEW_FEEDBACK_MUTATION);
  const interviews = data?.interviews ?? [];
  const rounds = roundsData?.interviewRounds ?? [];
  const readyApplications = readyData?.shortlistReadyApplications ?? [];
  const view = useListView({ routeKey: '/hiring/interviews' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    applicationId: '',
    interviewRoundId: '',
    scheduledAt: '',
    panel: [''],
    notes: '',
  });
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [feedbackNote, setFeedbackNote] = useState('');
  // Pending/error bookkeeping for fire-and-forget actions (row status changes,
  // outcome selects, feedback withdrawal, refresh).
  const rowAction = useAsyncAction();

  const selected = interviews.find((entry) => entry.id === selectedId) ?? null;

  const columns: readonly ColumnDefinition<InterviewRecord>[] = useMemo(
    () => [
      {
        key: 'candidate',
        header: 'Candidate',
        width: '24%',
        hideable: false,
        sortValue: (interview) => interview.candidateName,
        render: (interview) => (
          <>
            <div className="employee-primary">{interview.candidateName}</div>
            <div className="employee-secondary">{interview.jobPostingTitle}</div>
          </>
        ),
      },
      {
        key: 'round',
        header: 'Round',
        width: '20%',
        sortValue: (interview) => interview.round.name,
        render: (interview) => interview.round.name,
      },
      {
        key: 'scheduled',
        header: 'Scheduled',
        width: '18%',
        sortValue: (interview) => interview.scheduledAt,
        render: (interview) => formatDateTime(interview.scheduledAt),
      },
      {
        key: 'status',
        header: 'Status',
        width: '14%',
        hideable: false,
        sortValue: (interview) => interview.status,
        render: (interview) => (
          <StatusChip color={statusColors[interview.status]} label={statusLabels[interview.status]} />
        ),
      },
      {
        key: 'scorecards',
        header: 'Scorecards',
        width: '12%',
        sortValue: (interview) =>
          interview.panel.filter((member) => member.hasFiledFeedback).length,
        render: (interview) =>
          `${interview.panel.filter((member) => member.hasFiledFeedback).length} of ${interview.feedbacksExpected}`,
      },
      {
        key: 'average',
        header: 'Average',
        width: '12%',
        align: 'right',
        sortValue: (interview) => interview.average ?? 0,
        render: (interview) => (interview.average === null ? '—' : interview.average.toFixed(1)),
      },
      {
        key: 'outcome',
        header: 'Outcome',
        width: '12%',
        sortValue: (interview) => interview.outcome ?? '',
        render: (interview) => (interview.outcome ? outcomeLabels[interview.outcome] : '—'),
      },
    ],
    [],
  );

  const submitSchedule = async (): Promise<void> => {
    const panel = scheduleForm.panel
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .map((externalName) => ({ externalName }));
    if (!scheduleForm.applicationId || !scheduleForm.interviewRoundId || !scheduleForm.scheduledAt) {
      setFormError('Pick the application, round and time');
      return;
    }
    if (panel.length === 0) {
      setFormError('Add at least one panellist');
      return;
    }
    setFormError(null);
    try {
      await scheduleInterview({
        variables: {
          input: {
            applicationId: scheduleForm.applicationId,
            interviewRoundId: scheduleForm.interviewRoundId,
            scheduledAt: new Date(scheduleForm.scheduledAt).toISOString(),
            panel,
            notes: scheduleForm.notes || null,
          },
        },
      });
      setSchedulingOpen(false);
      setScheduleForm({ applicationId: '', interviewRoundId: '', scheduledAt: '', panel: [''], notes: '' });
      await refetch();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not schedule the interview');
    }
  };

  const submitFeedback = async (interview: InterviewRecord, member: PanelMemberRecord): Promise<void> => {
    const scores = interview.round.skills.map((skill) => ({
      skill,
      score: Number(scoreDrafts[`${member.id}:${skill}`] ?? '0'),
    }));
    if (scores.some((score) => score.score < 1 || score.score > 5)) {
      setFormError('Score every skill from 1 to 5');
      return;
    }
    setFormError(null);
    try {
      await recordFeedback({
        variables: {
          input: {
            interviewId: interview.id,
            panelMemberId: member.id,
            scores,
            overallNote: feedbackNote || null,
          },
        },
      });
      setFeedbackFor(null);
      setScoreDrafts({});
      setFeedbackNote('');
      await refetch();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not file the scorecard');
    }
  };

  const onStatus = async (interview: InterviewRecord, status: InterviewStatus): Promise<void> => {
    if (status === 'cancelled') {
      const confirmed = await confirm({
        title: 'Cancel this interview?',
        body: 'The interview will be cancelled and the panel will see it as cancelled.',
        confirmLabel: 'Cancel',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    await updateInterview({ variables: { input: { interviewId: interview.id, status } } });
    await refetch();
  };

  const onOutcome = async (interview: InterviewRecord, outcome: InterviewOutcome): Promise<void> => {
    await updateInterview({
      variables: {
        input: { interviewId: interview.id, status: 'completed', outcome },
      },
    });
    await refetch();
  };

  const onWithdraw = async (feedback: FeedbackRecord): Promise<void> => {
    const confirmed = await confirm({
      title: 'Withdraw this feedback?',
      body: 'The scorecard will be removed from this interview.',
      confirmLabel: 'Withdraw',
      tone: 'danger',
    });
    if (!confirmed) return;
    await withdrawFeedback({ variables: { input: { feedbackId: feedback.id } } });
    await refetch();
  };

  const runRowAction = (action: () => Promise<void>, fallbackMessage: string): void => {
    void rowAction.run(action, fallbackMessage);
  };

  return (
    <section className="list-with-panel">
      <section className="hiring-content" aria-labelledby="interviews-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="interviews-title">
              Interviews
            </h1>
            <p className="page-subtitle">
              Schedule rounds and file scorecards on the client&rsquo;s behalf.
            </p>
          </div>
          <div className="page-actions">
            <Tooltip label="Refresh interviews">
              <button
                aria-label="Refresh interviews"
                className="icon-button"
                onClick={() =>
                  runRowAction(async () => {
                    await refetch();
                  }, 'Could not refresh interviews')
                }
                type="button"
              >
                <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </button>
            </Tooltip>
            <button
              className="button button-primary"
              onClick={() => {
                setSchedulingOpen(true);
                setFormError(null);
              }}
              type="button"
            >
              <IconCalendarPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Schedule interview
            </button>
          </div>
        </header>

        {rowAction.error ? (
          <p className="auth-error" role="alert">
            {rowAction.error}
          </p>
        ) : null}

        <section className="table-shell" aria-label="Interviews">
          <ViewBar
            columns={toViewColumns(columns)}
            count={interviews.length}
            filters={[]}
            view={view}
            viewLabel="All interviews"
          />
          <DataTable
            columns={columns}
            emptyState={
              error ? (
                <EmptyState
                  icon={IconAlertTriangle}
                  title="Could not load interviews"
                  description="Is the API running, and are you still signed in?"
                />
              ) : (
                <EmptyState
                  icon={IconListCheck}
                  title="No interviews yet"
                  description="Present a shortlist to the client, then schedule rounds from the shortlisted candidates."
                />
              )
            }
            getRowKey={(interview) => interview.id}
            hiddenColumns={view.hiddenColumns}
            loading={loading && !error}
            onHideColumn={view.hideColumn}
            onRowClick={(interview) => setSelectedId(interview.id)}
            onSort={view.setSort}
            rows={error ? [] : interviews}
            selectedRowKey={selectedId}
            sorts={view.sorts}
            tableClassName="data-table interviews-table"
          />
        </section>
      </section>

      <SidePanel
        isOpen={schedulingOpen || selected !== null}
        onClose={() => {
          if (schedulingOpen) {
            setSchedulingOpen(false);
            return;
          }
          setSelectedId(null);
          setFeedbackFor(null);
        }}
        title={schedulingOpen ? 'Schedule interview' : 'Interview'}
      >
        {schedulingOpen ? (
          <section className="config-form">
            <div className="field">
              <label htmlFor="interview-application">Application</label>
              <select
                id="interview-application"
                name="interview-application"
                value={scheduleForm.applicationId}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, applicationId: event.target.value }))
                }
              >
                <option value="">Select candidate…</option>
                {readyApplications.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.candidateName} · {application.jobPostingTitle}
                    {application.manualRating !== null ? ` · ${application.manualRating}/5` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="interview-round">Round</label>
              <select
                id="interview-round"
                name="interview-round"
                value={scheduleForm.interviewRoundId}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    interviewRoundId: event.target.value,
                  }))
                }
              >
                <option value="">Select round…</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.name} ({round.skills.length} skills)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="interview-time">Scheduled at</label>
              <input
                id="interview-time"
                name="interview-time"
                type="datetime-local"
                value={scheduleForm.scheduledAt}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, scheduledAt: event.target.value }))
                }
              />
            </div>
            {scheduleForm.panel.map((member, index) => (
              <div className="field" key={`panel-${index}`}>
                <label htmlFor={`interview-panel-${index}`}>Panellist {index + 1} (external name)</label>
                <input
                  id={`interview-panel-${index}`}
                  name={`interview-panel-${index}`}
                  value={member}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      panel: current.panel.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <button
              className="button button-secondary"
              onClick={() =>
                setScheduleForm((current) => ({ ...current, panel: [...current.panel, ''] }))
              }
              type="button"
            >
              Add panellist
            </button>
            <div className="field">
              <label htmlFor="interview-notes">Notes</label>
              <textarea
                id="interview-notes"
                name="interview-notes"
                value={scheduleForm.notes}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
            {formError ? (
              <p className="auth-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="record-panel-actions">
              <button
                className="button button-primary"
                disabled={scheduling}
                onClick={() => void submitSchedule()}
                type="button"
              >
                {scheduling ? 'Scheduling…' : 'Schedule'}
              </button>
              <button
                className="button button-secondary"
                onClick={() => setSchedulingOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : selected ? (
          <section>
            <div className="record-inline-actions">
              <StatusChip color={statusColors[selected.status]} label={statusLabels[selected.status]} />
              {selected.outcome ? (
                <StatusChip color="green" label={outcomeLabels[selected.outcome]} />
              ) : null}
              <span className="employee-secondary">
                {selected.candidateName} · {selected.round.name}
              </span>
            </div>
            <div className="employee-secondary">{formatDateTime(selected.scheduledAt)}</div>
            {selected.average !== null ? (
              <div className="employee-secondary">
                Average {selected.average.toFixed(1)}/5
                {selected.skillAverages.length > 0
                  ? ` · ${selected.skillAverages
                      .map((entry) => `${entry.skill} ${entry.average.toFixed(1)}`)
                      .join(', ')}`
                  : ''}
              </div>
            ) : null}
            <div className="record-inline-actions">
              {selected.status === 'scheduled' ? (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      runRowAction(async () => {
                        await onStatus(selected, 'completed');
                      }, 'Could not update the interview')
                    }
                    type="button"
                  >
                    Mark completed
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      runRowAction(async () => {
                        await onStatus(selected, 'cancelled');
                      }, 'Could not update the interview')
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
              {selected.status === 'completed' ? (
                <select
                  aria-label="Outcome"
                  className="record-field-control"
                  name="interview-outcome"
                  value={selected.outcome ?? ''}
                  onChange={(event) =>
                    runRowAction(async () => {
                      await onOutcome(selected, event.target.value as InterviewOutcome);
                    }, 'Could not update the outcome')
                  }
                >
                  <option value="">Set outcome…</option>
                  {INTERVIEW_OUTCOMES.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {outcomeLabels[outcome]}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="table-density">Scorecards</div>
            <div className="record-list">
              {selected.panel.map((member) => {
                const feedback = selected.feedbacks.find(
                  (entry) => entry.panelMemberId === member.id,
                );
                return (
                  <div className="record-item" key={member.id}>
                    <div>
                      <div className="record-inline-actions">
                        <span className="employee-primary">{member.displayName}</span>
                        <StatusChip
                          color={feedback ? 'green' : 'gray'}
                          label={feedback ? 'Filed' : 'Pending'}
                        />
                        {feedback && feedback.average !== null ? (
                          <span className="employee-secondary">
                            {feedback.average.toFixed(1)}/5
                          </span>
                        ) : null}
                      </div>
                      {feedback ? (
                        <>
                          <div className="employee-secondary">
                            {feedback.scores
                              .map((score) => `${score.skill} ${score.score}`)
                              .join(' · ')}
                          </div>
                          {feedback.overallNote ? (
                            <div className="leave-trail-note">{feedback.overallNote}</div>
                          ) : null}
                          <button
                            className="button button-secondary"
                            onClick={() =>
                            runRowAction(async () => {
                              await onWithdraw(feedback);
                            }, 'Could not withdraw the feedback')
                          }
                            type="button"
                          >
                            Withdraw
                          </button>
                        </>
                      ) : feedbackFor === member.id ? (
                        <>
                          {selected.round.skills.map((skill) => (
                            <div className="field" key={skill}>
                              <label htmlFor={`score-${member.id}-${skill}`}>{skill}</label>
                              <input
                                id={`score-${member.id}-${skill}`}
                                inputMode="numeric"
                                max={5}
                                min={1}
                                name={`score-${member.id}-${skill}`}
                                type="number"
                                value={scoreDrafts[`${member.id}:${skill}`] ?? ''}
                                onChange={(event) =>
                                  setScoreDrafts((current) => ({
                                    ...current,
                                    [`${member.id}:${skill}`]: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          ))}
                          <div className="field">
                            <label htmlFor={`note-${member.id}`}>Overall note</label>
                            <textarea
                              id={`note-${member.id}`}
                              name={`note-${member.id}`}
                              value={feedbackNote}
                              onChange={(event) => setFeedbackNote(event.target.value)}
                            />
                          </div>
                          {formError ? (
                            <p className="auth-error" role="alert">
                              {formError}
                            </p>
                          ) : null}
                          <div className="record-inline-actions">
                            <button
                              className="button button-primary"
                              disabled={filing}
                              onClick={() => void submitFeedback(selected, member)}
                              type="button"
                            >
                              {filing ? 'Filing…' : 'File scorecard'}
                            </button>
                            <button
                              className="button button-secondary"
                              onClick={() => {
                                setFeedbackFor(null);
                                setFormError(null);
                              }}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          className="button button-secondary"
                          onClick={() => {
                            setFeedbackFor(member.id);
                            setScoreDrafts({});
                            setFeedbackNote('');
                            setFormError(null);
                          }}
                          type="button"
                        >
                          File scorecard
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </SidePanel>
    </section>
  );
};
