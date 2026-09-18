import { useMutation, useQuery } from '@apollo/client';
import {
  formatDate,
  todayDateKey,
  type CompensationChangeReason,
  type PayFrequency,
} from '@hrms/shared';
import { IconAlertTriangle, IconCurrencyDollar, IconRefresh, IconSettings } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../../../../components/empty-state/EmptyState';
import { Modal } from '../../../../components/modal/Modal';
import { SkeletonRows } from '../../../../components/skeleton/Skeleton';
import { useTheme } from '../../../../providers/theme/useTheme';
import { useAuth } from '../../../auth/hooks/useAuth';
import {
  COMPENSATION_SETUP_QUERY,
  REVISE_SALARY_MUTATION,
  SALARY_REVISIONS_QUERY,
} from '../graphql/compensation.operations';

type SalaryStructureRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly gradeId: string | null;
  readonly currency: string;
  readonly payFrequency: PayFrequency;
  readonly isActive: boolean;
};

type SalaryRevisionRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly salaryStructureId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly currency: string;
  readonly annualAmount: number;
  readonly reason: CompensationChangeReason;
  readonly approvedByUserId: string | null;
  readonly note: string | null;
};

type CompensationEmployeeRecord = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly workEmail: string | null;
};

type CompensationSetupData = {
  readonly salaryStructures: ReadonlyArray<SalaryStructureRecord>;
  readonly employees: ReadonlyArray<CompensationEmployeeRecord>;
};

type SalaryRevisionsData = {
  readonly salaryRevisions: ReadonlyArray<SalaryRevisionRecord>;
};

type ReviseSalaryData = { readonly reviseSalary: SalaryRevisionRecord };

const reasonLabels: Record<CompensationChangeReason, string> = {
  hire: 'Hire',
  merit: 'Merit',
  promotion: 'Promotion',
  marketAdjustment: 'Market adjustment',
  correction: 'Correction',
};

const emptyRevisionForm = {
  employeeId: '',
  salaryStructureId: '',
  effectiveDate: todayDateKey(),
  annualAmount: '',
  reason: 'merit' as CompensationChangeReason,
  note: '',
};

const fullName = (employee: CompensationEmployeeRecord): string =>
  `${employee.firstName} ${employee.lastName}`;

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);

export const CompensationPage = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  // Both the revise mutation and the pay-setup page require compensation:write;
  // tethrFinance holds compensation:read only and sees this page read-only.
  const canWriteCompensation = Boolean(
    user?.roleKeys.includes('tethrAdmin') ||
      user?.roleKeys.includes('tethrHr') ||
      user?.roleKeys.includes('clientAdmin'),
  );
  const { data, loading, error, refetch } =
    useQuery<CompensationSetupData>(COMPENSATION_SETUP_QUERY);
  const [reviseSalary, { loading: revisingSalary }] =
    useMutation<ReviseSalaryData>(REVISE_SALARY_MUTATION);

  const salaryStructures = useMemo(() => data?.salaryStructures ?? [], [data]);
  const employees = useMemo(() => data?.employees ?? [], [data]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const effectiveEmployeeId = selectedEmployeeId ?? employees[0]?.id ?? null;
  const selectedEmployee =
    employees.find((employee) => employee.id === effectiveEmployeeId) ?? employees[0] ?? null;

  const {
    data: revisionsData,
    loading: loadingRevisions,
    error: revisionsError,
    refetch: refetchRevisions,
  } = useQuery<SalaryRevisionsData>(SALARY_REVISIONS_QUERY, {
    skip: !effectiveEmployeeId,
    variables: { employeeId: effectiveEmployeeId ?? '' },
  });

  const salaryRevisions = useMemo(() => revisionsData?.salaryRevisions ?? [], [revisionsData]);
  const currentSalary = salaryRevisions.find((revision) => revision.validTo === null) ?? null;

  const [revisionForm, setRevisionForm] = useState(emptyRevisionForm);
  const [openModal, setOpenModal] = useState<'revision' | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const clearFeedback = (): void => {
    setFormError(null);
    setFormMessage(null);
  };

  const openRevisionModal = (): void => {
    clearFeedback();
    setRevisionForm({
      ...emptyRevisionForm,
      employeeId: effectiveEmployeeId ?? '',
      salaryStructureId: salaryStructures[0]?.id ?? '',
    });
    setOpenModal('revision');
  };

  const closeModal = (): void => {
    clearFeedback();
    setOpenModal(null);
  };

  const onReviseSalary = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    const employeeId = revisionForm.employeeId || effectiveEmployeeId;
    if (!employeeId) {
      setFormError('Select an employee before revising salary.');
      return;
    }
    if (!revisionForm.salaryStructureId) {
      setFormError('Create or select a salary structure before revising salary.');
      return;
    }
    try {
      await reviseSalary({
        variables: {
          input: {
            employeeId,
            salaryStructureId: revisionForm.salaryStructureId,
            effectiveDate: revisionForm.effectiveDate,
            annualAmount: Number(revisionForm.annualAmount),
            reason: revisionForm.reason,
            note: revisionForm.note ? revisionForm.note : undefined,
          },
        },
      });
      await refetchRevisions();
      setSelectedEmployeeId(employeeId);
      setRevisionForm((current) => ({
        ...current,
        annualAmount: '',
        effectiveDate: todayDateKey(),
        note: '',
      }));
      setOpenModal(null);
      setFormMessage('Salary revision saved.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not revise salary');
    }
  };

  const onSelectEmployee = (employeeId: string): void => {
    setSelectedEmployeeId(employeeId);
    setRevisionForm((current) => ({ ...current, employeeId }));
  };

  return (
    <section className="page-frame page-frame-single">
      <section className="employees-content" aria-labelledby="compensation-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="compensation-title">
              Compensation
            </h1>
            <p className="page-subtitle">Salary history and raises. Setup lives in settings.</p>
          </div>
          <div className="page-actions">
            {canWriteCompensation ? (
              <Link className="button button-secondary" to="/settings/pay">
                <IconSettings aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Manage pay setup
              </Link>
            ) : null}
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void refetch()}
            >
              <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Refresh
            </button>
          </div>
        </header>

        <section className="metric-strip metric-strip-2" aria-label="Compensation summary">
          <div className="metric-card">
            <div className="metric-label">Employees</div>
            <div className="metric-value">{loading ? '—' : employees.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Current salary</div>
            <div className="metric-value">
              {currentSalary
                ? formatMoney(currentSalary.annualAmount, currentSalary.currency)
                : '—'}
            </div>
          </div>
        </section>

        {error ? (
          <p className="auth-error" role="alert">
            Could not load compensation setup. Confirm the API is running and your session is valid.
          </p>
        ) : null}
        {formMessage ? (
          <p className="form-success" role="status">
            {formMessage}
          </p>
        ) : null}


        <section className="table-shell" aria-labelledby="salary-history-title">
          <div className="table-title-row">
            <div className="table-title" id="salary-history-title">
              Salary history
            </div>
            <div className="panel-actions">
              <div className="table-density">
                {selectedEmployee ? fullName(selectedEmployee) : 'No employee selected'}
              </div>
              {canWriteCompensation ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={openRevisionModal}
                >
                  <IconCurrencyDollar aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  Revise salary
                </button>
              ) : null}
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table salary-history-table">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '36%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th>Effective to</th>
                  <th className="cell-numeric">Annual amount</th>
                  <th>Reason</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {revisionsError ? (
                  <tr>
                    <td className="table-empty" colSpan={5}>
                      <EmptyState
                        icon={IconAlertTriangle}
                        title="Could not load salary revisions"
                        description="Is the API running, and are you still signed in?"
                      />
                    </td>
                  </tr>
                ) : loadingRevisions ? (
                  <SkeletonRows columnCount={5} rows={3} />
                ) : salaryRevisions.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={5}>
                      <EmptyState
                        icon={IconCurrencyDollar}
                        title="No salary revisions for this employee"
                        description="Use Revise salary to set the first one."
                      />
                    </td>
                  </tr>
                ) : (
                  salaryRevisions.map((revision) => (
                    <tr key={revision.id}>
                      <td data-label="Effective from">{formatDate(revision.validFrom)}</td>
                      <td data-label="Effective to">{revision.validTo ? formatDate(revision.validTo) : 'Current'}</td>
                      <td className="cell-numeric" data-label="Annual amount">{formatMoney(revision.annualAmount, revision.currency)}</td>
                      <td data-label="Reason">{reasonLabels[revision.reason]}</td>
                      <td className="truncate" data-label="Note">{revision.note ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <Modal
        isOpen={openModal === 'revision'}
        onClose={closeModal}
        title="Revise salary"
        width="lg"
      >
        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}
        <form className="config-form" onSubmit={onReviseSalary}>
          <div className="field">
            <label htmlFor="revision-employee">Employee</label>
            <select
              id="revision-employee"
              name="revision-employee"
              required
              value={revisionForm.employeeId || (effectiveEmployeeId ?? '')}
              onChange={(event) => onSelectEmployee(event.target.value)}
            >
              {employees.length === 0 ? <option value="">No employees</option> : null}
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {fullName(employee)} · {employee.employeeNumber}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="revision-structure">Salary structure</label>
            <select
              id="revision-structure"
              name="revision-structure"
              required
              value={revisionForm.salaryStructureId}
              onChange={(event) =>
                setRevisionForm((current) => ({
                  ...current,
                  salaryStructureId: event.target.value,
                }))
              }
            >
              <option value="">Select structure</option>
              {salaryStructures.map((structure) => (
                <option key={structure.id} value={structure.id}>
                  {structure.name} · {structure.currency}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <div className="field">
              <label htmlFor="revision-effective">Effective date</label>
              <input
                id="revision-effective"
                name="revision-effective"
                required
                type="date"
                value={revisionForm.effectiveDate}
                onChange={(event) =>
                  setRevisionForm((current) => ({
                    ...current,
                    effectiveDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="revision-amount">Annual amount</label>
              <input
                id="revision-amount"
                inputMode="decimal"
                min="0.01"
                name="revision-amount"
                required
                step="0.01"
                type="number"
                value={revisionForm.annualAmount}
                onChange={(event) =>
                  setRevisionForm((current) => ({ ...current, annualAmount: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="revision-reason">Reason</label>
            <select
              id="revision-reason"
              name="revision-reason"
              value={revisionForm.reason}
              onChange={(event) =>
                setRevisionForm((current) => ({
                  ...current,
                  reason: event.target.value as CompensationChangeReason,
                }))
              }
            >
              {Object.entries(reasonLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="revision-note">Note</label>
            <textarea
              id="revision-note"
              maxLength={300}
              name="revision-note"
              rows={3}
              value={revisionForm.note}
              onChange={(event) =>
                setRevisionForm((current) => ({ ...current, note: event.target.value }))
              }
            />
          </div>
          <button
            className="button button-primary button-full"
            disabled={revisingSalary}
            type="submit"
          >
            <IconCurrencyDollar aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {revisingSalary ? 'Saving…' : 'Save revision'}
          </button>
        </form>
      </Modal>
    </section>
  );
};
