import { useMutation, useQuery } from '@apollo/client';
import { useState, type FormEvent } from 'react';

import { OnboardingCard } from '../../../components/onboarding/OnboardingFlow';
import {
  MY_BANK_DETAILS_QUERY,
  REQUEST_MY_BANK_CHANGE_MUTATION,
} from '../graphql/self-service.operations';

type BankDetailsData = {
  readonly myBankDetails: {
    readonly bankName: string | null;
    readonly bankAccountTitle: string | null;
    readonly bankAccountNumber: string | null;
    readonly bankIban: string | null;
  } | null;
  readonly myBankDetailChangeRequests: readonly {
    readonly id: string;
    readonly status: string;
    readonly createdAt: string;
    readonly decisionNote: string | null;
  }[];
};

const EMPTY = { bankName: '', bankAccountTitle: '', bankAccountNumber: '', bankIban: '' };

// The account their money goes to, plus a request (not a direct edit) to change
// it — a payment instruction HR must approve (plan Phase 4 #26).
export const BankDetailsCard = () => {
  const { data, refetch } = useQuery<BankDetailsData>(MY_BANK_DETAILS_QUERY);
  const [requestChange, { loading }] = useMutation(REQUEST_MY_BANK_CHANGE_MUTATION);
  const [form, setForm] = useState(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const details = data?.myBankDetails ?? null;
  const pending = (data?.myBankDetailChangeRequests ?? []).find(
    (request) => request.status === 'pending',
  );
  const setField = (key: keyof typeof EMPTY, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await requestChange({ variables: { input: form } });
      await refetch();
      setForm(EMPTY);
      setNotice('Change requested — HR will review it.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the request.');
    }
  };

  return (
    <OnboardingCard
      note="Your salary is paid to this account. Changes must be approved by HR."
      title="Bank details"
    >
      <div className="field-list">
        <div className="field-row">
          <span className="field-label">Bank</span>
          <span className="field-value">{details?.bankName ?? 'Not set'}</span>
        </div>
        <div className="field-row">
          <span className="field-label">Account title</span>
          <span className="field-value">{details?.bankAccountTitle ?? 'Not set'}</span>
        </div>
        <div className="field-row">
          <span className="field-label">Account number</span>
          <span className="field-value">{details?.bankAccountNumber ?? 'Not set'}</span>
        </div>
        <div className="field-row">
          <span className="field-label">IBAN</span>
          <span className="field-value">{details?.bankIban ?? 'Not set'}</span>
        </div>
        {pending ? (
          <p className="field-hint-warning">
            A change request is awaiting HR review.
          </p>
        ) : null}
      </div>

      {!pending ? (
        <form className="config-form compact-form" onSubmit={onSubmit}>
          <h3 className="section-title">Request a change</h3>
          <p className="field-hint">
            Fill in the fields that should change; HR approves before it takes effect.
          </p>
          <div className="field">
            <label htmlFor="bank-name">Bank</label>
            <input id="bank-name" value={form.bankName} onChange={(e) => setField('bankName', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bank-title">Account title</label>
            <input id="bank-title" value={form.bankAccountTitle} onChange={(e) => setField('bankAccountTitle', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bank-account">Account number</label>
            <input id="bank-account" value={form.bankAccountNumber} onChange={(e) => setField('bankAccountNumber', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bank-iban">IBAN</label>
            <input id="bank-iban" value={form.bankIban} onChange={(e) => setField('bankIban', e.target.value)} />
          </div>
          <button className="button button-secondary button-full" disabled={loading} type="submit">
            {loading ? 'Submitting…' : 'Request change'}
          </button>
          {notice ? <p className="form-success">{notice}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
        </form>
      ) : null}
    </OnboardingCard>
  );
};
