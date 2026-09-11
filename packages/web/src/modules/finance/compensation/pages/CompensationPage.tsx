import { useMutation, useQuery } from '@apollo/client';
import type { CompensationChangeReason, PayComponentCategory, PayFrequency } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import { IconCashBanknote, IconCurrencyDollar, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';

import { useTheme } from '../../../../providers/theme/useTheme';
import {
  COMPENSATION_SETUP_QUERY,
  CREATE_PAY_COMPONENT_MUTATION,
  CREATE_SALARY_STRUCTURE_MUTATION,
  REVISE_SALARY_MUTATION,
  SALARY_REVISIONS_QUERY,
} from '../graphql/compensation.operations';

type PayComponentRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly category: PayComponentCategory;
  readonly taxable: boolean;
  readonly recurring: boolean;
};

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
  readonly payComponents: ReadonlyArray<PayComponentRecord>;
  readonly salaryStructures: ReadonlyArray<SalaryStructureRecord>;
  readonly employees: ReadonlyArray<CompensationEmployeeRecord>;
};

type SalaryRevisionsData = {
  readonly salaryRevisions: ReadonlyArray<SalaryRevisionRecord>;
};

type CreatePayComponentData = { readonly createPayComponent: PayComponentRecord };
type CreateSalaryStructureData = { readonly createSalaryStructure: SalaryStructureRecord };
type ReviseSalaryData = { readonly reviseSalary: SalaryRevisionRecord };

type ChipStyle = CSSProperties & { readonly '--chip-color': string };

const categoryLabels: Record<PayComponentCategory, string> = {
  earning: 'Earning',
  deduction: 'Deduction',
  employerContribution: 'Employer contribution',
};

const categoryColors: Record<PayComponentCategory, MainColorName> = {
  earning: 'green',
  deduction: 'tomato',
  employerContribution: 'blue',
};

const payFrequencyLabels: Record<PayFrequency, string> = {
  monthly: 'Monthly',
  semiMonthly: 'Semi-monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
};

const reasonLabels: Record<CompensationChangeReason, string> = {
  hire: 'Hire',
  merit: 'Merit',
  promotion: 'Promotion',
  marketAdjustment: 'Market adjustment',
  correction: 'Correction',
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const emptyPayComponentForm = {
  name: '',
  code: '',
  category: 'earning' as PayComponentCategory,
  taxable: true,
  recurring: true,
};

const emptySalaryStructureForm = {
  name: '',
  code: '',
  currency: 'USD',
  payFrequency: 'monthly' as PayFrequency,
};

const emptyRevisionForm = {
  employeeId: '',
  salaryStructureId: '',
  effectiveDate: todayIso(),
  annualAmount: '',
  reason: 'merit' as CompensationChangeReason,
  note: '',
};

const fullName = (employee: CompensationEmployeeRecord): string =>
  `${employee.firstName} ${employee.lastName}`;

const chipStyle = (color: MainColorName): ChipStyle => ({
  '--chip-color': `var(--hrms-color-tag-${color})`,
});

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );

const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');

export const CompensationPage = () => {
  const { theme } = useTheme();
  const { data, loading, error, refetch } =
    useQuery<CompensationSetupData>(COMPENSATION_SETUP_QUERY);
  const [createPayComponent, { loading: creatingComponent }] = useMutation<CreatePayComponentData>(
    CREATE_PAY_COMPONENT_MUTATION,
  );
  const [createSalaryStructure, { loading: creatingStructure }] =
    useMutation<CreateSalaryStructureData>(CREATE_SALARY_STRUCTURE_MUTATION);
  const [reviseSalary, { loading: revisingSalary }] =
    useMutation<ReviseSalaryData>(REVISE_SALARY_MUTATION);

  const payComponents = useMemo(() => data?.payComponents ?? [], [data]);
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

  const [payComponentForm, setPayComponentForm] = useState(emptyPayComponentForm);
  const [salaryStructureForm, setSalaryStructureForm] = useState(emptySalaryStructureForm);
  const [revisionForm, setRevisionForm] = useState(emptyRevisionForm);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const clearFeedback = (): void => {
    setFormError(null);
    setFormMessage(null);
  };

  const onCreatePayComponent = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    try {
      await createPayComponent({
        variables: {
          input: {
            name: payComponentForm.name.trim(),
            code: normalizeCode(payComponentForm.code),
            category: payComponentForm.category,
            taxable: payComponentForm.taxable,
            recurring: payComponentForm.recurring,
          },
        },
      });
      await refetch();
      setPayComponentForm(emptyPayComponentForm);
      setFormMessage('Pay component created.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create pay component');
    }
  };

  const onCreateSalaryStructure = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    try {
      const result = await createSalaryStructure({
        variables: {
          input: {
            name: salaryStructureForm.name.trim(),
            code: normalizeCode(salaryStructureForm.code),
            currency: salaryStructureForm.currency.trim().toUpperCase(),
            payFrequency: salaryStructureForm.payFrequency,
          },
        },
      });
      await refetch();
      setSalaryStructureForm(emptySalaryStructureForm);
      setRevisionForm((current) => ({
        ...current,
        salaryStructureId: result.data?.createSalaryStructure.id ?? current.salaryStructureId,
      }));
      setFormMessage('Salary structure created.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create salary structure');
    }
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
        effectiveDate: todayIso(),
        note: '',
      }));
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
    <main className="page-frame">
      <section className="employees-content" aria-labelledby="compensation-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="compensation-title">
              Compensation
            </h1>
            <p className="page-subtitle">Pay setup and effective-dated salary revisions.</p>
          </div>
          <div className="page-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void refetch()}
            >
              <IconRefresh size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Refresh
            </button>
          </div>
        </header>

        <section className="metric-strip" aria-label="Compensation summary">
          <div className="metric-card">
            <div className="metric-label">Pay components</div>
            <div className="metric-value">{loading ? '—' : payComponents.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Salary structures</div>
            <div className="metric-value">{loading ? '—' : salaryStructures.length}</div>
          </div>
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

        <div className="compensation-grid">
          <section className="table-shell" aria-labelledby="pay-components-title">
            <div className="table-title-row">
              <div className="table-title" id="pay-components-title">
                Pay components
              </div>
              <div className="table-density">
                {loading
                  ? 'Loading…'
                  : `${payComponents.length} component${payComponents.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Category</th>
                    <th>Taxable</th>
                    <th>Recurring</th>
                  </tr>
                </thead>
                <tbody>
                  {payComponents.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No pay components yet.</td>
                    </tr>
                  ) : (
                    payComponents.map((component) => (
                      <tr key={component.id}>
                        <td>
                          <div className="employee-primary">{component.name}</div>
                          <div className="employee-secondary">{component.code}</div>
                        </td>
                        <td>
                          <span
                            className="chip"
                            style={chipStyle(categoryColors[component.category])}
                          >
                            <span className="chip-dot" />
                            {categoryLabels[component.category]}
                          </span>
                        </td>
                        <td>{component.taxable ? 'Yes' : 'No'}</td>
                        <td>{component.recurring ? 'Yes' : 'No'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="table-shell" aria-labelledby="salary-structures-title">
            <div className="table-title-row">
              <div className="table-title" id="salary-structures-title">
                Salary structures
              </div>
              <div className="table-density">
                {loading
                  ? 'Loading…'
                  : `${salaryStructures.length} structure${salaryStructures.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Structure</th>
                    <th>Currency</th>
                    <th>Frequency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryStructures.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No salary structures yet.</td>
                    </tr>
                  ) : (
                    salaryStructures.map((structure) => (
                      <tr key={structure.id}>
                        <td>
                          <div className="employee-primary">{structure.name}</div>
                          <div className="employee-secondary">{structure.code}</div>
                        </td>
                        <td>{structure.currency}</td>
                        <td>{payFrequencyLabels[structure.payFrequency]}</td>
                        <td>
                          <span
                            className="chip"
                            style={chipStyle(structure.isActive ? 'green' : 'gray')}
                          >
                            <span className="chip-dot" />
                            {structure.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="table-shell" aria-labelledby="salary-history-title">
          <div className="table-title-row">
            <div className="table-title" id="salary-history-title">
              Salary history
            </div>
            <div className="table-density">
              {selectedEmployee ? fullName(selectedEmployee) : 'No employee selected'}
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table salary-history-table">
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th>Effective to</th>
                  <th>Annual amount</th>
                  <th>Reason</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {revisionsError ? (
                  <tr>
                    <td colSpan={5}>Could not load salary revisions.</td>
                  </tr>
                ) : loadingRevisions ? (
                  <tr>
                    <td colSpan={5}>Loading salary revisions…</td>
                  </tr>
                ) : salaryRevisions.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No salary revisions for this employee.</td>
                  </tr>
                ) : (
                  salaryRevisions.map((revision) => (
                    <tr key={revision.id}>
                      <td>{formatDate(revision.validFrom)}</td>
                      <td>{revision.validTo ? formatDate(revision.validTo) : 'Current'}</td>
                      <td>{formatMoney(revision.annualAmount, revision.currency)}</td>
                      <td>{reasonLabels[revision.reason]}</td>
                      <td className="truncate">{revision.note ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside
        className="employee-detail-panel compensation-actions-panel"
        aria-label="Compensation actions"
      >
        <div className="panel-title-row">
          <div>
            <div className="panel-kicker">Configuration</div>
            <h2 className="panel-title">Pay setup</h2>
          </div>
          <IconCashBanknote size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
        </div>

        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}
        {formMessage ? <p className="form-success">{formMessage}</p> : null}

        <form className="config-form" onSubmit={onCreatePayComponent}>
          <h3 className="section-title">New pay component</h3>
          <div className="field">
            <label htmlFor="component-name">Name</label>
            <input
              id="component-name"
              required
              value={payComponentForm.name}
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="component-code">Code</label>
            <input
              id="component-code"
              required
              value={payComponentForm.code}
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="component-category">Category</label>
            <select
              id="component-category"
              value={payComponentForm.category}
              onChange={(event) =>
                setPayComponentForm((current) => ({
                  ...current,
                  category: event.target.value as PayComponentCategory,
                }))
              }
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="checkbox-field">
            <input
              checked={payComponentForm.taxable}
              type="checkbox"
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, taxable: event.target.checked }))
              }
            />
            Taxable
          </label>
          <label className="checkbox-field">
            <input
              checked={payComponentForm.recurring}
              type="checkbox"
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, recurring: event.target.checked }))
              }
            />
            Recurring
          </label>
          <button
            className="button button-primary button-full"
            disabled={creatingComponent}
            type="submit"
          >
            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {creatingComponent ? 'Saving…' : 'Add component'}
          </button>
        </form>

        <form className="config-form" onSubmit={onCreateSalaryStructure}>
          <h3 className="section-title">New salary structure</h3>
          <div className="field">
            <label htmlFor="structure-name">Name</label>
            <input
              id="structure-name"
              required
              value={salaryStructureForm.name}
              onChange={(event) =>
                setSalaryStructureForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="structure-code">Code</label>
            <input
              id="structure-code"
              required
              value={salaryStructureForm.code}
              onChange={(event) =>
                setSalaryStructureForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
          <div className="field-group">
            <div className="field">
              <label htmlFor="structure-currency">Currency</label>
              <input
                id="structure-currency"
                maxLength={3}
                required
                value={salaryStructureForm.currency}
                onChange={(event) =>
                  setSalaryStructureForm((current) => ({
                    ...current,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="structure-frequency">Frequency</label>
              <select
                id="structure-frequency"
                value={salaryStructureForm.payFrequency}
                onChange={(event) =>
                  setSalaryStructureForm((current) => ({
                    ...current,
                    payFrequency: event.target.value as PayFrequency,
                  }))
                }
              >
                {Object.entries(payFrequencyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="button button-primary button-full"
            disabled={creatingStructure}
            type="submit"
          >
            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {creatingStructure ? 'Saving…' : 'Add structure'}
          </button>
        </form>

        <form className="config-form" onSubmit={onReviseSalary}>
          <h3 className="section-title">Revise salary</h3>
          <div className="field">
            <label htmlFor="revision-employee">Employee</label>
            <select
              id="revision-employee"
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
                min="0.01"
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
            <IconCurrencyDollar size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {revisingSalary ? 'Saving…' : 'Save revision'}
          </button>
        </form>
      </aside>
    </main>
  );
};
