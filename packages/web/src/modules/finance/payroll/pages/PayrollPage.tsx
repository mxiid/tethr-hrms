import { useMutation, useQuery } from '@apollo/client';
import { formatDate } from '@hrms/shared';
import { IconAdjustments, IconAlertTriangle, IconCalendarStats, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { StatusChip } from '../../../../components/chip/StatusChip';
import { EmptyState } from '../../../../components/empty-state/EmptyState';
import { Modal } from '../../../../components/modal/Modal';
import { DataTable, toViewColumns, type ColumnDefinition } from '../../../../components/table/DataTable';
import { Tooltip } from '../../../../components/tooltip/Tooltip';
import { useListView } from '../../../../components/view-bar/useListView';
import { ViewBar } from '../../../../components/view-bar/ViewBar';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  PayrollReadinessBanner,
  type PayrollReadinessRecord,
} from '../components/PayrollReadinessBanner';
import {
  CREATE_PAYROLL_RUN_MUTATION,
  PAYROLL_READINESS_QUERY,
  PAYROLL_RUNS_QUERY,
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

type RunsData = { readonly payrollRuns: readonly PayrollRunRecord[] };

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const monthLabel = (month: number): string => MONTH_LABELS[month - 1] ?? String(month);
const periodKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = now.getMonth() + 1;

const RUN_COLUMNS: readonly ColumnDefinition<PayrollRunRecord>[] = [
  {
    key: 'period',
    header: 'Period',
    width: '30%',
    hideable: false,
    sortValue: (run) => periodKey(run.periodYear, run.periodMonth),
    render: (run) => (
      <>
        <div className="employee-primary">{`${monthLabel(run.periodMonth)} ${run.periodYear}`}</div>
        <div className="employee-secondary">{periodKey(run.periodYear, run.periodMonth)}</div>
      </>
    ),
  },
  {
    key: 'workingDays',
    header: 'Working days',
    width: '17%',
    align: 'right',
    sortValue: (run) => run.standardWorkingDays,
    render: (run) => run.standardWorkingDays,
  },
  {
    key: 'status',
    header: 'Status',
    width: '16%',
    sortValue: (run) => run.status,
    render: (run) => (
      <StatusChip
        color={run.status === 'finalized' ? 'green' : 'amber'}
        label={run.status === 'finalized' ? 'Finalized' : 'Draft'}
      />
    ),
  },
  {
    key: 'finalized',
    header: 'Finalized',
    width: '19%',
    sortValue: (run) => run.finalizedAt ?? '',
    render: (run) => (run.finalizedAt ? formatDate(run.finalizedAt) : '—'),
  },
  {
    key: 'open',
    header: '',
    label: 'Open',
    width: '18%',
    hideable: false,
    render: (run) => (
      <Link className="table-link" to={`/payroll/${run.id}`}>
        Open
      </Link>
    ),
  },
];

const RUN_FILTERS = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'finalized', label: 'Finalized' },
    ],
  },
] as const;

export const PayrollPage = () => {
  const { theme } = useTheme();
  const view = useListView({
    routeKey: '/payroll',
    defaultSorts: [{ key: 'period', direction: 'desc' }],
  });
  const { data, loading, error, refetch } = useQuery<RunsData>(PAYROLL_RUNS_QUERY);

  const [periodYear, setPeriodYear] = useState(defaultYear);
  const [periodMonth, setPeriodMonth] = useState(defaultMonth);
  const [openModal, setOpenModal] = useState<'run' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: readinessData } = useQuery<{ readonly payrollReadiness: PayrollReadinessRecord }>(
    PAYROLL_READINESS_QUERY,
    { variables: { periodYear, periodMonth } },
  );

  const [createRun, { loading: creating }] = useMutation(CREATE_PAYROLL_RUN_MUTATION);

  const runs = useMemo(() => data?.payrollRuns ?? [], [data?.payrollRuns]);
  const visibleRuns = useMemo(() => {
    const statuses = view.filters.status ?? [];
    return statuses.length === 0 ? runs : runs.filter((run) => statuses.includes(run.status));
  }, [runs, view.filters.status]);

  const openNewRun = (): void => {
    setFormError(null);
    setPeriodYear(defaultYear);
    setPeriodMonth(defaultMonth);
    setOpenModal('run');
  };

  const onCreateRun = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    try {
      await createRun({
        variables: { input: { periodYear, periodMonth } },
        refetchQueries: [{ query: PAYROLL_RUNS_QUERY }],
      });
      setOpenModal(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create the run.');
    }
  };

  const emptyState = error ? (
    <EmptyState
      icon={IconAlertTriangle}
      title="Could not load payroll runs"
      description="Is the API running, and are you still signed in?"
      action={
        <button className="button button-secondary" onClick={() => void refetch()} type="button">
          <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          Try again
        </button>
      }
    />
  ) : runs.length === 0 ? (
    <EmptyState
      icon={IconCalendarStats}
      title="No payroll runs yet"
      description="Create the first run to compute pay for the period."
      action={
        <button className="button button-secondary" onClick={openNewRun} type="button">
          <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          New run
        </button>
      }
    />
  ) : (
    <EmptyState
      icon={IconAlertTriangle}
      title="No runs match this filter"
      description="Clear the filter to see every run."
      action={
        <button className="button button-secondary" onClick={view.clearFilters} type="button">
          Clear filters
        </button>
      }
    />
  );

  return (
    <section className="page-frame page-frame-single">
      <div className="employees-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Payroll</h1>
            <p className="page-subtitle">Run monthly payroll and issue payslips.</p>
          </div>
          <div className="page-actions">
            <Link className="button button-secondary" to="/settings/payroll">
              <IconAdjustments aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Manage tax slabs
            </Link>
            <button className="button button-primary" type="button" onClick={openNewRun}>
              <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              New run
            </button>
            <Tooltip label="Refresh">
              <button
                aria-label="Refresh"
                className="icon-button"
                onClick={() => refetch()}
                type="button"
              >
                <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </button>
            </Tooltip>
          </div>
        </header>

        {readinessData?.payrollReadiness ? (
          <PayrollReadinessBanner readiness={readinessData.payrollReadiness} />
        ) : null}

        <section className="table-shell" aria-label="Payroll runs">
          <ViewBar
            columns={toViewColumns(RUN_COLUMNS)}
            count={visibleRuns.length}
            filters={RUN_FILTERS}
            view={view}
            viewLabel="All runs"
          />
          <DataTable
            columns={RUN_COLUMNS}
            emptyState={emptyState}
            loading={loading}
            rows={visibleRuns}
            getRowKey={(run) => run.id}
            hiddenColumns={view.hiddenColumns}
            onHideColumn={view.hideColumn}
            onSort={view.setSort}
            skeletonRows={4}
            sorts={view.sorts}
          />
        </section>
      </div>

      <Modal
        isOpen={openModal === 'run'}
        onClose={() => setOpenModal(null)}
        title="New payroll run"
        width="sm"
      >
        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}
        <form
          className="config-form"
          onSubmit={(event) => {
            void onCreateRun(event);
          }}
        >
          <p className="field-hint">
            Pay is calculated from each person’s working days and approved unpaid leave, so
            mid-month joiners are handled automatically.
          </p>
          <div className="field">
            <label htmlFor="run-year">Year</label>
            <input
              id="run-year"
              inputMode="numeric"
              max={2100}
              min={2000}
              name="run-year"
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
              name="run-month"
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
            <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {creating ? 'Computing…' : 'Create draft run'}
          </button>
        </form>
      </Modal>

    </section>
  );
};
