import { useMutation, useQuery } from '@apollo/client';
import type { MainColorName } from '@hrms/ui';
import { IconPlus, IconReceipt, IconTrash } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';

import { uploadToSignedUrl } from '../../../app/upload';
import { StatusChip } from '../../../components/chip/StatusChip';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import { useTheme } from '../../../providers/theme/useTheme';
import {
  ADD_MY_EXPENSE_CLAIM_LINE_MUTATION,
  CREATE_MY_EXPENSE_CLAIM_MUTATION,
  MY_EXPENSE_CATEGORIES_QUERY,
  MY_EXPENSE_CLAIMS_QUERY,
  PREPARE_EXPENSE_RECEIPT_UPLOAD_MUTATION,
  REMOVE_MY_EXPENSE_CLAIM_LINE_MUTATION,
  SUBMIT_MY_EXPENSE_CLAIM_MUTATION,
} from '../graphql/expense.operations';

type MyExpenseLine = {
  readonly id: string;
  readonly categoryName: string | null;
  readonly expenseDate: string;
  readonly description: string;
  readonly amount: number;
  readonly hasReceipt: boolean;
};

type MyExpenseClaim = {
  readonly id: string;
  readonly claimNumber: string | null;
  readonly purpose: string;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: number;
  readonly submittedAt: string | null;
  readonly lines: readonly MyExpenseLine[];
};

type ExpenseCategoryOption = {
  readonly id: string;
  readonly name: string;
  readonly requiresReceipt: boolean;
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

// The employee's own expense claims on their workspace home: the last few plus
// the filing flow (draft → lines with receipts → submit).
export const MyExpensesSection = () => {
  const { theme } = useTheme();
  const { data, loading, refetch } = useQuery<{ readonly myExpenseClaims: readonly MyExpenseClaim[] }>(
    MY_EXPENSE_CLAIMS_QUERY,
  );
  const { data: categoryData } = useQuery<{ readonly myExpenseCategories: readonly ExpenseCategoryOption[] }>(
    MY_EXPENSE_CATEGORIES_QUERY,
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [draftClaimId, setDraftClaimId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createClaim, { loading: creating }] = useMutation(CREATE_MY_EXPENSE_CLAIM_MUTATION);
  const [addLine, { loading: adding }] = useMutation(ADD_MY_EXPENSE_CLAIM_LINE_MUTATION);
  const [removeLine] = useMutation(REMOVE_MY_EXPENSE_CLAIM_LINE_MUTATION);
  const [submitClaim, { loading: submitting }] = useMutation(SUBMIT_MY_EXPENSE_CLAIM_MUTATION);
  const [prepareUpload] = useMutation(PREPARE_EXPENSE_RECEIPT_UPLOAD_MUTATION);

  const claims = data?.myExpenseClaims ?? [];
  const categories = categoryData?.myExpenseCategories ?? [];
  const draft = claims.find((claim) => claim.id === draftClaimId) ?? null;
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;

  const resetLineEntry = (): void => {
    setCategoryId('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setAmount('');
    setReceiptFile(null);
  };

  const openNew = (): void => {
    resetLineEntry();
    setDraftClaimId(null);
    setPurpose('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setPanelOpen(true);
  };

  const openDraft = (claim: MyExpenseClaim): void => {
    if (claim.status !== 'draft') return;
    resetLineEntry();
    setDraftClaimId(claim.id);
    setPurpose(claim.purpose);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPanelOpen(true);
  };

  const onCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      const created = await createClaim({
        variables: { input: { purpose: purpose.trim(), currency: 'PKR' } },
      });
      await refetch();
      setDraftClaimId(created.data.createMyExpenseClaim.id);
      setPurpose(created.data.createMyExpenseClaim.purpose);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not create the claim.');
    }
  };

  const onAddLine = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!draftClaimId) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      let receipt:
        | { storageKey: string; fileName: string; contentType: string; sizeBytes: number }
        | null = null;
      if (receiptFile) {
        const prepared = await prepareUpload({
          variables: {
            input: { fileName: receiptFile.name, contentType: receiptFile.type || 'application/octet-stream' },
          },
        });
        const access = prepared.data.prepareMyExpenseReceiptUpload;
        await uploadToSignedUrl(access, receiptFile);
        receipt = {
          storageKey: access.storageKey,
          fileName: receiptFile.name,
          contentType: receiptFile.type || 'application/octet-stream',
          sizeBytes: receiptFile.size,
        };
      }
      await addLine({
        variables: {
          claimId: draftClaimId,
          input: {
            categoryId,
            expenseDate,
            description: description.trim(),
            amount: Number(amount),
            receipt,
          },
        },
      });
      await refetch();
      setDescription('');
      setAmount('');
      setReceiptFile(null);
      setSuccessMessage('Line added.');
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not add the line.');
    }
  };

  const onRemoveLine = async (lineId: string): Promise<void> => {
    if (!draftClaimId) return;
    setErrorMessage(null);
    try {
      await removeLine({ variables: { lineId, claimId: draftClaimId } });
      await refetch();
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not remove the line.');
    }
  };

  const onSubmit = async (): Promise<void> => {
    if (!draftClaimId) return;
    setErrorMessage(null);
    try {
      await submitClaim({ variables: { claimId: draftClaimId } });
      await refetch();
      setSuccessMessage('Claim submitted for approval.');
      setDraftClaimId(null);
      setPanelOpen(false);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not submit the claim.');
    }
  };

  return (
    <section className="me-section">
      <div className="me-section-head">
        <h2 className="me-section-title">My expenses</h2>
        <button className="button button-secondary button-sm" type="button" onClick={openNew}>
          <IconPlus size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          New claim
        </button>
      </div>
      <div className="stack-list stack-card">
        {loading ? <div className="table-empty">Loading…</div> : null}
        {!loading && claims.length === 0 ? (
          <div className="table-empty">No claims yet — file one for approval and reimbursement.</div>
        ) : null}
        {claims.slice(0, 4).map((claim) => (
          <div
            className={`stack-row ${claim.status === 'draft' ? 'stack-row-clickable' : ''}`}
            key={claim.id}
            onClick={() => openDraft(claim)}
            role={claim.status === 'draft' ? 'button' : undefined}
            tabIndex={claim.status === 'draft' ? 0 : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Enter') openDraft(claim);
            }}
          >
            <div className="stack-row-copy">
              <div className="employee-primary">
                {claim.claimNumber ?? 'Draft'} · {claim.purpose}
              </div>
              <div className="employee-secondary">
                {claim.submittedAt ? claim.submittedAt.slice(0, 10) : 'Not submitted'} ·{' '}
                {formatMoney(claim.totalAmount, claim.currency)}
              </div>
            </div>
            <StatusChip
              color={STATUS_COLORS[claim.status] ?? 'gray'}
              label={STATUS_LABELS[claim.status] ?? claim.status}
            />
          </div>
        ))}
      </div>

      <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} title="Expense claim">
        <section className="self-service-section">
          {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="form-success" role="status">
              {successMessage}
            </p>
          ) : null}

          {!draftClaimId ? (
            <form className="config-form" onSubmit={(event) => void onCreate(event)}>
              <div className="field">
                <label htmlFor="claim-purpose">What is this claim for?</label>
                <input
                  id="claim-purpose"
                  placeholder="Client visit, home office, …"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </div>
              <button
                className="button button-primary button-full"
                disabled={creating || purpose.trim().length < 3}
                type="submit"
              >
                {creating ? 'Creating…' : 'Start a claim'}
              </button>
            </form>
          ) : (
            <>
              <div className="panel-title-row">
                <div>
                  <div className="panel-kicker">Draft</div>
                  <h2 className="panel-title">{purpose}</h2>
                </div>
                <IconReceipt size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
              </div>

              <div className="stack-list stack-card">
                {(draft?.lines ?? []).map((line) => (
                  <div className="stack-row" key={line.id}>
                    <div className="stack-row-copy">
                      <div className="employee-primary">{line.description}</div>
                      <div className="employee-secondary">
                        {line.categoryName ?? 'Expense'} · {line.expenseDate}
                        {line.hasReceipt ? ' · receipt attached' : ''}
                      </div>
                    </div>
                    <div className="record-inline-actions">
                      <span>{formatMoney(line.amount, 'PKR')}</span>
                      <button
                        aria-label="Remove line"
                        className="icon-button"
                        type="button"
                        onClick={() => void onRemoveLine(line.id)}
                      >
                        <IconTrash size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                      </button>
                    </div>
                  </div>
                ))}
                {(draft?.lines ?? []).length === 0 ? (
                  <div className="table-empty">Add the first line below.</div>
                ) : null}
              </div>

              <form className="config-form" onSubmit={(event) => void onAddLine(event)}>
                <div className="field">
                  <label htmlFor="claim-line-category">Category</label>
                  <select
                    id="claim-line-category"
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">Choose a category…</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.requiresReceipt ? ' (receipt required)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="claim-line-date">Date</label>
                    <input
                      id="claim-line-date"
                      type="date"
                      value={expenseDate}
                      onChange={(event) => setExpenseDate(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="claim-line-amount">Amount (PKR)</label>
                    <input
                      id="claim-line-amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="claim-line-description">Description</label>
                  <input
                    id="claim-line-description"
                    placeholder="Taxi to client site"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="claim-line-receipt">
                    Receipt {selectedCategory?.requiresReceipt ? '(required)' : '(optional)'}
                  </label>
                  <input
                    id="claim-line-receipt"
                    type="file"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <button
                  className="button button-secondary button-full"
                  disabled={
                    adding ||
                    !categoryId ||
                    description.trim().length === 0 ||
                    !Number.isFinite(Number(amount)) ||
                    Number(amount) <= 0 ||
                    (selectedCategory?.requiresReceipt === true && receiptFile === null)
                  }
                  type="submit"
                >
                  {adding ? 'Adding…' : 'Add line'}
                </button>
              </form>

              <button
                className="button button-primary button-full"
                disabled={submitting || (draft?.lines ?? []).length === 0}
                type="button"
                onClick={() => void onSubmit()}
              >
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </>
          )}
        </section>
      </SidePanel>
    </section>
  );
};
