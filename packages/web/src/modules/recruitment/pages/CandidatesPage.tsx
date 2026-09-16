import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  type ApplicationOutcome,
  type ApplicationStage,
} from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconAlertTriangle,
  IconFilterOff,
  IconPlus,
  IconRefresh,
  IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { focusFirstByName } from '../../../components/form/validation';
import { FieldGroup } from '../../../components/record-panel/FieldGroup';
import { FieldRow } from '../../../components/record-panel/FieldRow';
import { useInlineCreate } from '../../../components/record-panel/useInlineCreate';
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
import {
  ACCEPT_OFFER_MUTATION,
  CANDIDATE_DETAIL_QUERY,
  CANDIDATES_QUERY,
  CREATE_CANDIDATE_MUTATION,
  CREATE_OFFER_MUTATION,
  DECLINE_OFFER_MUTATION,
  OFFERS_QUERY,
  SEND_OFFER_MUTATION,
  UPDATE_APPLICATION_MUTATION,
  WITHDRAW_OFFER_MUTATION,
} from '../graphql/ats.operations';

type CandidateRecord = {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly linkedin: string | null;
  readonly portfolio: string | null;
  readonly source: string;
  readonly createdAt: string;
  readonly applicationCount: number;
};

type ApplicationRecord = {
  readonly id: string;
  readonly jobPostingTitle: string;
  readonly stage: ApplicationStage;
  readonly outcome: ApplicationOutcome;
  readonly onHold: boolean;
  readonly holdReason: string | null;
  readonly expectedSalary: number | null;
  readonly salaryCurrency: string | null;
  readonly currentTitle: string | null;
  readonly yearsExperience: number | null;
  readonly location: string | null;
  readonly skills: string | null;
  readonly coverNote: string | null;
  readonly manualRating: number | null;
  readonly notes: string | null;
  readonly hasResume: boolean;
  readonly cvParse: {
    readonly status: string;
    readonly provider: string | null;
    readonly parsedAt: string | null;
    readonly score: number | null;
  } | null;
  readonly createdAt: string;
};

type CandidateDetail = CandidateRecord & { readonly applications: readonly ApplicationRecord[] };

// The AI parse seam is deliberately a stub; surface its state plainly instead
// of showing nothing while every row sits pending forever.
const cvParseLabel = (parse: ApplicationRecord['cvParse']): string | null => {
  if (!parse) return null;
  if (parse.status === 'parsed') {
    return parse.score === null ? 'AI parse ready' : `AI score ${parse.score}`;
  }
  if (parse.status === 'failed') return 'AI parse failed';
  return 'Awaiting AI parsing';
};

type OfferRecord = {
  readonly id: string;
  readonly applicationId: string;
  readonly baseSalary: number;
  readonly salaryCurrency: string;
  readonly startDate: string;
  readonly probationDays: number | null;
  readonly noticePeriodDays: number | null;
  readonly status: 'draft' | 'sent' | 'accepted' | 'declined' | 'withdrawn';
  readonly hiredEmployeeId: string | null;
  readonly notes: string | null;
};

const stageLabels: Record<ApplicationStage, string> = {
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interviewing: 'Interviewing',
  offer: 'Offer',
  hired: 'Hired',
};

const outcomeColors: Record<ApplicationOutcome, MainColorName> = {
  active: 'blue',
  rejected: 'gray',
  withdrawn: 'amber',
  hired: 'green',
};

const outcomeLabels: Record<ApplicationOutcome, string> = {
  active: 'Active',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  hired: 'Hired',
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  );

type CandidateDraft = {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
};

const emptyCandidateDraft = (): CandidateDraft => ({
  fullName: '',
  email: '',
  phone: '',
  linkedin: '',
  portfolio: '',
});

export const CandidatesPage = () => {
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useQuery<{
    readonly candidates: readonly CandidateRecord[];
  }>(CANDIDATES_QUERY);
  const [loadDetail, { data: detailData, loading: detailLoading }] = useLazyQuery<{
    readonly candidate: CandidateDetail;
  }>(CANDIDATE_DETAIL_QUERY, { fetchPolicy: 'network-only' });
  const [createCandidate] = useMutation(CREATE_CANDIDATE_MUTATION);
  const [updateApplication] = useMutation(UPDATE_APPLICATION_MUTATION);
  const { data: offersData, refetch: refetchOffers } = useQuery<{
    readonly offers: readonly OfferRecord[];
  }>(OFFERS_QUERY);
  const [createOffer, { loading: creatingOffer }] = useMutation(CREATE_OFFER_MUTATION);
  const [sendOffer] = useMutation(SEND_OFFER_MUTATION);
  const [acceptOffer, { loading: acceptingOffer }] = useMutation(ACCEPT_OFFER_MUTATION);
  const [withdrawOffer] = useMutation(WITHDRAW_OFFER_MUTATION);
  const [declineOffer] = useMutation(DECLINE_OFFER_MUTATION);
  const [offerFormFor, setOfferFormFor] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState({
    baseSalary: '',
    salaryCurrency: 'USD',
    startDate: '',
    probationDays: '90',
    noticePeriodDays: '30',
    notes: '',
  });
  const offers = offersData?.offers ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applicationDrafts, setApplicationDrafts] = useState<
    Record<string, { stage: ApplicationStage; outcome: ApplicationOutcome; rating: string }>
  >({});
  const view = useListView({ routeKey: '/hiring/candidates' });
  const candidates = data?.candidates ?? [];
  const detail = detailData?.candidate ?? null;

  const create = useInlineCreate<CandidateDraft, { id: string }>({
    createEmptyDraft: emptyCandidateDraft,
    isComplete: (draft) => draft.fullName.trim() !== '' && draft.email.trim() !== '',
    requiredFieldNames: ['candidate-full-name', 'candidate-email'],
    incompleteMessage: 'Enter a full name and email before adding the candidate.',
    createRecord: async (draft) => {
      const result = await createCandidate({
        variables: {
          input: {
            fullName: draft.fullName.trim(),
            email: draft.email.trim(),
            phone: draft.phone || undefined,
            linkedin: draft.linkedin || undefined,
            portfolio: draft.portfolio || undefined,
          },
        },
      });
      await refetch();
      return result.data?.createCandidate ?? null;
    },
    onCreated: (record) => {
      setSelectedId(record.id);
      void loadDetail({ variables: { id: record.id } });
    },
  });

  const columns: readonly ColumnDefinition<CandidateRecord>[] = [
    {
      key: 'name',
      header: 'Candidate',
      width: '34%',
      hideable: false,
      sortValue: (candidate) => candidate.fullName,
      render: (candidate) => (
        <>
          <div className="employee-primary">{candidate.fullName}</div>
          <div className="employee-secondary">{candidate.email}</div>
        </>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      width: '16%',
      sortValue: (candidate) => candidate.phone ?? '',
      render: (candidate) => candidate.phone ?? '—',
    },
    {
      key: 'source',
      header: 'Source',
      width: '14%',
      sortValue: (candidate) => candidate.source,
      render: (candidate) => (candidate.source === 'manual' ? 'Added by hand' : 'Application form'),
    },
    {
      key: 'applications',
      header: 'Applications',
      width: '14%',
      align: 'right',
      sortValue: (candidate) => candidate.applicationCount,
      render: (candidate) => candidate.applicationCount,
    },
    {
      key: 'created',
      header: 'Added',
      width: '16%',
      sortValue: (candidate) => candidate.createdAt,
      render: (candidate) => formatDate(candidate.createdAt),
    },
  ];

  const openCandidate = (candidate: CandidateRecord): void => {
    if (create.draft !== null) create.discard();
    setSelectedId(candidate.id);
    void loadDetail({ variables: { id: candidate.id } });
  };

  const startCreate = (): void => {
    setSelectedId(null);
    create.start();
  };

  const draftFor = (application: ApplicationRecord): { stage: ApplicationStage; outcome: ApplicationOutcome; rating: string } =>
    applicationDrafts[application.id] ?? {
      stage: application.stage,
      outcome: application.outcome,
      rating: application.manualRating === null ? '' : String(application.manualRating),
    };

  const saveApplication = async (application: ApplicationRecord): Promise<void> => {
    const draft = draftFor(application);
    await updateApplication({
      variables: {
        input: {
          applicationId: application.id,
          stage: draft.stage,
          outcome: draft.outcome,
          manualRating: draft.rating === '' ? null : Number(draft.rating),
        },
      },
    });
    if (detail) {
      await loadDetail({ variables: { id: detail.id } });
    }
  };

  return (
    <section className="list-with-panel">
      <section className="hiring-content" aria-labelledby="candidates-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="candidates-title">
              Candidates
            </h1>
            <p className="page-subtitle">
              The shared pool — one record per person, however many roles they apply to.
            </p>
          </div>
          <div className="page-actions">
            <Tooltip label="Refresh candidates">
              <button
                aria-label="Refresh candidates"
                className="icon-button"
                onClick={() => void refetch()}
                type="button"
              >
                <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </button>
            </Tooltip>
            <button className="button button-primary" onClick={startCreate} type="button">
              <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Add candidate
            </button>
          </div>
        </header>

        <section className="table-shell" aria-label="Candidates">
          <ViewBar
            columns={toViewColumns(columns)}
            count={candidates.length}
            filters={[]}
            view={view}
            viewLabel="All candidates"
          />
          <DataTable
            columns={columns}
            emptyState={
              error ? (
                <EmptyState
                  icon={IconAlertTriangle}
                  title="Could not load candidates"
                  description="Is the API running, and are you still signed in?"
                />
              ) : candidates.length === 0 ? (
                <EmptyState
                  icon={IconUsers}
                  title="No candidates yet"
                  description="Applications land here the moment someone submits an application form — or add a candidate by hand."
                  action={
                    <button className="button button-primary" onClick={startCreate} type="button">
                      <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                      Add candidate
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={IconFilterOff}
                  title="No candidates here"
                  description="Nothing matches the current view."
                />
              )
            }
            getRowKey={(candidate) => candidate.id}
            hiddenColumns={view.hiddenColumns}
            loading={loading && !error}
            onHideColumn={view.hideColumn}
            onRowClick={openCandidate}
            onSort={view.setSort}
            rows={error ? [] : candidates}
            selectedRowKey={selectedId}
            sorts={view.sorts}
            tableClassName="data-table candidates-table"
          />
        </section>
      </section>

      <SidePanel
        isOpen={create.draft !== null || selectedId !== null}
        onClose={() => {
          if (create.draft !== null) {
            create.discard();
            return;
          }
          setSelectedId(null);
        }}
        title={create.draft !== null ? 'New candidate' : 'Candidate'}
      >
        {create.draft !== null ? (
          <div>
            <FieldGroup title="Person">
              <FieldRow
                alwaysEditing
                autoComplete="name"
                label="Full name"
                name="candidate-full-name"
                onChange={(value) => create.patchDraft({ fullName: value })}
                required
                type="text"
                value={create.draft.fullName}
              />
              <FieldRow
                alwaysEditing
                autoComplete="email"
                label="Email"
                name="candidate-email"
                onChange={(value) => create.patchDraft({ email: value })}
                required
                spellCheck={false}
                type="email"
                value={create.draft.email}
              />
              <FieldRow
                alwaysEditing
                inputMode="tel"
                label="Phone"
                name="candidate-phone"
                onChange={(value) => create.patchDraft({ phone: value })}
                type="tel"
                value={create.draft.phone}
              />
            </FieldGroup>
            <FieldGroup title="Links">
              <FieldRow
                alwaysEditing
                autoComplete="off"
                label="LinkedIn"
                name="candidate-linkedin"
                onChange={(value) => create.patchDraft({ linkedin: value })}
                spellCheck={false}
                type="text"
                value={create.draft.linkedin}
              />
              <FieldRow
                alwaysEditing
                autoComplete="off"
                label="Portfolio"
                name="candidate-portfolio"
                onChange={(value) => create.patchDraft({ portfolio: value })}
                spellCheck={false}
                type="text"
                value={create.draft.portfolio}
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
                disabled={create.isSaving}
                onClick={() => void create.commit()}
                type="button"
              >
                {create.isSaving ? 'Saving…' : 'Add candidate'}
              </button>
              <button className="button button-secondary" onClick={create.discard} type="button">
                Cancel
              </button>
            </div>
          </div>
        ) : detailLoading && detail === null ? (
          <p className="page-subtitle">Loading candidate…</p>
        ) : detail ? (
          <section>
            <div className="panel-title-row">
              <div>
                <div className="panel-kicker">{detail.source === 'manual' ? 'Added by hand' : 'Application form'}</div>
                <h2 className="panel-title">{detail.fullName}</h2>
              </div>
            </div>
            <div className="record-list">
              <div className="record-item">
                <div>
                  <div className="employee-primary">{detail.email}</div>
                  <div className="employee-secondary">
                    {[detail.phone, detail.linkedin, detail.portfolio].filter(Boolean).join(' · ') ||
                      'No contact links yet'}
                  </div>
                </div>
              </div>
            </div>

            <div className="table-density">
              {detail.applications.length} application
              {detail.applications.length === 1 ? '' : 's'}
            </div>
            <div className="record-list">
              {detail.applications.map((application) => {
                const draft = draftFor(application);
  const submitOffer = async (application: ApplicationRecord): Promise<void> => {
    const missingSalary = offerForm.baseSalary.trim() === '';
    const missingStart = offerForm.startDate === '';
    if (missingSalary || missingStart) {
      setOfferError(
        missingSalary && missingStart
          ? 'Enter a base salary and start date before creating the offer.'
          : missingSalary
            ? 'Enter a base salary before creating the offer.'
            : 'Choose a start date before creating the offer.',
      );
      focusFirstByName(document.querySelector<HTMLElement>('.side-panel'), [
        ...(missingSalary ? [`offer-salary-${application.id}`] : []),
        ...(missingStart ? [`offer-start-${application.id}`] : []),
      ]);
      return;
    }
    setOfferError(null);
    try {
      await createOffer({
        variables: {
          input: {
            applicationId: application.id,
            baseSalary: Number(offerForm.baseSalary),
            salaryCurrency: offerForm.salaryCurrency,
            startDate: offerForm.startDate,
            probationDays: offerForm.probationDays === '' ? null : Number(offerForm.probationDays),
            noticePeriodDays:
              offerForm.noticePeriodDays === '' ? null : Number(offerForm.noticePeriodDays),
            notes: offerForm.notes || null,
          },
        },
      });
      setOfferFormFor(null);
      setOfferForm({
        baseSalary: '',
        salaryCurrency: 'USD',
        startDate: '',
        probationDays: '90',
        noticePeriodDays: '30',
        notes: '',
      });
      await refetchOffers();
    } catch (caught) {
      setOfferError(caught instanceof Error ? caught.message : 'Could not create the offer');
    }
  };

  const onOfferAction = async (
    action: 'send' | 'accept' | 'withdraw' | 'decline',
    offer: OfferRecord,
  ): Promise<void> => {
    setOfferError(null);
    try {
      if (action === 'send') {
        await sendOffer({ variables: { input: { offerId: offer.id } } });
      } else if (action === 'withdraw') {
        await withdrawOffer({ variables: { input: { offerId: offer.id } } });
      } else if (action === 'decline') {
        await declineOffer({ variables: { input: { offerId: offer.id } } });
      } else {
        await acceptOffer({ variables: { input: { offerId: offer.id } } });
        if (detail) {
          await loadDetail({ variables: { id: detail.id } });
        }
      }
      await refetchOffers();
    } catch (caught) {
      setOfferError(caught instanceof Error ? caught.message : 'Could not update the offer');
    }
  };

  return (
                  <div className="record-item" key={application.id}>
                    <div>
                      <div className="record-inline-actions">
                        <span className="employee-primary">{application.jobPostingTitle}</span>
                        <StatusChip
                          color={outcomeColors[draft.outcome]}
                          label={outcomeLabels[draft.outcome]}
                        />
                        {application.hasResume ? (
                          <span className="employee-secondary">
                            {['CV attached', cvParseLabel(application.cvParse)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        ) : null}
                      </div>
                      <div className="employee-secondary">
                        {[
                          application.currentTitle,
                          application.yearsExperience !== null
                            ? `${application.yearsExperience} yrs`
                            : null,
                          application.location,
                          application.expectedSalary !== null
                            ? `Expects ${application.salaryCurrency ?? ''} ${application.expectedSalary}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No profile details'}
                      </div>
                      {application.coverNote ? (
                        <div className="leave-trail-note">{application.coverNote}</div>
                      ) : null}
                      <div className="field-group">
                        <div className="field">
                          <label htmlFor={`stage-${application.id}`}>Stage</label>
                          <select
                            id={`stage-${application.id}`}
                            name={`stage-${application.id}`}
                            value={draft.stage}
                            onChange={(event) =>
                              setApplicationDrafts((current) => ({
                                ...current,
                                [application.id]: {
                                  ...draft,
                                  stage: event.target.value as ApplicationStage,
                                },
                              }))
                            }
                          >
                            {APPLICATION_STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {stageLabels[stage]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`outcome-${application.id}`}>Outcome</label>
                          <select
                            id={`outcome-${application.id}`}
                            name={`outcome-${application.id}`}
                            value={draft.outcome}
                            onChange={(event) =>
                              setApplicationDrafts((current) => ({
                                ...current,
                                [application.id]: {
                                  ...draft,
                                  outcome: event.target.value as ApplicationOutcome,
                                },
                              }))
                            }
                          >
                            {APPLICATION_OUTCOMES.map((outcome) => (
                              <option key={outcome} value={outcome}>
                                {outcomeLabels[outcome]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`rating-${application.id}`}>Manual rating</label>
                          <input
                            id={`rating-${application.id}`}
                            inputMode="numeric"
                            max={5}
                            min={1}
                            name={`rating-${application.id}`}
                            type="number"
                            value={draft.rating}
                            onChange={(event) =>
                              setApplicationDrafts((current) => ({
                                ...current,
                                [application.id]: { ...draft, rating: event.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                      <button
                        className="button button-secondary"
                        onClick={() => void saveApplication(application)}
                        type="button"
                      >
                        Save
                      </button>

                      {offers
                        .filter((offer) => offer.applicationId === application.id)
                        .map((offer) => (
                          <div className="record-inline-actions" key={offer.id}>
                            <StatusChip
                              color={
                                offer.status === 'accepted'
                                  ? 'green'
                                  : offer.status === 'sent'
                                    ? 'blue'
                                    : offer.status === 'declined'
                                      ? 'red'
                                      : 'gray'
                              }
                              label={`Offer ${offer.status}`}
                            />
                            <span className="employee-secondary">
                              {offer.salaryCurrency} {offer.baseSalary.toLocaleString()} · starts{' '}
                              {offer.startDate}
                            </span>
                            {offer.status === 'draft' ? (
                              <button
                                className="button button-secondary"
                                onClick={() => void onOfferAction('send', offer)}
                                type="button"
                              >
                                Send offer
                              </button>
                            ) : null}
                            {offer.status === 'sent' ? (
                              <>
                                <button
                                  className="button button-primary"
                                  disabled={acceptingOffer}
                                  onClick={() => void onOfferAction('accept', offer)}
                                  type="button"
                                >
                                  Record acceptance & hire
                                </button>
                                <button
                                  className="button button-secondary"
                                  onClick={() => void onOfferAction('withdraw', offer)}
                                  type="button"
                                >
                                  Withdraw
                                </button>
                                <button
                                  className="button button-secondary"
                                  onClick={() => void onOfferAction('decline', offer)}
                                  type="button"
                                >
                                  Record decline
                                </button>
                              </>
                            ) : null}
                            {offer.hiredEmployeeId ? (
                              <span className="employee-secondary">Employee created</span>
                            ) : null}
                          </div>
                        ))}

                      {offerFormFor === application.id ? (
                        <div className="field-group">
                          <div className="field">
                            <label htmlFor={`offer-salary-${application.id}`}>Base salary</label>
                            <input
                              id={`offer-salary-${application.id}`}
                              inputMode="decimal"
                              min={1}
                              name={`offer-salary-${application.id}`}
                              type="number"
                              value={offerForm.baseSalary}
                              onChange={(event) =>
                                setOfferForm((current) => ({
                                  ...current,
                                  baseSalary: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`offer-currency-${application.id}`}>Currency</label>
                            <input
                              id={`offer-currency-${application.id}`}
                              autoComplete="off"
                              maxLength={3}
                              name={`offer-currency-${application.id}`}
                              spellCheck={false}
                              value={offerForm.salaryCurrency}
                              onChange={(event) =>
                                setOfferForm((current) => ({
                                  ...current,
                                  salaryCurrency: event.target.value.toUpperCase(),
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`offer-start-${application.id}`}>Start date</label>
                            <input
                              id={`offer-start-${application.id}`}
                              name={`offer-start-${application.id}`}
                              type="date"
                              value={offerForm.startDate}
                              onChange={(event) =>
                                setOfferForm((current) => ({
                                  ...current,
                                  startDate: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`offer-probation-${application.id}`}>Probation days</label>
                            <input
                              id={`offer-probation-${application.id}`}
                              inputMode="numeric"
                              min={0}
                              name={`offer-probation-${application.id}`}
                              type="number"
                              value={offerForm.probationDays}
                              onChange={(event) =>
                                setOfferForm((current) => ({
                                  ...current,
                                  probationDays: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`offer-notice-${application.id}`}>Notice days</label>
                            <input
                              id={`offer-notice-${application.id}`}
                              inputMode="numeric"
                              min={0}
                              name={`offer-notice-${application.id}`}
                              type="number"
                              value={offerForm.noticePeriodDays}
                              onChange={(event) =>
                                setOfferForm((current) => ({
                                  ...current,
                                  noticePeriodDays: event.target.value,
                                }))
                              }
                            />
                          </div>
                          {offerError ? (
                            <p className="auth-error" role="alert">
                              {offerError}
                            </p>
                          ) : null}
                          <div className="record-inline-actions">
                            <button
                              className="button button-primary"
                              disabled={creatingOffer}
                              onClick={() => void submitOffer(application)}
                              type="button"
                            >
                              {creatingOffer ? 'Creating…' : 'Create offer'}
                            </button>
                            <button
                              className="button button-secondary"
                              onClick={() => {
                                setOfferFormFor(null);
                                setOfferError(null);
                              }}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="button button-secondary"
                          onClick={() => {
                            setOfferFormFor(application.id);
                            setOfferError(null);
                          }}
                          type="button"
                        >
                          New offer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {detail.applications.length === 0 ? (
                <p className="table-empty">No applications yet.</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </SidePanel>
    </section>
  );
};
