import { useLazyQuery, useQuery } from '@apollo/client';
import type { EmploymentStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconArrowUpRight,
  IconBriefcase,
  IconChecklist,
  IconChevronDown,
  IconCircleCheck,
  IconCurrencyDollar,
  IconFileInvoice,
  IconLock,
  IconUserPlus,
  IconUsersGroup,
  type TablerIcon,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { downloadBase64File } from '../../../app/download';
import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { SkeletonRows } from '../../../components/skeleton/Skeleton';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  CLIENT_COST_BREAKDOWN_QUERY,
  CLIENT_INVOICES_QUERY,
  CLIENT_INVOICE_ADDENDUM_PDF_QUERY,
  CLIENT_INVOICE_PDF_QUERY,
} from '../../finance/billing/graphql/billing.operations';
import { DashboardWidgetBoard } from '../../dashboard/components/DashboardWidgetBoard';
import { CLIENT_WORKSPACE_QUERY } from '../graphql/client-workspace.operations';

type EmployeeRecord = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly workEmail: string | null;
  readonly hireDate: string;
  readonly employmentStatus: EmploymentStatus;
  readonly workerType: string;
};

type HiringRequestRecord = {
  readonly id: string;
  readonly status: string;
  readonly updatedAt: string;
};
type SalaryStructureRecord = { readonly id: string };
type ClientWorkspaceData = {
  readonly employees: readonly EmployeeRecord[];
  readonly hiringRequests: readonly HiringRequestRecord[];
  readonly salaryStructures: readonly SalaryStructureRecord[];
};
type OnboardingStep = {
  readonly title: string;
  readonly detail: string;
  readonly to: string;
  readonly icon: TablerIcon;
  readonly complete: boolean;
  readonly disabled?: boolean;
};

const statusColors: Record<EmploymentStatus, MainColorName> = {
  active: 'green',
  onLeave: 'amber',
  suspended: 'tomato',
  terminated: 'gray',
};

const statusLabels: Record<EmploymentStatus, string> = {
  active: 'Active',
  onLeave: 'On leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );

export const ClientWorkspacePage = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const { data, loading, error } = useQuery<ClientWorkspaceData>(CLIENT_WORKSPACE_QUERY);
  const employees = data?.employees ?? [];
  const hiringRequests = data?.hiringRequests ?? [];
  const salaryStructures = data?.salaryStructures ?? [];
  const compensationReady = salaryStructures.length > 0;
  const isClientAdmin = user?.roleKeys.includes('clientAdmin') === true;
  const onboardingSteps: readonly OnboardingStep[] = [
    {
      title: 'Review employee records',
      detail: employees.length > 0 ? `${employees.length} employees available` : 'Waiting on setup',
      to: '/employees',
      icon: IconUsersGroup,
      complete: employees.length > 0,
    },
    {
      title: 'Post hiring request',
      detail:
        hiringRequests.length > 0
          ? `${hiringRequests.length} request${hiringRequests.length === 1 ? '' : 's'} tracked`
          : 'Submit new roles for Tethr intake',
      to: '/hiring',
      icon: IconBriefcase,
      complete: hiringRequests.length > 0,
    },
    {
      title: 'Manage teammates',
      detail: isClientAdmin ? 'Invite and manage workspace users' : 'Client admin only',
      to: '/settings/members',
      icon: IconUserPlus,
      complete: isClientAdmin,
      disabled: !isClientAdmin,
    },
    {
      title: 'Review compensation',
      detail: isClientAdmin
        ? compensationReady
          ? `${salaryStructures.length} salary structure${salaryStructures.length === 1 ? '' : 's'} available`
          : 'Salary history and adjustments'
        : 'Client admin only',
      to: '/compensation',
      icon: IconCurrencyDollar,
      complete: isClientAdmin && compensationReady,
      disabled: !isClientAdmin,
    },
  ];

  const quickActions: readonly QuickAction[] = [
    {
      title: 'Employee directory',
      description: 'Records, statuses and core details',
      to: '/employees',
      icon: IconUsersGroup,
      primary: true,
    },
    {
      title: 'Hiring requests',
      description: 'Submit roles, track Tethr intake',
      to: '/hiring',
      icon: IconBriefcase,
    },
    ...(isClientAdmin
      ? [
          {
            title: 'Workspace members',
            description: 'Invite teammates, link accounts',
            to: '/settings/members',
            icon: IconUserPlus,
          },
          {
            title: 'Compensation',
            description: 'Salary history and adjustments',
            to: '/compensation',
            icon: IconCurrencyDollar,
          },
        ]
      : []),
  ];

  return (
    <section className="client-workspace">
      <section className="client-workspace-content" aria-labelledby="client-workspace-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="client-workspace-title">
              People overview
            </h1>
            <p className="page-subtitle">Your team, and what needs your attention.</p>
          </div>
        </header>

        <DashboardWidgetBoard showViewTabs={false} />

        <section className="table-shell client-onboarding" aria-labelledby="client-onboarding">
          <button
            aria-expanded={onboardingOpen}
            className="table-title-row collapse-toggle"
            type="button"
            onClick={() => setOnboardingOpen((open) => !open)}
          >
            <span className="table-title" id="client-onboarding">
              <IconChevronDown aria-hidden="true"
                className={`collapse-chevron${onboardingOpen ? ' is-open' : ''}`}
                size={theme.icon.size.sm}
                stroke={theme.icon.stroke.sm}
              />
              <IconChecklist aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Client onboarding
            </span>
            <span className="table-density">
              {onboardingSteps.filter((step) => step.complete).length}/{onboardingSteps.length} ready
            </span>
          </button>
          {onboardingOpen ? (
          <div className="onboarding-step-list">
            {onboardingSteps.map((step) => {
              const StepIcon = step.icon;
              const StatusIcon = step.disabled
                ? IconLock
                : step.complete
                  ? IconCircleCheck
                  : IconArrowUpRight;
              const content = (
                <>
                  <span className="onboarding-step-icon">
                    <StepIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  </span>
                  <span className="onboarding-step-copy">
                    <span className="employee-primary">{step.title}</span>
                    <span className="employee-secondary">{step.detail}</span>
                  </span>
                  <span className="onboarding-step-status">
                    <StatusIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  </span>
                </>
              );

              return step.disabled ? (
                <div className="onboarding-step is-disabled" key={step.title}>
                  {content}
                </div>
              ) : (
                <Link className="onboarding-step" key={step.title} to={step.to}>
                  {content}
                </Link>
              );
            })}
          </div>
          ) : null}
        </section>

        <section className="table-shell">
          <div className="table-title-row">
            <div className="table-title">
              <IconUsersGroup aria-hidden="true" size={theme.icon.size.md} /> Employees
            </div>
            <Link className="button button-secondary" to="/employees">
              View directory{' '}
              <IconArrowUpRight aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            </Link>
          </div>
          {error ? (
            <EmptyState
              icon={IconUsersGroup}
              title="Could not load employees"
              description="Check that the API is running and this account has client access."
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table client-employee-table">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Work email</th>
                    <th>Joined</th>
                    <th>Employment</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows columnCount={4} rows={4} /> : null}
                  {!loading &&
                    employees.slice(0, 8).map((employee) => (
                      <tr key={employee.id}>
                        <td data-label="Employee">
                          <div className="employee-primary">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="employee-secondary">{employee.employeeNumber}</div>
                        </td>
                        <td data-label="Work email">{employee.workEmail ?? '—'}</td>
                        <td data-label="Joined">{formatDate(employee.hireDate)}</td>
                        <td data-label="Employment">
                          <StatusChip
                            color={statusColors[employee.employmentStatus]}
                            label={statusLabels[employee.employmentStatus]}
                          />
                        </td>
                      </tr>
                    ))}
                  {!loading && employees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="table-empty">
                        <EmptyState
                          icon={IconUsersGroup}
                          title="No employees in this workspace yet"
                          description="They appear here once Tethr onboards them."
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ClientInvoicesSection />
        <ClientSpendSection />
      </section>

      <aside className="client-workspace-panel client-actions-panel" aria-label="Client actions">
        <div className="client-actions-head">
          <div className="panel-kicker">People operations</div>
          <h2 className="panel-title">Run your workspace</h2>
        </div>
        <nav className="quick-action-list">
          {quickActions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Link
                className={`quick-action${action.primary ? ' is-primary' : ''}`}
                key={action.to}
                to={action.to}
              >
                <span className="quick-action-icon">
                  <ActionIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                </span>
                <span className="quick-action-copy">
                  <span className="quick-action-title">{action.title}</span>
                  <span className="quick-action-desc">{action.description}</span>
                </span>
                <IconArrowUpRight aria-hidden="true"
                  className="quick-action-arrow"
                  size={theme.icon.size.sm}
                  stroke={theme.icon.stroke.sm}
                />
              </Link>
            );
          })}
        </nav>
      </aside>
    </section>
  );
};

type QuickAction = {
  readonly title: string;
  readonly description: string;
  readonly to: string;
  readonly icon: TablerIcon;
  readonly primary?: boolean;
};

type ClientInvoiceRow = {
  readonly id: string;
  readonly groupName: string | null;
  readonly type: string;
  readonly status: string;
  readonly serviceYear: number;
  readonly serviceMonth: number;
  readonly number: string | null;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly totalAmount: number;
};

const invoiceMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ClientInvoicesSection() {
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useQuery<{ readonly clientInvoices: readonly ClientInvoiceRow[] }>(
    CLIENT_INVOICES_QUERY,
  );
  const [loadPdf] = useLazyQuery<{ readonly clientInvoicePdf: string }>(CLIENT_INVOICE_PDF_QUERY, {
    fetchPolicy: 'no-cache',
  });
  const [loadAddendum] = useLazyQuery<{ readonly clientInvoiceAddendumPdf: string }>(
    CLIENT_INVOICE_ADDENDUM_PDF_QUERY,
    { fetchPolicy: 'no-cache' },
  );

  const fetchAndSave = async (
    loader: (options: { variables: { invoiceId: string } }) => Promise<unknown>,
    fieldName: string,
    suffix: string,
    invoiceId: string,
    invoiceNumber: string,
  ): Promise<void> => {
    setError(null);
    try {
      const result = (await loader({ variables: { invoiceId } })) as {
        data?: Record<string, string>;
      };
      if (!result.data) return;
      downloadBase64File(`${invoiceNumber}${suffix}.pdf`, result.data[fieldName]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not render PDF.');
    }
  };

  const rows = data?.clientInvoices ?? [];
  const money = (value: number, currency: string): string =>
    new Intl.NumberFormat('en', { currency, style: 'currency' }).format(value);

  return (
    <section className="table-shell" aria-labelledby="client-invoices-title">
      <div className="table-title-row">
        <div className="table-title" id="client-invoices-title">Invoices</div>
        <div className="table-density">{loading ? '…' : `${rows.length}`}</div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <colgroup>
            <col style={{ width: '13%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Number</th>
              <th>Covers</th>
              <th>Issued</th>
              <th>Due</th>
              <th className="cell-numeric">Total</th>
              <th>Status</th>
              <th aria-label="Download" />
            </tr>
          </thead>
          <tbody>
            {loading ? <SkeletonRows columnCount={7} rows={3} /> : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty">
                  <EmptyState
                    icon={IconFileInvoice}
                    title="No invoices issued yet"
                    description="They appear here as soon as Tethr issues them."
                  />
                </td>
              </tr>
            ) : null}
            {!loading &&
              rows.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Number"><span className="employee-primary">{invoice.number}</span></td>
                  <td data-label="Covers">{`${invoice.groupName ?? ''} ${invoice.type} · ${invoiceMonthNames[invoice.serviceMonth - 1]} ${invoice.serviceYear}`}</td>
                  <td data-label="Issued">{invoice.issueDate}</td>
                  <td data-label="Due">{invoice.dueDate}</td>
                  <td className="cell-numeric" data-label="Total"><strong>{money(invoice.totalAmount, invoice.currency)}</strong></td>
                  <td data-label="Status">
                    <StatusChip
                      color={invoice.status === 'paid' ? 'green' : 'blue'}
                      label={invoiceStatusLabels[invoice.status] ?? invoice.status}
                    />
                  </td>
                  <td data-label="Download">
                    <span className="row-actions row-hover-action">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          void fetchAndSave(loadPdf, 'clientInvoicePdf', '', invoice.id, invoice.number ?? 'invoice');
                        }}
                      >
                        Invoice
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          void fetchAndSave(
                            loadAddendum,
                            'clientInvoiceAddendumPdf',
                            '-addendum',
                            invoice.id,
                            invoice.number ?? 'invoice',
                          );
                        }}
                      >
                        Addendum
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </section>
  );
}

const invoiceStatusLabels: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
};

type ClientCostBreakdown = {
  readonly totalBilled: number;
  readonly currency: string;
  readonly byEmployee: readonly {
    readonly employeeId: string;
    readonly employeeName: string | null;
    readonly total: number;
  }[];
  readonly byPeriod: readonly {
    readonly serviceYear: number;
    readonly serviceMonth: number;
    readonly total: number;
  }[];
};

// Per-employee cost and spend trend, previously only inside the addendum PDF.
function ClientSpendSection() {
  const { data, loading } = useQuery<{ readonly clientCostBreakdown: ClientCostBreakdown }>(
    CLIENT_COST_BREAKDOWN_QUERY,
  );
  const breakdown = data?.clientCostBreakdown;
  const money = (value: number, currency: string): string =>
    new Intl.NumberFormat('en', { currency, style: 'currency' }).format(value);

  if (!breakdown || (breakdown.byEmployee.length === 0 && breakdown.byPeriod.length === 0)) {
    return null;
  }
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const maxPeriod = Math.max(...breakdown.byPeriod.map((period) => period.total), 1);

  return (
    <section className="table-shell" aria-labelledby="client-spend-title">
      <div className="table-title-row">
        <div className="table-title" id="client-spend-title">
          Spend by employee
        </div>
        <div className="table-density">
          {loading ? 'Loading…' : `${money(breakdown.totalBilled, breakdown.currency)} total`}
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <colgroup>
            <col style={{ width: '60%' }} />
            <col style={{ width: '40%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Employee</th>
              <th className="cell-numeric">Billed to date</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.byEmployee.map((entry) => (
              <tr key={entry.employeeId}>
                <td>
                  <Link className="table-link" to={`/employees/${entry.employeeId}`}>
                    {entry.employeeName ?? entry.employeeId}
                  </Link>
                </td>
                <td className="cell-numeric">{money(entry.total, breakdown.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {breakdown.byPeriod.length > 0 ? (
        <div className="field-list">
          <div className="field-row">
            <span className="field-label">Spend trend</span>
            <span className="field-value">{breakdown.byPeriod.length} month(s)</span>
          </div>
          {breakdown.byPeriod.map((period) => (
            <div className="field-row" key={`${period.serviceYear}-${period.serviceMonth}`}>
              <span className="field-label">
                {months[period.serviceMonth - 1]} {period.serviceYear}
              </span>
              <span className="field-value">
                <span
                  style={{
                    display: 'inline-block',
                    height: 8,
                    width: `${Math.round((period.total / maxPeriod) * 120) + 4}px`,
                    marginRight: 'var(--hrms-space-2)',
                    background: 'var(--hrms-color-accent-accent9)',
                    borderRadius: 4,
                    verticalAlign: 'middle',
                  }}
                />
                {money(period.total, breakdown.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
