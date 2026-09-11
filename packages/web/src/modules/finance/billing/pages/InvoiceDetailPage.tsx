import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { IconCheck, IconLock } from '@tabler/icons-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { downloadBase64File } from '../../../../app/download';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  ADD_INVOICE_LINE_MUTATION,
  INVOICE_DETAIL_QUERY,
  INVOICE_ADDENDUM_PDF_QUERY,
  INVOICE_PDF_QUERY,
  ISSUE_INVOICE_MUTATION,
  MARK_INVOICE_PAID_MUTATION,
  REMOVE_INVOICE_LINE_MUTATION,
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', { currency, style: 'currency' }).format(amount);

export const InvoiceDetailPage = () => {
  const { theme } = useTheme();
  const invoiceId = useParams<{ invoiceId: string }>().invoiceId ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
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

  const [addLine, { loading: adding }] = useMutation(ADD_INVOICE_LINE_MUTATION);
  const [removeLine] = useMutation(REMOVE_INVOICE_LINE_MUTATION);
  const [issueInvoice, { loading: issuing }] = useMutation(ISSUE_INVOICE_MUTATION);
  const [markPaid, { loading: paying }] = useMutation(MARK_INVOICE_PAID_MUTATION);

  const run = async (action: () => Promise<unknown>, successMessage?: string): Promise<void> => {
    setError(null);
    setMessage(null);
    try {
      await action();
      await refetch();
      if (successMessage) setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed.');
    }
  };

  const onAddLine = (event: FormEvent): void => {
    event.preventDefault();
    if (newAmount === '') return;
    void run(
      () =>
        addLine({
          variables: {
            input: {
              invoiceId,
              ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
              unitPrice: Number(newAmount),
            },
          },
        }),
      'Line added.',
    ).then(() => {
      setNewDescription('');
      setNewAmount('');
    });
  };

  const invoice = data?.invoice;
  const lines = invoice?.lines ?? [];
  const isDraft = invoice?.status === 'draft';

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
    <main className="page-frame">
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
                onClick={() => void run(() => issueInvoice({ variables: { invoiceId } }), 'Invoice issued — the document is now immutable.')}
              >
                <IconLock size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                {issuing ? 'Issuing…' : 'Approve & issue'}
              </button>
            ) : null}
            {!isDraft && invoice?.status === 'issued' ? (
              <span className="chip" style={{ '--chip-color': 'var(--hrms-color-tag-blue)' } as CSSProperties}>
                <span className="chip-dot" />
                {`Due ${invoice.dueDate ?? '—'}`}
              </span>
            ) : null}
            <Link className="button button-secondary" to="/billing">All invoices</Link>
          </div>
        </header>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <section className="table-shell" aria-labelledby="lines-title">
          <div className="table-title-row">
            <div className="table-title" id="lines-title">Lines</div>
            <div className="table-density">
              {loading ? 'Loading…' : `${invoice?.totalAmount ? formatMoney(invoice.totalAmount, invoice.currency) + ' total' : ''}`}
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Person / Item</th><th>Month</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th>{isDraft ? <th aria-label="Actions" /> : null}</tr>
              </thead>
              <tbody>
                {lines.length === 0 && !loading ? (
                  <tr><td colSpan={isDraft ? 7 : 6}>No lines yet.</td></tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        {line.employeeId ? (
                          <Link className="table-link" to={`/employees/${line.employeeId}`}>
                            {line.employeeName ?? '—'}
                          </Link>
                        ) : (
                          <span className="employee-primary">{line.employeeName ?? '—'}</span>
                        )}
                      </td>
                      <td>{line.monthLabel ?? '—'}</td>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>{formatMoney(line.unitPrice, invoice?.currency ?? 'USD')}</td>
                      <td><strong>{formatMoney(line.total, invoice?.currency ?? 'USD')}</strong></td>
                      {isDraft ? (
                        <td>
                          <button
                            className="icon-button"
                            title="Remove line"
                            type="button"
                            onClick={() => void run(() => removeLine({ variables: { lineId: line.id, invoiceId } }), 'Line removed.')}
                          >
                            ✕
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {isDraft ? (
          <form className="table-shell config-form" onSubmit={onAddLine}>
            <h3 className="section-title">Add pass-through line</h3>
            <div className="field-row">
              <div className="field"><label htmlFor="line-desc">Description</label>
                <input id="line-desc" placeholder="Laptop Reimbursement (Waheed Ali)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
              </div>
              <div className="field"><label htmlFor="line-amount">Amount (USD)</label>
                <input id="line-amount" min={0} required step="0.01" type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
              </div>
            </div>
            <button className="button button-secondary" disabled={adding} type="submit">Add line</button>
            <p className="field-hint">Quantity defaults to 1 — adjust per line afterwards while still draft.</p>
          </form>
        ) : null}
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
            Issuing assigns the document number ({invoice?.groupName ?? ''}), freezes every line,
            and notifies downstream systems. Corrections after that ride a later credit.
          </p>
        ) : null}
      </aside>
    </main>
  );
};



