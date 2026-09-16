import { useMutation, useQuery } from '@apollo/client';
import { formatMoney, type InvoiceStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconFileInvoice,
  IconFilterOff,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { StatusChip } from '../../../../components/chip/StatusChip';
import { useConfirm } from '../../../../components/confirm/ConfirmProvider';
import { EmptyState } from '../../../../components/empty-state/EmptyState';
import { focusFirstByName } from '../../../../components/form/validation';
import { Modal } from '../../../../components/modal/Modal';
import { DataTable, toViewColumns, type ColumnDefinition } from '../../../../components/table/DataTable';
import { Tooltip } from '../../../../components/tooltip/Tooltip';
import { useListView } from '../../../../components/view-bar/useListView';
import { ViewBar } from '../../../../components/view-bar/ViewBar';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  BILLING_PAGE_DATA_QUERY,
  CREATE_BILLING_GROUP_MUTATION,
  OPEN_EXPENSES_INVOICE_MUTATION,
  REMOVE_BILLING_MEMBER_MUTATION,
  SET_BILLING_MEMBER_MUTATION,
} from '../graphql/billing.operations';

type BillingConfigRecord = {
  readonly id: string;
  readonly feeAmount: number;
  readonly feeCurrency: string;
  readonly paymentTermsNetDays: number;
  readonly anchorDay: number;
  readonly receiverName: string | null;
  readonly receiverEmail: string | null;
  readonly receiverAddress: string | null;
  readonly receiverZipCode: string | null;
  readonly receiverCity: string | null;
  readonly receiverCountry: string | null;
  readonly receiverPhone: string | null;
  readonly senderAddress: string | null;
  readonly senderZipCode: string | null;
  readonly senderCity: string | null;
  readonly senderCountry: string | null;
  readonly senderPhone: string | null;
  readonly invoiceLogoDataUrl: string | null;
  readonly signatureDataUrl: string | null;
};

type BillingGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly servicesPrefix: string;
  readonly expensesPrefix: string;
  readonly memberCount?: number;
};

type BillingMemberRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly displayName: string | null;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly monthlyRate: number;
  readonly rateCurrency: string;
};

type InvoiceRow = {
  readonly id: string;
  readonly groupName: string | null;
  readonly type: string;
  readonly status: InvoiceStatus;
  readonly serviceYear: number;
  readonly serviceMonth: number;
  readonly number: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly totalAmount: number;
  readonly isStale?: boolean;
  readonly staleReason?: string | null;
};

type EmployeeOption = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
};

type ReconciliationPeriodRecord = {
  readonly serviceYear: number;
  readonly serviceMonth: number;
  readonly status: string;
  readonly currency: string;
  readonly invoiceCount: number;
  readonly invoicedAmount: number;
  readonly payrollCostAmount: number | null;
  readonly varianceAmount: number | null;
  readonly payDate: string | null;
  readonly invoices: readonly {
    readonly invoiceId: string;
    readonly number: string | null;
    readonly reconciliationStatus: string;
    readonly invoicedAmount: number;
  }[];
};

type BillingPageData = {
  readonly billingConfig: BillingConfigRecord;
  readonly billingGroups: readonly BillingGroupRecord[];
  readonly billingMembers: readonly BillingMemberRecord[];
  readonly invoices: readonly InvoiceRow[];
  readonly employees: readonly EmployeeOption[];
  readonly billingReconciliation: readonly ReconciliationPeriodRecord[];
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const statusColor = (status: InvoiceStatus): MainColorName =>
  status === 'paid'
    ? 'green'
    : status === 'issued'
      ? 'blue'
      : status === 'voided'
        ? 'gray'
        : 'amber';

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  voided: 'Voided',
};

const GROUP_COLUMNS: readonly ColumnDefinition<BillingGroupRecord>[] = [
  {
    key: 'group',
    header: 'Group',
    width: '40%',
    hideable: false,
    sortValue: (group) => group.name,
    render: (group) => <span className="employee-primary">{group.name}</span>,
  },
  {
    key: 'prefixes',
    header: 'Prefixes',
    width: '38%',
    sortValue: (group) => `${group.servicesPrefix}/${group.expensesPrefix}`,
    render: (group) => `${group.servicesPrefix} / ${group.expensesPrefix}`,
  },
  {
    key: 'members',
    header: 'Members',
    width: '22%',
    align: 'right',
    sortValue: (group) => group.memberCount ?? 0,
    render: (group) => group.memberCount ?? 0,
  },
];

const INVOICE_COLUMNS: readonly ColumnDefinition<InvoiceRow>[] = [
  {
    key: 'number',
    header: 'Number',
    width: '16%',
    hideable: false,
    sortValue: (invoice) => invoice.number ?? 'Draft',
    render: (invoice) => <span className="employee-primary">{invoice.number ?? 'Draft'}</span>,
  },
  {
    key: 'type',
    header: 'Group / Type',
    width: '22%',
    sortValue: (invoice) => `${invoice.groupName ?? ''} ${invoice.type}`,
    render: (invoice) => `${invoice.groupName ?? '—'} · ${invoice.type}`,
  },
  {
    key: 'covers',
    header: 'Covers',
    width: '16%',
    sortValue: (invoice) => invoice.serviceYear * 100 + invoice.serviceMonth,
    render: (invoice) => `${MONTH_NAMES[invoice.serviceMonth - 1]} ${invoice.serviceYear}`,
  },
  {
    key: 'total',
    header: 'Total',
    width: '14%',
    align: 'right',
    hideable: false,
    sortValue: (invoice) => invoice.totalAmount,
    render: (invoice) => formatMoney(invoice.totalAmount, invoice.currency),
  },
  {
    key: 'status',
    header: 'Status',
    width: '13%',
    hideable: false,
    sortValue: (invoice) => invoice.status,
    render: (invoice) => (
      <span className="record-inline-actions">
        <StatusChip color={statusColor(invoice.status)} label={invoiceStatusLabels[invoice.status]} />
        {invoice.isStale ? <StatusChip color="amber" label="Stale" /> : null}
      </span>
    ),
  },
  {
    key: 'due',
    header: 'Due',
    width: '11%',
    sortValue: (invoice) => invoice.dueDate ?? '',
    render: (invoice) => invoice.dueDate ?? '—',
  },
  {
    key: 'open',
    header: '',
    label: 'Open',
    width: '8%',
    hideable: false,
    render: (invoice) => (
      <Link className="table-link" to={`/billing/${invoice.id}`}>
        Open
      </Link>
    ),
  },
];

const now = new Date();

const reconciliationColor: Record<string, MainColorName> = {
  open: 'gray',
  balanced: 'green',
  variance: 'amber',
  no_cost_data: 'gray',
};

const reconciliationLabels: Record<string, string> = {
  open: 'Awaiting run',
  balanced: 'Balanced',
  variance: 'Variance',
  no_cost_data: 'No FX rate',
};

const RECONCILIATION_COLUMNS: readonly ColumnDefinition<ReconciliationPeriodRecord>[] = [
  {
    key: 'period',
    header: 'Service month',
    width: '20%',
    hideable: false,
    sortValue: (row) => row.serviceYear * 100 + row.serviceMonth,
    render: (row) => (
      <span className="employee-primary">
        {`${MONTH_NAMES[row.serviceMonth - 1]} ${row.serviceYear}`}
      </span>
    ),
  },
  {
    key: 'invoices',
    header: 'Invoices',
    width: '10%',
    align: 'right',
    sortValue: (row) => row.invoiceCount,
    render: (row) => row.invoiceCount,
  },
  {
    key: 'invoiced',
    header: 'Invoiced (salary)',
    width: '18%',
    align: 'right',
    sortValue: (row) => row.invoicedAmount,
    render: (row) => formatMoney(row.invoicedAmount, row.currency),
  },
  {
    key: 'cost',
    header: 'Payroll cost',
    width: '18%',
    align: 'right',
    sortValue: (row) => row.payrollCostAmount ?? -1,
    render: (row) =>
      row.payrollCostAmount === null ? '—' : formatMoney(row.payrollCostAmount, row.currency),
  },
  {
    key: 'variance',
    header: 'Variance',
    width: '16%',
    align: 'right',
    sortValue: (row) => row.varianceAmount ?? 0,
    render: (row) =>
      row.varianceAmount === null ? '—' : formatMoney(row.varianceAmount, row.currency),
  },
  {
    key: 'status',
    header: 'Status',
    width: '18%',
    hideable: false,
    sortValue: (row) => row.status,
    render: (row) => (
      <StatusChip
        color={reconciliationColor[row.status] ?? 'gray'}
        label={reconciliationLabels[row.status] ?? row.status}
      />
    ),
  },
];

export const BillingPage = () => {
  const { theme } = useTheme();
  const confirm = useConfirm();
  const { data, loading, error, refetch } = useQuery<BillingPageData>(BILLING_PAGE_DATA_QUERY);
  const [formError, setFormError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<'group' | 'rate' | 'expenses' | null>(null);
  const [invalidRateFields, setInvalidRateFields] = useState<readonly string[]>([]);

  const groupView = useListView({ routeKey: '/billing/groups', paramKeyPrefix: 'groups' });
  const memberView = useListView({ routeKey: '/billing/rates', paramKeyPrefix: 'rates' });
  const invoiceView = useListView({
    routeKey: '/billing/invoices',
    paramKeyPrefix: 'invoices',
    defaultSorts: [{ key: 'covers', direction: 'desc' }],
  });
  const reconciliationView = useListView({
    routeKey: '/billing/reconciliation',
    paramKeyPrefix: 'reconciliation',
    defaultSorts: [{ key: 'period', direction: 'desc' }],
  });

  const [groupName, setGroupName] = useState('');
  const [servicesPrefix, setServicesPrefix] = useState('SP');
  const [expensesPrefix, setExpensesPrefix] = useState('EP');

  const [memberEmployeeId, setMemberEmployeeId] = useState('');
  const [memberGroupId, setMemberGroupId] = useState('');
  const [memberRate, setMemberRate] = useState('');

  const [expenseGroupId, setExpenseGroupId] = useState('');
  const [expenseYear, setExpenseYear] = useState(now.getFullYear());
  const [expenseMonth, setExpenseMonth] = useState(now.getMonth() + 1);

  const [createGroup] = useMutation(CREATE_BILLING_GROUP_MUTATION);
  const [setMember] = useMutation(SET_BILLING_MEMBER_MUTATION);
  const [removeMember] = useMutation(REMOVE_BILLING_MEMBER_MUTATION);
  const [openExpenses] = useMutation(OPEN_EXPENSES_INVOICE_MUTATION);

  const groups = data?.billingGroups ?? [];
  const members = data?.billingMembers ?? [];
  const invoices = data?.invoices ?? [];
  const reconciliation = data?.billingReconciliation ?? [];

  const memberGroups = useMemo(
    () =>
      [
        ...new Set(
          members
            .map((member) => member.groupName)
            .filter((name): name is string => Boolean(name)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [members],
  );
  const invoiceGroups = useMemo(
    () =>
      [
        ...new Set(
          invoices
            .map((invoice) => invoice.groupName)
            .filter((name): name is string => Boolean(name)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [invoices],
  );

  const visibleMembers = useMemo(() => {
    const groupNames = memberView.filters.group ?? [];
    if (groupNames.length === 0) return members;
    return members.filter(
      (member) => member.groupName !== null && groupNames.includes(member.groupName),
    );
  }, [members, memberView.filters.group]);

  const visibleInvoices = useMemo(() => {
    const statuses = invoiceView.filters.status ?? [];
    const groupNames = invoiceView.filters.group ?? [];
    return invoices.filter((invoice) => {
      if (statuses.length > 0 && !statuses.includes(invoice.status)) return false;
      if (groupNames.length > 0 && !groupNames.includes(invoice.groupName ?? '')) return false;
      return true;
    });
  }, [invoices, invoiceView.filters.group, invoiceView.filters.status]);

  const employees = data?.employees ?? [];

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setFormError(null);
    try {
      await action();
      await refetch();
      return true;
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save the change. Refresh and try again.');
      return false;
    }
  };

  const openModalWith = (modal: 'group' | 'rate' | 'expenses'): void => {
    setFormError(null);
    setInvalidRateFields([]);
    setOpenModal(modal);
  };

  const onRemoveMember = async (member: BillingMemberRecord): Promise<void> => {
    const confirmed = await confirm({
      title: 'Remove this membership?',
      body: 'The employee will no longer be billed under this group.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    await run(() =>
      removeMember({
        variables: { employeeId: member.employeeId },
        refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
      }),
    );
  };

  const memberColumns: readonly ColumnDefinition<BillingMemberRecord>[] = [
    {
      key: 'employee',
      header: 'Employee',
      width: '36%',
      hideable: false,
      sortValue: (member) => member.displayName ?? member.employeeId,
      render: (member) => (
        <Link className="table-link" to={`/employees/${member.employeeId}`}>
          {member.displayName ?? member.employeeId}
        </Link>
      ),
    },
    {
      key: 'group',
      header: 'Group',
      width: '26%',
      sortValue: (member) => member.groupName ?? '',
      render: (member) => member.groupName,
    },
    {
      key: 'monthlyRate',
      header: 'Monthly rate',
      width: '26%',
      align: 'right',
      sortValue: (member) => member.monthlyRate,
      render: (member) => `${formatMoney(member.monthlyRate, member.rateCurrency)} / mo`,
    },
    {
      key: 'remove',
      header: '',
      label: 'Remove',
      width: '12%',
      hideable: false,
      render: (member) => (
        <Tooltip label="Remove membership" side="top">
          <button
            aria-label="Remove membership"
            className="icon-button row-hover-action"
            onClick={() => void onRemoveMember(member)}
            type="button"
          >
            <IconX aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          </button>
        </Tooltip>
      ),
    },
  ];

  const memberFilters = [
    {
      key: 'group',
      label: 'Group',
      options: memberGroups.map((groupName) => ({ value: groupName, label: groupName })),
    },
  ];

  const invoiceFilters = [
    {
      key: 'status',
      label: 'Status',
      options: (Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map((value) => ({
        value,
        label: invoiceStatusLabels[value],
      })),
    },
    {
      key: 'group',
      label: 'Group',
      options: invoiceGroups.map((groupName) => ({ value: groupName, label: groupName })),
    },
  ];

  const groupsEmpty = (
    <EmptyState
      icon={IconUsersGroup}
      title="No billing groups yet"
      description="Groups decide which client entity an employee’s work is billed to."
      action={
        <button className="button button-secondary" onClick={() => openModalWith('group')} type="button">
          <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          New group
        </button>
      }
    />
  );

  const membersEmpty: ReactNode =
    members.length === 0 ? (
      <EmptyState
        icon={IconUsersGroup}
        title="Nobody assigned yet"
        description="Assign a rate so this client pays for the employee’s time."
        action={
          <button className="button button-secondary" onClick={() => openModalWith('rate')} type="button">
            <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            Assign rate
          </button>
        }
      />
    ) : (
      <EmptyState
        icon={IconFilterOff}
        title="No rates match this filter"
        description="Clear the filter to see every assigned rate."
        action={
          <button className="button button-secondary" onClick={memberView.clearFilters} type="button">
            Clear filters
          </button>
        }
      />
    );

  const invoicesEmpty: ReactNode =
    invoices.length === 0 ? (
      <EmptyState
        icon={IconFileInvoice}
        title="No invoices yet"
        description="Finish a payroll run and client invoices are created for you."
      />
    ) : (
      <EmptyState
        icon={IconFilterOff}
        title="No invoices match these filters"
        description="Clear a filter to see more."
        action={
          <button className="button button-secondary" onClick={invoiceView.clearFilters} type="button">
            Clear filters
          </button>
        }
      />
    );

  const onCreateGroup = (event: FormEvent): void => {
    event.preventDefault();
    if (!groupName.trim()) {
      setFormError('Enter a group name before creating the group.');
      focusFirstByName(document.querySelector<HTMLElement>('.modal-dialog'), ['group-name']);
      return;
    }
    setFormError(null);
    void run(() =>
      createGroup({
        variables: { input: { name: groupName.trim(), servicesPrefix, expensesPrefix } },
        refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
      }),
    ).then((ok) => {
      if (ok) {
        setGroupName('');
        setOpenModal(null);
      }
    });
  };

  const onAssignMember = (event: FormEvent): void => {
    event.preventDefault();
    const missing: string[] = [];
    if (!memberEmployeeId) missing.push('member-employee');
    if (!memberGroupId) missing.push('member-group');
    // The form sets noValidate, so the native min/required checks are off —
    // validate the parsed value here and never send a negative or NaN rate.
    const parsedRate = Number(memberRate);
    if (memberRate.trim() === '' || !Number.isFinite(parsedRate) || parsedRate < 0) {
      missing.push('member-rate');
    }
    if (missing.length > 0) {
      setFormError(
        missing.length === 1 && missing[0] === 'member-employee'
          ? 'Select the employee this rate is for.'
          : missing.length === 1 && missing[0] === 'member-group'
            ? 'Select the group this rate belongs to.'
            : missing.length === 1
              ? 'Enter a monthly rate of zero or more before saving.'
              : 'Choose an employee and a group, and enter a monthly rate of zero or more before saving.',
      );
      setInvalidRateFields(missing);
      focusFirstByName(document.querySelector<HTMLElement>('.modal-dialog'), missing);
      return;
    }
    setFormError(null);
    setInvalidRateFields([]);
    void run(() =>
      setMember({
        variables: {
          input: {
            employeeId: memberEmployeeId,
            groupId: memberGroupId,
            monthlyRate: parsedRate,
          },
        },
        refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
      }),
    ).then((ok) => {
      if (ok) {
        setMemberEmployeeId('');
        setMemberGroupId('');
        setMemberRate('');
        setOpenModal(null);
      }
    });
  };

  return (
    <section className="page-frame page-frame-single">
      <div className="employees-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Billing</h1>
            <p className="page-subtitle">Manage client billing, rates, and invoices.</p>
          </div>
          <div className="page-actions">
            <Link className="button button-secondary" to="/settings/billing">
              <IconSettings aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Billing settings
            </Link>
            <Tooltip label="Refresh">
              <button
                aria-label="Refresh"
                className="icon-button"
                onClick={() => void refetch()}
                type="button"
              >
                <IconRefresh aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </button>
            </Tooltip>
          </div>
        </header>

        {error ? <p className="auth-error" role="alert">Could not load billing data.</p> : null}

        <section className="table-shell" aria-label="Billing groups">
          <ViewBar
            actions={
              <button className="button button-secondary" type="button" onClick={() => openModalWith('group')}>
                <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                New group
              </button>
            }
            columns={toViewColumns(GROUP_COLUMNS)}
            count={groups.length}
            filters={[]}
            view={groupView}
            viewLabel="All groups"
          />
          <DataTable
            columns={GROUP_COLUMNS}
            emptyState={groupsEmpty}
            loading={loading}
            rows={groups}
            getRowKey={(group) => group.id}
            hiddenColumns={groupView.hiddenColumns}
            onHideColumn={groupView.hideColumn}
            onSort={groupView.setSort}
            skeletonRows={3}
            sorts={groupView.sorts}
          />
        </section>

        <section className="table-shell" aria-label="Agreed rates">
          <ViewBar
            actions={
              <button className="button button-secondary" type="button" onClick={() => openModalWith('rate')}>
                <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Assign rate
              </button>
            }
            columns={toViewColumns(memberColumns)}
            count={visibleMembers.length}
            filters={memberFilters}
            view={memberView}
            viewLabel="All rates"
          />
          <DataTable
            columns={memberColumns}
            emptyState={membersEmpty}
            loading={loading}
            rows={visibleMembers}
            getRowKey={(member) => member.id}
            hiddenColumns={memberView.hiddenColumns}
            onHideColumn={memberView.hideColumn}
            onSort={memberView.setSort}
            skeletonRows={3}
            sorts={memberView.sorts}
          />
        </section>

        <section className="table-shell" aria-label="Invoices">
          <ViewBar
            actions={
              <button className="button button-secondary" type="button" onClick={() => openModalWith('expenses')}>
                <IconFileInvoice aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Open expenses draft
              </button>
            }
            columns={toViewColumns(INVOICE_COLUMNS)}
            count={visibleInvoices.length}
            filters={invoiceFilters}
            view={invoiceView}
            viewLabel="All invoices"
          />
          <DataTable
            columns={INVOICE_COLUMNS}
            emptyState={invoicesEmpty}
            loading={loading}
            rows={visibleInvoices}
            getRowKey={(invoice) => invoice.id}
            hiddenColumns={invoiceView.hiddenColumns}
            onHideColumn={invoiceView.hideColumn}
            onSort={invoiceView.setSort}
            skeletonRows={3}
            sorts={invoiceView.sorts}
          />
        </section>

        <section className="table-shell" aria-label="Reconciliation">
          <ViewBar
            columns={toViewColumns(RECONCILIATION_COLUMNS)}
            count={reconciliation.length}
            filters={[]}
            view={reconciliationView}
            viewLabel="Payroll vs invoiced"
          />
          <DataTable
            columns={RECONCILIATION_COLUMNS}
            emptyState={
              <EmptyState
                icon={IconFileInvoice}
                title="No reconciliation yet"
                description="Monthly payroll cost vs invoiced salary appears here once a run finalizes."
              />
            }
            loading={loading}
            rows={reconciliation}
            getRowKey={(row) => `${row.serviceYear}-${row.serviceMonth}`}
            hiddenColumns={reconciliationView.hiddenColumns}
            onHideColumn={reconciliationView.hideColumn}
            onSort={reconciliationView.setSort}
            skeletonRows={2}
            sorts={reconciliationView.sorts}
          />
        </section>
      </div>

      <Modal
        isOpen={openModal === 'group'}
        onClose={() => setOpenModal(null)}
        title="New billing group"
        width="sm"
      >
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        <form className="config-form" onSubmit={onCreateGroup}>
          <div className="field"><label htmlFor="group-name">Name</label>
            <input id="group-name" name="group-name" placeholder="PowerTech" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="sp-prefix">Services prefix</label>
            <input id="sp-prefix" autoComplete="off" maxLength={8} name="sp-prefix" spellCheck={false} value={servicesPrefix} onChange={(e) => setServicesPrefix(e.target.value.toUpperCase())} />
          </div>
          <div className="field"><label htmlFor="ep-prefix">Expenses prefix</label>
            <input id="ep-prefix" autoComplete="off" maxLength={8} name="ep-prefix" spellCheck={false} value={expensesPrefix} onChange={(e) => setExpensesPrefix(e.target.value.toUpperCase())} />
          </div>
          <button className="button button-secondary button-full" type="submit">Create group</button>
        </form>
      </Modal>

      <Modal
        isOpen={openModal === 'rate'}
        onClose={() => setOpenModal(null)}
        title="Assign rate"
        width="md"
      >
        {formError ? (
          <p className="auth-error" id="assign-rate-error" role="alert">
            {formError}
          </p>
        ) : null}
        <form className="config-form" noValidate onSubmit={onAssignMember}>
          <div className="field"><label htmlFor="member-employee">Employee</label>
            <select
              aria-describedby={invalidRateFields.length > 0 ? 'assign-rate-error' : undefined}
              aria-invalid={invalidRateFields.includes('member-employee') || undefined}
              id="member-employee"
              name="member-employee"
              value={memberEmployeeId}
              onChange={(e) => setMemberEmployeeId(e.target.value)}
            >
              <option value="">Select…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{`${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`}</option>
              ))}
            </select>
          </div>
          <div className="field"><label htmlFor="member-group">Group</label>
            <select
              aria-describedby={invalidRateFields.length > 0 ? 'assign-rate-error' : undefined}
              aria-invalid={invalidRateFields.includes('member-group') || undefined}
              id="member-group"
              name="member-group"
              value={memberGroupId}
              onChange={(e) => setMemberGroupId(e.target.value)}
            >
              <option value="">Select…</option>
              {groups.map((group) => (<option key={group.id} value={group.id}>{group.name}</option>))}
            </select>
          </div>
          <div className="field"><label htmlFor="member-rate">Monthly rate (USD)</label>
            <input
              aria-describedby={invalidRateFields.length > 0 ? 'assign-rate-error' : undefined}
              aria-invalid={invalidRateFields.includes('member-rate') || undefined}
              id="member-rate"
              inputMode="decimal"
              min={0}
              name="member-rate"
              required
              step="0.01"
              type="number"
              value={memberRate}
              onChange={(e) => setMemberRate(e.target.value)}
            />
          </div>
          <button className="button button-primary button-full" type="submit">Save rate</button>
        </form>
      </Modal>

      <Modal
        isOpen={openModal === 'expenses'}
        onClose={() => setOpenModal(null)}
        title="Open expenses draft"
        width="sm"
      >
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        <form
          className="config-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!expenseGroupId) {
              setFormError('Select the group this draft is for.');
              focusFirstByName(document.querySelector<HTMLElement>('.modal-dialog'), [
                'expense-group',
              ]);
              return;
            }
            setFormError(null);
            void run(() =>
              openExpenses({
                variables: { groupId: expenseGroupId, serviceYear: expenseYear, serviceMonth: expenseMonth },
                refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
              }),
            ).then((ok) => {
              if (ok) {
                setOpenModal(null);
              }
            });
          }}
        >
          <div className="field"><label htmlFor="expense-group">Group</label>
            <select id="expense-group" name="expense-group" value={expenseGroupId} onChange={(e) => setExpenseGroupId(e.target.value)}>
              <option value="">Select…</option>
              {groups.map((group) => (<option key={group.id} value={group.id}>{group.name}</option>))}
            </select>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="expense-month">Month</label>
              <select id="expense-month" name="expense-month" value={expenseMonth} onChange={(e) => setExpenseMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, index) => (<option key={name} value={index + 1}>{name}</option>))}
              </select>
            </div>
            <div className="field"><label htmlFor="expense-year">Year</label>
              <input id="expense-year" inputMode="numeric" max={2100} min={2000} name="expense-year" type="number" value={expenseYear} onChange={(e) => setExpenseYear(Number(e.target.value))} />
            </div>
          </div>
          <button className="button button-secondary button-full" type="submit">
            <IconFileInvoice aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            Open draft
          </button>
        </form>
      </Modal>
    </section>
  );
};
