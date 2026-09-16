import { useMutation, useQuery } from '@apollo/client';
import type { MainColorName } from '@hrms/ui';
import { IconExternalLink, IconReceipt } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import { DataTable, toViewColumns, type ColumnDefinition } from '../../../components/table/DataTable';
import { useListView } from '../../../components/view-bar/useListView';
import { ViewBar } from '../../../components/view-bar/ViewBar';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  BILL_EXPENSE_CLAIM_MUTATION,
  CLIENT_EXPENSE_CLAIMS_QUERY,
  DECIDE_EXPENSE_CLAIM_MUTATION,
  EXPENSE_CLAIMS_QUERY,
  EXPENSE_REIMBURSEMENT_COMPONENTS_QUERY,
  MARK_EXPENSE_CLAIM_REIMBURSED_MUTATION,
} from '../graphql/expense.operations';

type ExpenseLineRecord = {
  readonly id: string;
  readonly categoryName: string | null;
  readonly expenseDate: string;
  readonly description: string;
  readonly amount: number;
  readonly hasReceipt: boolean;
  readonly receiptFileName: string | null;
};

type ExpenseClaimRecord = {
  readonly id: string;
  readonly claimNumber: string | null;
  readonly employeeId: string;
  readonly employeeName: string | null;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly purpose: string;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: number;
  readonly billableAmount: number;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly decisionNote: string | null;
  readonly reimbursementMethod: string | null;
  readonly reimbursedAt: string | null;
  readonly reimbursementReference: string | null;
  readonly reimbursementPeriodYear: number | null;
  readonly reimbursementPeriodMonth: number | null;
  readonly billedInvoiceId: string | null;
  readonly createdAt: string;
  readonly lines: readonly ExpenseLineRecord[];
};

const STATUS_COLORS: Record<string, MainColorName> = {
  draft: 'gray',
  submitted: 'amber',
  approved: 'blue',
  rejected: 'gray',
  cancelled: 'gray',
  paid: 'green',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  paid: 'Paid',
};

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', { currency, style: 'currency' }).format(amount);

const formatDate = (value: string | null): string => (value ? value.slice(0, 10) : '—');

const CLAIM_COLUMNS: readonly ColumnDefinition<ExpenseClaimRecord>[] = [
  {
    key: 'claim',
    header: 'Claim',
    width: '30%',
    hideable: false,
    sortValue: (claim) => claim.claimNumber ?? 'Draft',
    render: (claim) => (
      <span className="employee-cell">
        <span className="employee-primary">{claim.claimNumber ?? 'Draft'}</span>
        <span className="employee-secondary">{claim.purpose}</span>
      </span>
    ),
  },
  {
    key: 'employee',
    header: 'Employee',
    width: '16%',
    sortValue: (claim) => claim.employeeName ?? '',
    render: (claim) => claim.employeeName ?? '—',
  },
  {
    key: 'workspace',
    header: 'Workspace',
    width: '14%',
    sortValue: (claim) => claim.organizationName ?? '',
    render: (claim) => claim.organizationName ?? '—',
  },
  {
    key: 'submitted',
    header: 'Submitted',
    width: '12%',
    sortValue: (claim) => claim.submittedAt ?? '',
    render: (claim) => formatDate(claim.submittedAt),
  },
  {
    key: 'total',
    header: 'Total',
    width: '12%',
    align: 'right',
    hideable: false,
    sortValue: (claim) => claim.totalAmount,
    render: (claim) => formatMoney(claim.totalAmount, claim.currency),
  },
  {
    key: 'status',
    header: 'Status',
    width: '16%',
    hideable: false,
    sortValue: (claim) => claim.status,
    render: (claim) => (
      <span className="record-inline-actions">
        <StatusChip color={STATUS_COLORS[claim.status] ?? 'gray'} label={STATUS_LABELS[claim.status] ?? claim.status} />
        {claim.billedInvoiceId ? <StatusChip color="blue" label="Billed" /> : null}
      </span>
    ),
  },
];

export const ExpensesPage = () => {
  const { user } = useAuth();
  const isTethr = user?.portal === 'tethr';
  const roleKeys = user?.roleKeys ?? [];
  const canApprove =
    roleKeys.includes('tethrAdmin') ||
    roleKeys.includes('tethrHr') ||
    roleKeys.includes('clientAdmin');
  const canPay = roleKeys.includes('tethrAdmin') || roleKeys.includes('tethrFinance');

  const { data, loading, error, refetch } = useQuery<{
    readonly clientExpenseClaims?: readonly ExpenseClaimRecord[];
    readonly expenseClaims?: readonly ExpenseClaimRecord[];
  }>(isTethr ? CLIENT_EXPENSE_CLAIMS_QUERY : EXPENSE_CLAIMS_QUERY);

  const claims = (isTethr ? data?.clientExpenseClaims : data?.expenseClaims) ?? [];

  const claimView = useListView({
    routeKey: '/expenses',
    paramKeyPrefix: 'claims',
    defaultSorts: [{ key: 'submitted', direction: 'desc' }],
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [payMethod, setPayMethod] = useState<'direct' | 'payroll'>('direct');
  const [payReference, setPayReference] = useState('');
  const [payComponentId, setPayComponentId] = useState('');
  const now = new Date();
  const [payYear, setPayYear] = useState(now.getFullYear());
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1);
  const [billYear, setBillYear] = useState(now.getFullYear());
  const [billMonth, setBillMonth] = useState(now.getMonth() + 1);

  const selected = claims.find((claim) => claim.id === selectedId) ?? null;

  // Components must come from the claim's own workspace: a cross-workspace
  // reimbursement switches into it before resolving the component id.
  const { data: componentData } = useQuery<{
    readonly payComponents: readonly { readonly id: string; readonly code: string; readonly name: string; readonly category: string }[];
  }>(EXPENSE_REIMBURSEMENT_COMPONENTS_QUERY, {
    skip: !canPay,
    variables: { organizationId: selected?.organizationId ?? null },
  });
  const reimbursementComponents = (componentData?.payComponents ?? []).filter(
    (component) => component.category === 'earning',
  );

  const [decideClaim, { loading: deciding }] = useMutation(DECIDE_EXPENSE_CLAIM_MUTATION);
  const [markReimbursed, { loading: paying }] = useMutation(
    MARK_EXPENSE_CLAIM_REIMBURSED_MUTATION,
  );
  const [billClaim, { loading: billing }] = useMutation(BILL_EXPENSE_CLAIM_MUTATION);

  const visibleClaims = useMemo(() => {
    const statuses = claimView.filters.status ?? [];
    if (statuses.length === 0) return claims;
    return claims.filter((claim) => statuses.includes(claim.status));
  }, [claims, claimView.filters.status]);

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await action();
      await refetch();
      setSuccessMessage(success);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Operation failed.');
    }
  };

  const sourceOrganizationId = selected?.organizationId ?? undefined;

  const onDecide = (decision: 'approved' | 'rejected'): void => {
    if (!selected) return;
    void run(
      () =>
        decideClaim({
          variables: {
            claimId: selected.id,
            decision,
            note: decisionNote.trim() || null,
            sourceOrganizationId,
          },
        }),
      decision === 'approved' ? 'Claim approved.' : 'Claim rejected.',
    );
  };

  const onMarkPaid = (): void => {
    if (!selected) return;
    if (payMethod === 'payroll' && !payComponentId) {
      setErrorMessage('Choose the pay component the reimbursement should ride on.');
      return;
    }
    void run(
      () =>
        markReimbursed({
          variables: {
            claimId: selected.id,
            method: payMethod,
            paymentReference: payReference.trim() || null,
            periodYear: payMethod === 'payroll' ? payYear : null,
            periodMonth: payMethod === 'payroll' ? payMonth : null,
            componentId: payMethod === 'payroll' ? payComponentId : null,
            sourceOrganizationId,
          },
        }),
      payMethod === 'payroll'
        ? 'Reimbursement scheduled into the selected payroll period.'
        : 'Reimbursement recorded.',
    );
  };

  const onBill = (): void => {
    if (!selected) return;
    void run(
      () =>
        billClaim({
          variables: {
            claimId: selected.id,
            serviceYear: billYear,
            serviceMonth: billMonth,
            sourceOrganizationId,
          },
        }),
      'Billable lines sent to the client expenses invoice.',
    );
  };

  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: Object.keys(STATUS_LABELS).map((value) => ({
        value,
        label: STATUS_LABELS[value] ?? value,
      })),
    },
  ];

  const isOpenDraft = selected?.status === 'draft';

  return (
    <section className="list-with-panel">
      <div className="page-frame">
        <div className="employees-content">
          <header className="page-header">
            <div>
              <h1 className="page-title">Expenses</h1>
              <p className="page-subtitle">
                Employee expense claims: approve, reimburse, and pass client-billable lines through.
              </p>
            </div>
          </header>

          {error ? <p className="auth-error" role="alert">Could not load expense claims.</p> : null}

          <section className="table-shell" aria-label="Expense claims">
            <ViewBar
              columns={toViewColumns(CLAIM_COLUMNS)}
              count={visibleClaims.length}
              filters={filters}
              view={claimView}
              viewLabel="All claims"
            />
            <DataTable
              columns={CLAIM_COLUMNS}
              emptyState={
                <EmptyState
                  icon={IconReceipt}
                  title="No expense claims yet"
                  description="Claims filed by employees show up here for approval and reimbursement."
                />
              }
              loading={loading}
              rows={visibleClaims}
              getRowKey={(claim) => claim.id}
              hiddenColumns={claimView.hiddenColumns}
              onHideColumn={claimView.hideColumn}
              onRowClick={(claim) => {
                setSelectedId(claim.id);
                setErrorMessage(null);
                setSuccessMessage(null);
                setDecisionNote('');
                setPayReference('');
                setPayMethod('direct');
              }}
              onSort={claimView.setSort}
              skeletonRows={4}
              sorts={claimView.sorts}
            />
          </section>
        </div>
      </div>

      <SidePanel
        isOpen={selected !== null}
        onClose={() => setSelectedId(null)}
        title="Expense claim"
      >
        {selected ? (
          <section className="self-service-section">
            <div className="panel-title-row">
              <div>
                <div className="panel-kicker">{selected.claimNumber ?? 'Draft'}</div>
                <h2 className="panel-title">{selected.employeeName ?? 'Employee'}</h2>
                <p className="employee-secondary">
                  {selected.organizationName ? `${selected.organizationName} · ` : ''}
                  {selected.purpose}
                </p>
              </div>
              <StatusChip
                color={STATUS_COLORS[selected.status] ?? 'gray'}
                label={STATUS_LABELS[selected.status] ?? selected.status}
              />
            </div>

            {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
            {successMessage ? (
              <p className="form-success" role="status">
                {successMessage}
              </p>
            ) : null}

            <div className="field-list">
              <div className="field-row">
                <span className="field-label">Total</span>
                <span className="field-value">{formatMoney(selected.totalAmount, selected.currency)}</span>
              </div>
              <div className="field-row">
                <span className="field-label">Client-billable</span>
                <span className="field-value">
                  {formatMoney(selected.billableAmount, selected.currency)}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Submitted</span>
                <span className="field-value">{formatDate(selected.submittedAt)}</span>
              </div>
              {selected.decisionNote ? (
                <div className="field-row">
                  <span className="field-label">Decision note</span>
                  <span className="field-value">{selected.decisionNote}</span>
                </div>
              ) : null}
              {selected.reimbursedAt ? (
                <div className="field-row">
                  <span className="field-label">Reimbursed</span>
                  <span className="field-value">
                    {selected.reimbursementMethod === 'payroll'
                      ? `Payroll ${selected.reimbursementPeriodYear}-${String(selected.reimbursementPeriodMonth ?? 0).padStart(2, '0')}`
                      : `Direct${selected.reimbursementReference ? ` · ${selected.reimbursementReference}` : ''}`}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="table-shell">
              <DataTable
                columns={
                  [
                    {
                      key: 'date',
                      header: 'Date',
                      width: '18%',
                      render: (line: ExpenseLineRecord) => line.expenseDate,
                    },
                    {
                      key: 'description',
                      header: 'Description',
                      width: '42%',
                      render: (line: ExpenseLineRecord) => (
                        <span className="employee-cell">
                          <span className="employee-primary">{line.description}</span>
                          <span className="employee-secondary">{line.categoryName ?? 'Expense'}</span>
                        </span>
                      ),
                    },
                    {
                      key: 'receipt',
                      header: 'Receipt',
                      width: '18%',
                      render: (line: ExpenseLineRecord) =>
                        line.hasReceipt ? (line.receiptFileName ?? 'Attached') : '—',
                    },
                    {
                      key: 'amount',
                      header: 'Amount',
                      width: '22%',
                      align: 'right' as const,
                      render: (line: ExpenseLineRecord) =>
                        formatMoney(line.amount, selected.currency),
                    },
                  ] satisfies readonly ColumnDefinition<ExpenseLineRecord>[]
                }
                loading={false}
                rows={selected.lines}
                getRowKey={(line) => line.id}
                skeletonRows={2}
              />
            </div>

            {selected.billedInvoiceId && isTethr ? (
              <p className="employee-secondary">
                <Link className="table-link" to={`/billing/${selected.billedInvoiceId}`}>
                  On the client expenses invoice <IconExternalLink aria-hidden="true" size={14} />
                </Link>
              </p>
            ) : null}
            {selected.billedInvoiceId && !isTethr ? (
              <p className="employee-secondary">Billed on the client expenses invoice.</p>
            ) : null}

            {canApprove && selected.status === 'submitted' ? (
              <div className="config-form">
                <div className="field">
                  <label htmlFor="claim-decision-note">Decision note</label>
                  <textarea
                    id="claim-decision-note"
                    name="claim-decision-note"
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                  />
                </div>
                <div className="page-actions">
                  <button
                    className="button button-primary"
                    disabled={deciding}
                    type="button"
                    onClick={() => onDecide('approved')}
                  >
                    {deciding ? 'Saving…' : 'Approve'}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={deciding}
                    type="button"
                    onClick={() => onDecide('rejected')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}

            {canPay && selected.status === 'approved' ? (
              <div className="config-form">
                <div className="field">
                  <label htmlFor="claim-pay-method">Reimbursement</label>
                  <select
                    id="claim-pay-method"
                    name="claim-pay-method"
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value as 'direct' | 'payroll')}
                  >
                    <option value="direct">Pay directly</option>
                    <option value="payroll">Add to a payroll run</option>
                  </select>
                </div>
                {payMethod === 'direct' ? (
                  <div className="field">
                    <label htmlFor="claim-pay-reference">Payment reference</label>
                    <input
                      id="claim-pay-reference"
                      autoComplete="off"
                      name="claim-pay-reference"
                      placeholder="Cash / bank transfer reference"
                      spellCheck={false}
                      value={payReference}
                      onChange={(event) => setPayReference(event.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="claim-pay-component">Pay component</label>
                      <select
                        id="claim-pay-component"
                        name="claim-pay-component"
                        value={payComponentId}
                        onChange={(event) => setPayComponentId(event.target.value)}
                      >
                        <option value="">Choose a component…</option>
                        {reimbursementComponents.map((component) => (
                          <option key={component.id} value={component.id}>
                            {component.code} · {component.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="claim-pay-year">Year</label>
                        <input
                          id="claim-pay-year"
                          inputMode="numeric"
                          max={2100}
                          min={2000}
                          name="claim-pay-year"
                          type="number"
                          value={payYear}
                          onChange={(event) => setPayYear(Number(event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="claim-pay-month">Month</label>
                        <input
                          id="claim-pay-month"
                          inputMode="numeric"
                          max={12}
                          min={1}
                          name="claim-pay-month"
                          type="number"
                          value={payMonth}
                          onChange={(event) => setPayMonth(Number(event.target.value))}
                        />
                      </div>
                    </div>
                  </>
                )}
                <button
                  className="button button-primary button-full"
                  disabled={paying}
                  type="button"
                  onClick={onMarkPaid}
                >
                  {paying ? 'Saving…' : 'Mark reimbursed'}
                </button>
              </div>
            ) : null}

            {canPay &&
            (selected.status === 'approved' || selected.status === 'paid') &&
            selected.billableAmount > 0 &&
            !selected.billedInvoiceId ? (
              <div className="config-form">
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="claim-bill-year">Bill year</label>
                    <input
                      id="claim-bill-year"
                      inputMode="numeric"
                      max={2100}
                      min={2000}
                      name="claim-bill-year"
                      type="number"
                      value={billYear}
                      onChange={(event) => setBillYear(Number(event.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="claim-bill-month">Bill month</label>
                    <input
                      id="claim-bill-month"
                      inputMode="numeric"
                      max={12}
                      min={1}
                      name="claim-bill-month"
                      type="number"
                      value={billMonth}
                      onChange={(event) => setBillMonth(Number(event.target.value))}
                    />
                  </div>
                </div>
                <button
                  className="button button-secondary button-full"
                  disabled={billing}
                  type="button"
                  onClick={onBill}
                >
                  {billing ? 'Sending…' : 'Bill billable lines to the client'}
                </button>
              </div>
            ) : null}

            {isOpenDraft ? (
              <p className="employee-secondary">
                This claim is still a draft; the employee can submit it from their workspace.
              </p>
            ) : null}
          </section>
        ) : null}
      </SidePanel>
    </section>
  );
};
