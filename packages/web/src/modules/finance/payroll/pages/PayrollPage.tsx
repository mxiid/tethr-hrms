import { useMutation, useQuery } from '@apollo/client';
import { IconCashBanknote, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useTheme } from '../../../../providers/theme/useTheme';
import {
  ACTIVATE_TAX_SLAB_GROUP_MUTATION,
  CREATE_PAYROLL_RUN_MUTATION,
  CREATE_TAX_SLAB_GROUP_MUTATION,
  PAYROLL_RUNS_QUERY,
  TAX_SLAB_GROUPS_QUERY,
} from '../graphql/payroll.operations';

type PayrollRunRecord = {
  readonly id: string;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly status: string;
  readonly currency: string;
  readonly standardWorkingDays: number;
  readonly finalizedAt: string | null;
};

type TaxSlabGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly financialYearLabel: string;
  readonly currency: string;
  readonly isActive: boolean;
};

type RunsData = { readonly payrollRuns: readonly PayrollRunRecord[] };
type TaxGroupsData = { readonly taxSlabGroups: readonly TaxSlabGroupRecord[] };

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const monthLabel = (month: number): string => MONTH_LABELS[month - 1] ?? String(month);
const periodKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = now.getMonth() + 1;

export const PayrollPage = () => {
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useQuery<RunsData>(PAYROLL_RUNS_QUERY);
  const { data: taxData, refetch: refetchTax } = useQuery<TaxGroupsData>(TAX_SLAB_GROUPS_QUERY);

  const [periodYear, setPeriodYear] = useState(defaultYear);
  const [periodMonth, setPeriodMonth] = useState(defaultMonth);
  const [formError, setFormError] = useState<string | null>(null);

  const [taxGroupName, setTaxGroupName] = useState('');
  const [taxGroupYear, setTaxGroupYear] = useState(`FY ${defaultYear}-${defaultYear + 1}`);

  const [createRun, { loading: creating }] = useMutation(CREATE_PAYROLL_RUN_MUTATION);
  const [createTaxGroup, { loading: creatingTaxGroup }] = useMutation(
    CREATE_TAX_SLAB_GROUP_MUTATION,
  );
  const [activateTaxGroup, { loading: activating }] = useMutation(
    ACTIVATE_TAX_SLAB_GROUP_MUTATION,
  );

  const runs = [...(data?.payrollRuns ?? [])].sort((a, b) =>
    periodKey(b.periodYear, b.periodMonth).localeCompare(periodKey(a.periodYear, a.periodMonth)),
  );
  const taxGroups = taxData?.taxSlabGroups ?? [];
  const activeTaxGroup = taxGroups.find((group) => group.isActive) ?? null;

  const onCreateRun = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    try {
      await createRun({
        variables: { input: { periodYear, periodMonth } },
        refetchQueries: [{ query: PAYROLL_RUNS_QUERY }],
      });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create the run.');
    }
  };

  const onCreateTaxGroup = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!taxGroupName.trim()) return;
    try {
      await createTaxGroup({
        variables: { input: { name: taxGroupName.trim(), financialYearLabel: taxGroupYear.trim() } },
        refetchQueries: [{ query: TAX_SLAB_GROUPS_QUERY }],
      });
      setTaxGroupName('');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create the slab group.');
    }
  };

  return (
    <main className="page-frame">
      <div className="employees-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Payroll</h1>
            <p className="page-subtitle">
              Monthly runs with working-day pro-rating, unpaid-leave reduction, and immutable
              payslip snapshots.
            </p>
          </div>
          <button
            className="icon-button"
            onClick={() => refetch()}
            title="Refresh"
            type="button"
          >
            <IconRefresh size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          </button>
        </header>

        {error ? (
          <p className="auth-error" role="alert">
            Could not load payroll runs.
          </p>
        ) : null}
        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}

        <section className="table-shell" aria-labelledby="runs-title">
          <div className="table-title-row">
            <div className="table-title" id="runs-title">
              Payroll runs
            </div>
            <div className="table-density">{loading ? 'Loading…' : `${runs.length} total`}</div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Working days</th>
                  <th>Status</th>
                  <th>Finalized</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5}>No payroll runs yet — create the first one.</td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <div className="employee-primary">
                          {`${monthLabel(run.periodMonth)} ${run.periodYear}`}
                        </div>
                        <div className="employee-secondary">
                          {periodKey(run.periodYear, run.periodMonth)}
                        </div>
                      </td>
                      <td>{run.standardWorkingDays}</td>
                      <td>
                        <span
                          className="chip"
                          style={
                            {
                              '--chip-color': `var(--hrms-color-tag-${
                                run.status === 'finalized' ? 'green' : 'amber'
                              })`,
                            } as CSSProperties
                          }
                        >
                          <span className="chip-dot" />
                          {run.status === 'finalized' ? 'Finalized' : 'Draft'}
                        </span>
                      </td>
                      <td>{run.finalizedAt ? new Date(run.finalizedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <Link className="table-link" to={`/payroll/${run.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="employee-detail-panel compensation-actions-panel" aria-label="Payroll actions">
        <div className="panel-title-row">
          <div>
            <div className="panel-kicker">Finance operations</div>
            <h2 className="panel-title">New run</h2>
          </div>
          <IconCashBanknote size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
        </div>

        <form
          className="config-form"
          onSubmit={(event) => {
            void onCreateRun(event);
          }}
        >
          <h3 className="section-title">Draft a monthly run</h3>
          <p className="field-hint">
            Computes payable days per employee from the working calendar minus approved unpaid
            leave; salaries pro-rate automatically for mid-month joiners.
          </p>
          <div className="field">
            <label htmlFor="run-year">Year</label>
            <input
              id="run-year"
              max={2100}
              min={2000}
              required
              type="number"
              value={periodYear}
              onChange={(event) => setPeriodYear(Number(event.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="run-month">Month</label>
            <select
              id="run-month"
              value={periodMonth}
              onChange={(event) => setPeriodMonth(Number(event.target.value))}
            >
              {MONTH_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button button-primary button-full"
            disabled={creating}
            type="submit"
          >
            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {creating ? 'Computing…' : 'Create draft run'}
          </button>
        </form>

        <form
          className="config-form"
          onSubmit={(event) => {
            void onCreateTaxGroup(event);
          }}
        >
          <h3 className="section-title">Withholding slabs</h3>
          <p className="field-hint">
            Active ladder:{' '}
            <strong>{activeTaxGroup ? activeTaxGroup.financialYearLabel : 'none — tax computes as zero'}</strong>
          </p>
          {taxGroups.map((group) => (
            <div className="inline-actions-row" key={group.id}>
              <span className="truncate">
                {group.name} · {group.financialYearLabel}
              </span>
              {group.isActive ? (
                <span className="chip" style={{ '--chip-color': 'var(--hrms-color-tag-green)' } as CSSProperties}>
                  <span className="chip-dot" />
                  Active
                </span>
              ) : (
                <button
                  className="button button-secondary"
                  disabled={activating}
                  type="button"
                  onClick={() => {
                    void activateTaxGroup({
                      variables: { groupId: group.id },
                      refetchQueries: [{ query: TAX_SLAB_GROUPS_QUERY }],
                    }).then(() => refetchTax());
                  }}
                >
                  Activate
                </button>
              )}
            </div>
          ))}
          <div className="field">
            <label htmlFor="tax-group-name">New group name</label>
            <input
              id="tax-group-name"
              placeholder="e.g. Finance Act 2026"
              value={taxGroupName}
              onChange={(event) => setTaxGroupName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-group-year">Financial year label</label>
            <input
              id="tax-group-year"
              value={taxGroupYear}
              onChange={(event) => setTaxGroupYear(event.target.value)}
            />
          </div>
          <button className="button button-secondary button-full" disabled={creatingTaxGroup} type="submit">
            Add slab group
          </button>
          <p className="field-hint">
            Configure the band rows from the group&apos;s detail once created; the last band stays
            open-ended.
          </p>
        </form>
      </aside>
    </main>
  );
};
