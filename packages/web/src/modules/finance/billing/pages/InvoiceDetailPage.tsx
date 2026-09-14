import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { IconCheck, IconFileInvoice, IconLock, IconPlus, IconX } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { downloadBase64File } from '../../../../app/download';
import { StatusChip } from '../../../../components/chip/StatusChip';
import { EmptyState } from '../../../../components/empty-state/EmptyState';
import { FieldGroup } from '../../../../components/record-panel/FieldGroup';
import { FieldRow } from '../../../../components/record-panel/FieldRow';
import { useInlineCreate } from '../../../../components/record-panel/useInlineCreate';
import { SidePanel } from '../../../../components/side-panel/SidePanel';
import {
  DataTable,
  type ColumnDefinition,
  type DraftRow,
} from '../../../../components/table/DataTable';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  ADD_INVOICE_LINE_MUTATION,
  INVOICE_DETAIL_QUERY,
  INVOICE_ADDENDUM_PDF_QUERY,
  INVOICE_PDF_QUERY,
  ISSUE_INVOICE_MUTATION,
  MARK_INVOICE_PAID_MUTATION,
  REMOVE_INVOICE_LINE_MUTATION,
  UPDATE_INVOICE_LINE_MUTATION,
} from '../graphql/billing.operations';

type InvoiceLineRecord = {
  readonly id: string;
  readonly kind: string;
  readonly employeeId: string | null;
  readonly employeeName: string | null;
  readonly monthLabel: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly total: number;
};

type InvoiceRecord = {
  readonly id: string;
  readonly groupName: string | null;
  readonly type: string;
  readonly status: string;
  readonly serviceYear: number;
  readonly serviceMonth: number;
  readonly periodStart: string;
  readonly periodEndExclusive: string;
  readonly number: string | null;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly receiverName: string | null;
  readonly subTotal: number;
  readonly totalAmount: number;
  readonly paidAt: string | null;
  readonly paymentReference: string | null;
  readonly lines?: readonly InvoiceLineRecord[];
};

type LineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', { currency, style: 'currency' }).format(amount);

const emptyLineDraft = (): LineDraft => ({ description: '', quantity: '1', unitPrice: '' });

const isLineDraftComplete = (draft: LineDraft): boolean => {
  const amount = Number(draft.unitPrice);
  const quantity = Number(draft.quantity);
  return (
    draft.unitPrice.trim() !== '' &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    Number.isFinite(quantity) &&
    quantity > 0
  );
};

const draftAsLine = (draft: LineDraft): InvoiceLineRecord => {
  const quantity = Number(draft.quantity) || 0;
  const unitPrice = Number(draft.unitPrice) || 0;
  return {
    id: '__draft',
    kind: 'expense',
    employeeId: null,
    employeeName: null,
    monthLabel: null,
    description: draft.description,
    quantity,
    unitPrice,
    total: quantity * unitPrice,
  };
};

export const InvoiceDetailPage = () => {
  const { theme } = useTheme();
  const invoiceId = useParams<{ invoiceId: string }>().invoiceId ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [loadInvoicePdf, { loading: loadingPdf }] = useLazyQuery<{ readonly invoicePdf: string }>(
    INVOICE_PDF_QUERY,
    { fetchPolicy: 'no-cache' },
  );
  const [loadAddendumPdf, { loading: loadingAddendum }] = useLazyQuery<{
    readonly invoiceAddendumPdf: string;
  }>(INVOICE_ADDENDUM_PDF_QUERY, { fetchPolicy: 'no-cache' });

  const downloadDocument = async (
    loader: (options: { variables: { invoiceId: string } }) => Promise<unknown>,
    fieldName: string,
    suffix: string,
  ): Promise<void> => {
    setError(null);
    try {
      const result = (await loader({ variables: { invoiceId } })) as {
        data?: Record<string, string>;
      };
      if (!result.data) return;
      const name = invoice?.number ?? 'invoice-draft';
      downloadBase64File(`${name}${suffix}.pdf`, result.data[fieldName]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate PDF.');
    }
  };

  const { data, loading, error: loadError, refetch } = useQuery<{ readonly invoice: InvoiceRecord }>(
    INVOICE_DETAIL_QUERY,
    { variables: { invoiceId }, skip: !invoiceId },
  );

  const [addLine] = useMutation(ADD_INVOICE_LINE_MUTATION);
  const [updateLine] = useMutation(UPDATE_INVOICE_LINE_MUTATION);
  const [removeLine] = useMutation(REMOVE_INVOICE_LINE_MUTATION);
  const [issueInvoice, { loading: issuing }] = useMutation(ISSUE_INVOICE_MUTATION);
  const [markPaid, { loading: paying }] = useMutation(MARK_INVOICE_PAID_MUTATION);

  const run = async (action: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
    setError(null);
    setMessage(null);
    try {
      await action();
      await refetch();
      if (successMessage) setMessage(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed.');
      return false;
    }
  };

  const invoice = data?.invoice;
  const lines = useMemo(() => invoice?.lines ?? [], [invoice?.lines]);
  const isDraft = invoice?.status === 'draft';
  const currency = invoice?.currency ?? 'USD';

  const create = useInlineCreate<LineDraft, InvoiceLineRecord>({
    createEmptyDraft: emptyLineDraft,
    isComplete: isLineDraftComplete,
    createRecord: async (draft) => {
      const previousIds = new Set(lines.map((line) => line.id));
      await addLine({
        variables: {
          input: {
            invoiceId,
            description: draft.description.trim() || 'New line',
            quantity: Number(draft.quantity) || 1,
            unitPrice: Number(draft.unitPrice),
          },
        },
      });
      const refreshed = await refetch();
      const refreshedLines = refreshed.data?.invoice.lines ?? [];
      return refreshedLines.find((line) => !previousIds.has(line.id)) ?? null;
    },
    onCreated: (line) => {
      setEditingLineId(line.id);
      setMessage('Line added.');
    },
  });

  const startCreate = (): void => {
    setEditingLineId(null);
    create.start();
  };

  const onDeleteLine = async (lineId: string): Promise<void> => {
    const ok = await run(
      () => removeLine({ variables: { lineId, invoiceId } }),
      'Line removed.',
    );
    if (ok) setEditingLineId(null);
  };

  // Line edits are partial: only the field that changed is sent. Invalid
  // numbers are rejected locally (and the row re-renders from the server value)
  // so the API's "greater than zero" rule never surfaces as a raw error.
  const commitLineField = async (
    lineId: string,
    key: 'description' | 'quantity' | 'unitPrice',
    value: string,
  ): Promise<void> => {
    setError(null);
    if (key !== 'description') {
      const numeric = Number(value);
      const floor = key === 'quantity' ? 0.01 : 0;
      if (value.trim() === '' || !Number.isFinite(numeric) || numeric < floor) {
        setError(
          key === 'quantity'
            ? 'Quantity must be greater than zero.'
            : 'Unit price cannot be negative.',
        );
        await refetch();
        return;
      }
    }
    try {
      await updateLine({
        variables: {
          input: { lineId, [key]: key === 'description' ? value : Number(value) },
        },
      });
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the line');
    }
  };

  const selectedLine = lines.find((line) => line.id === editingLineId) ?? null;

  const baseColumns: readonly ColumnDefinition<InvoiceLineRecord>[] = [
    {
      key: 'person',
      header: 'Person / Item',
      width: '20%',
      render: (line) =>
        line.employeeId ? (
          <Link className="table-link" to={`/employees/${line.employeeId}`}>
            {line.employeeName ?? '—'}
          </Link>
        ) : (
          <span className="employee-primary">{line.employeeName ?? '—'}</span>
        ),
    },
    {
      key: 'month',
      header: 'Month',
      width: '12%',
      render: (line) => line.monthLabel ?? '—',
    },
    {
      key: 'description',
      header: 'Description',
      width: '30%',
      render: (line) => line.description,
    },
    {
      key: 'quantity',
      header: 'Qty',
      width: '8%',
      align: 'right',
      render: (line) => line.quantity,
    },
    {
      key: 'unitPrice',
      header: 'Unit',
      width: '11%',
      align: 'right',
      render: (line) => formatMoney(line.unitPrice, currency),
    },
    {
      key: 'total',
      header: 'Total',
      width: '12%',
      align: 'right',
      render: (line) => <strong>{formatMoney(line.total, currency)}</strong>,
    },
  ];
  const lineColumns: readonly ColumnDefinition<InvoiceLineRecord>[] = isDraft
    ? [
        ...baseColumns,
        {
          key: 'actions',
          header: '',
          label: 'Actions',
          width: '7%',
          render: (line) => (
            <button
              className="icon-button row-hover-action"
              onClick={() => void onDeleteLine(line.id)}
              title="Remove line"
              type="button"
            >
              <IconX size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            </button>
          ),
        },
      ]
    : baseColumns;

  const draftRow: DraftRow<InvoiceLineRecord> | null =
    create.draft !== null
      ? {
          rowKey: '__draft',
          renderCell: (column) => {
            const draft = create.draft;
            if (draft === null) return null;
            if (column.key === 'person') {
              return <span className="employee-secondary">New expense line</span>;
            }
            return column.render(draftAsLine(draft));
          },
        }
      : null;

  const panelOpen = create.draft !== null || (isDraft && selectedLine !== null);
  const closePanel = (): void => {
    if (create.draft !== null) {
      create.discard();
      return;
    }
    setEditingLineId(null);
  };

  if (loadError) {
    return (
      <main className="page-frame">
        <div className="employees-content">
          <p className="auth-error" role="alert">Could not load this invoice.</p>
          <Link className="link-button" to="/billing">Back to billing</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="list-with-panel">
      <div className="page-frame">
        <div className="employees-content">
          <header className="page-header">
            <div>
              <h1 className="page-title">{invoice?.number ?? 'Draft invoice'}</h1>
              <p className="page-subtitle">
                {invoice
                  ? `${invoice.groupName ?? ''} · ${invoice.type} · covers ${MONTH_NAMES[invoice.serviceMonth - 1]} ${invoice.serviceYear} (${invoice.periodStart} → ${invoice.periodEndExclusive})`
                  : ''}
              </p>
            </div>
            <div className="page-actions">
              <button
                className="button button-secondary"
                disabled={loadingPdf || !invoiceId}
                type="button"
                onClick={() => {
                  void downloadDocument(loadInvoicePdf, 'invoicePdf', '');
                }}
              >
                {loadingPdf ? 'Rendering…' : 'Download invoice'}
              </button>
              <button
                className="button button-secondary"
                disabled={loadingAddendum || !invoiceId}
                type="button"
                onClick={() => {
                  void downloadDocument(loadAddendumPdf, 'invoiceAddendumPdf', '-addendum');
                }}
              >
                {loadingAddendum ? 'Rendering…' : 'Download addendum'}
              </button>
              {isDraft ? (
                <button
                  className="button button-primary"
                  disabled={issuing || lines.length === 0}
                  type="button"
                  onClick={() => void run(() => issueInvoice({ variables: { invoiceId } }), 'Invoice issued. It is now locked.')}
                >
                  <IconLock size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  {issuing ? 'Issuing…' : 'Approve & issue'}
                </button>
              ) : null}
              {!isDraft && invoice?.status === 'issued' ? (
                <StatusChip color="blue" label={`Due ${invoice.dueDate ?? '—'}`} />
              ) : null}
              <Link className="button button-secondary" to="/billing">All invoices</Link>
            </div>
          </header>

          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          {message ? <p className="form-success">{message}</p> : null}

          <section className="table-shell" aria-label="Invoice lines">
            <div className="table-title-row">
              <div className="table-title">Lines</div>
              <div className="panel-actions">
                <div className="table-density">
                  {loading
                    ? '…'
                    : `${formatMoney(invoice?.totalAmount ?? 0, currency)} total`}
                </div>
                {isDraft ? (
                  <button className="button button-secondary" type="button" onClick={startCreate}>
                    <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    Add line
                  </button>
                ) : null}
              </div>
            </div>
            <DataTable
              columns={lineColumns}
              draftRow={draftRow}
              emptyState={
                <EmptyState
                  icon={IconFileInvoice}
                  title="No lines yet"
                  description="Add a pass-through line, or regenerate the invoice from the run."
                />
              }
              getRowKey={(line) => line.id}
              loading={loading}
              onRowClick={
                isDraft
                  ? (line) => {
                      if (create.draft !== null) create.discard();
                      setEditingLineId(line.id);
                    }
                  : undefined
              }
              rows={lines}
              selectedRowKey={selectedLine?.id ?? null}
              skeletonRows={3}
            />
          </section>
        </div>

        <aside className="employee-detail-panel compensation-actions-panel" aria-label="Invoice actions">
          <div className="panel-title-row">
            <div>
              <div className="panel-kicker">Finance operations</div>
              <h2 className="panel-title">{invoice?.status === 'paid' ? 'Settled' : isDraft ? 'Draft review' : 'Awaiting payment'}</h2>
            </div>
            {invoice?.status === 'paid' ? <IconCheck size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} /> : <IconLock size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />}
          </div>

          {invoice ? (
            <ul className="field-list">
              <li className="field-row"><span>Status</span><span className="field-value">{invoice.status}</span></li>
              <li className="field-row"><span>Receiver</span><span className="field-value truncate">{invoice.receiverName ?? '—'}</span></li>
              <li className="field-row"><span>Sub-total</span><span className="field-value">{formatMoney(invoice.subTotal, invoice.currency)}</span></li>
              <li className="field-row"><span>Issue date</span><span className="field-value">{invoice.issueDate ?? '—'}</span></li>
              <li className="field-row"><span>Due date</span><span className="field-value">{invoice.dueDate ?? '—'}</span></li>
              {invoice.paymentReference ? (
                <li className="field-row"><span>Payment ref</span><span className="field-value">{invoice.paymentReference}</span></li>
              ) : null}
            </ul>
          ) : null}

          {invoice?.status === 'issued' ? (
            <form
              className="config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => markPaid({ variables: { invoiceId, paymentReference: paymentReference || null } }), 'Marked paid.');
              }}
            >
              <h3 className="section-title">Record settlement</h3>
              <div className="field"><label htmlFor="pay-ref">Payment reference</label>
                <input id="pay-ref" placeholder="Wire / cheque reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
              </div>
              <button className="button button-primary button-full" disabled={paying} type="submit">Mark paid</button>
            </form>
          ) : null}

          {isDraft ? (
            <p className="config-form field-hint">
              Issuing assigns the invoice number and locks it. If something needs fixing
              afterwards, correct it with a follow-up document.
            </p>
          ) : null}
        </aside>
      </div>

      <SidePanel
        isOpen={panelOpen}
        onClose={closePanel}
        title={create.draft !== null ? 'New expense line' : 'Expense line'}
      >
        {create.draft !== null ? (
          <div>
            <FieldGroup title="Line">
              <FieldRow
                alwaysEditing
                label="Description"
                onChange={(value) => create.patchDraft({ description: value })}
                placeholder="Laptop reimbursement"
                type="text"
                value={create.draft.description}
              />
              <FieldRow
                alwaysEditing
                label="Quantity"
                min={0.01}
                onChange={(value) => create.patchDraft({ quantity: value })}
                type="number"
                value={create.draft.quantity}
              />
              <FieldRow
                alwaysEditing
                label="Unit price"
                min={0}
                onChange={(value) => create.patchDraft({ unitPrice: value })}
                required
                type="number"
                value={create.draft.unitPrice}
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
                disabled={!create.canCreate || create.isSaving}
                onClick={() => void create.commit()}
                type="button"
              >
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                {create.isSaving ? 'Adding…' : 'Add line'}
              </button>
              <button className="button button-secondary" onClick={create.discard} type="button">
                Cancel
              </button>
            </div>
          </div>
        ) : selectedLine !== null ? (
          <div>
            <FieldGroup title="Line">
              <FieldRow
                label="Description"
                onCommit={(value) =>
                  void commitLineField(selectedLine.id, 'description', value)
                }
                type="text"
                value={selectedLine.description}
              />
              <FieldRow
                label="Quantity"
                min={0.01}
                onCommit={(value) => void commitLineField(selectedLine.id, 'quantity', value)}
                type="number"
                value={String(selectedLine.quantity)}
              />
              <FieldRow
                display={formatMoney(selectedLine.unitPrice, currency)}
                label="Unit price"
                min={0}
                onCommit={(value) => void commitLineField(selectedLine.id, 'unitPrice', value)}
                type="number"
                value={String(selectedLine.unitPrice)}
              />
              <div className="record-field">
                <span className="record-field-label">Total</span>
                <span className="record-field-value">
                  <span className="record-field-static">
                    {formatMoney(selectedLine.total, currency)}
                  </span>
                </span>
              </div>
            </FieldGroup>
            <div className="record-panel-actions">
              <button
                className="button button-secondary"
                onClick={() => void onDeleteLine(selectedLine.id)}
                type="button"
              >
                <IconX size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Delete line
              </button>
            </div>
          </div>
        ) : null}
      </SidePanel>
    </main>
  );
};
