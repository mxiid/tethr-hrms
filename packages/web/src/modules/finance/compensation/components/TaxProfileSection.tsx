import { useMutation, useQuery } from '@apollo/client';
import { IconPencil } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';

import { Modal } from '../../../../components/modal/Modal';
import { useTheme } from '../../../../providers/theme/useTheme';
import { useAuth } from '../../../auth/hooks/useAuth';
import {
  EMPLOYEE_TAX_PROFILE_QUERY,
  EMPLOYEE_TAX_PROFILES_QUERY,
  SET_EMPLOYEE_TAX_PROFILE_MUTATION,
} from '../graphql/compensation.operations';

type TaxProfileRecord = {
  readonly id: string;
  readonly filerStatus: string;
  readonly monthlyExemptionAmount: number;
  readonly annualTaxCreditAmount: number;
  readonly priorAnnualIncome: number;
  readonly fixedMonthlyWithholding: number | null;
  readonly note: string | null;
  readonly validFrom: string;
  readonly validTo: string | null;
};

const formatAmount = (value: number): string =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 0, style: 'currency', currency: 'PKR' }).format(
    value,
  );

const formatPeriod = (profile: TaxProfileRecord): string =>
  `${profile.validFrom} → ${profile.validTo ?? 'open'}`;

// The employee's effective-dated withholding facts, on the Job & Pay tab:
// what payroll will apply and the history of changes. Roles holding
// compensation:write (admin/HR/client-admin) can set a new profile from a
// chosen effective date; finance reads but does not write compensation.
export const TaxProfileSection = ({ employeeId }: { readonly employeeId: string }) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canEdit =
    user?.roleKeys.includes('tethrAdmin') === true ||
    user?.roleKeys.includes('tethrHr') === true ||
    user?.roleKeys.includes('clientAdmin') === true;

  const current = useQuery<{ readonly employeeTaxProfile: TaxProfileRecord | null }>(
    EMPLOYEE_TAX_PROFILE_QUERY,
    { variables: { employeeId } },
  );
  const history = useQuery<{ readonly employeeTaxProfiles: readonly TaxProfileRecord[] }>(
    EMPLOYEE_TAX_PROFILES_QUERY,
    { variables: { employeeId } },
  );
  const [saveProfile, { loading: saving }] = useMutation(SET_EMPLOYEE_TAX_PROFILE_MUTATION);

  const [modalOpen, setModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filerStatus, setFilerStatus] = useState<'filer' | 'nonFiler'>('filer');
  const [exemption, setExemption] = useState('');
  const [priorIncome, setPriorIncome] = useState('');
  const [credit, setCredit] = useState('');
  const [fixed, setFixed] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const profile = current.data?.employeeTaxProfile ?? null;
  const profiles = history.data?.employeeTaxProfiles ?? [];

  const openEditor = (): void => {
    setErrorMessage(null);
    setFilerStatus((profile?.filerStatus as 'filer' | 'nonFiler') ?? 'filer');
    setExemption(profile ? String(profile.monthlyExemptionAmount) : '');
    setPriorIncome(profile ? String(profile.priorAnnualIncome) : '');
    setCredit(profile ? String(profile.annualTaxCreditAmount) : '');
    setFixed(profile?.fixedMonthlyWithholding != null ? String(profile.fixedMonthlyWithholding) : '');
    setNote(profile?.note ?? '');
    setModalOpen(true);
  };

  const onSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      await saveProfile({
        variables: {
          input: {
            employeeId,
            effectiveDate,
            filerStatus,
            monthlyExemptionAmount: exemption.trim() === '' ? 0 : Number(exemption),
            priorAnnualIncome: priorIncome.trim() === '' ? 0 : Number(priorIncome),
            annualTaxCreditAmount: credit.trim() === '' ? 0 : Number(credit),
            fixedMonthlyWithholding: fixed.trim() === '' ? null : Number(fixed),
            note: note.trim() || null,
          },
        },
      });
      await Promise.all([current.refetch(), history.refetch()]);
      setModalOpen(false);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not save the tax profile.');
    }
  };

  return (
    <>
      <section className="table-shell" aria-label="Tax profile">
        <div className="table-title-row">
          <div className="table-title">Tax profile</div>
          <div className="panel-actions">
            {canEdit ? (
              <button className="button button-secondary" type="button" onClick={openEditor}>
                <IconPencil size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                {profile ? 'Update profile' : 'Set profile'}
              </button>
            ) : null}
          </div>
        </div>

        {profile ? (
          <div className="field-list">
            <div className="field-row">
              <span className="field-label">Status</span>
              <span className="field-value">
                {profile.filerStatus === 'nonFiler' ? 'Non-filer' : 'Filer'} · {formatPeriod(profile)}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Monthly exemption</span>
              <span className="field-value">{formatAmount(profile.monthlyExemptionAmount)}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Prior income (year)</span>
              <span className="field-value">{formatAmount(profile.priorAnnualIncome)}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Annual tax credit</span>
              <span className="field-value">{formatAmount(profile.annualTaxCreditAmount)}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Fixed monthly withholding</span>
              <span className="field-value">
                {profile.fixedMonthlyWithholding === null
                  ? 'Computed from the ladder'
                  : formatAmount(profile.fixedMonthlyWithholding)}
              </span>
            </div>
            {profile.note ? (
              <div className="field-row">
                <span className="field-label">Note</span>
                <span className="field-value">{profile.note}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="field-hint">
            No tax profile — withholding uses the tenant slab ladder only.
          </p>
        )}

        {profiles.filter((row) => row.id !== profile?.id).length > 0 ? (
          <ul className="record-list">
            {profiles
              .filter((row) => row.id !== profile?.id)
              .map((row) => (
                <li className="record-item" key={row.id}>
                  <span>
                    <strong>{formatPeriod(row)}</strong>
                    <span className="employee-secondary">
                      {' '}
                      · exemption {formatAmount(row.monthlyExemptionAmount)} · prior{' '}
                      {formatAmount(row.priorAnnualIncome)} · credit{' '}
                      {formatAmount(row.annualTaxCreditAmount)}
                    </span>
                  </span>
                  <span className="employee-secondary">
                    {row.fixedMonthlyWithholding === null
                      ? 'ladder'
                      : `fixed ${formatAmount(row.fixedMonthlyWithholding)}`}
                  </span>
                </li>
              ))}
          </ul>
        ) : null}
      </section>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tax profile"
        width="sm"
      >
        {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
        <form className="config-form" onSubmit={(event) => void onSave(event)}>
          <div className="field">
            <label htmlFor="tax-effective-date">Effective from</label>
            <input
              id="tax-effective-date"
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-filer-status">Filer status</label>
            <select
              id="tax-filer-status"
              value={filerStatus}
              onChange={(event) => setFilerStatus(event.target.value as 'filer' | 'nonFiler')}
            >
              <option value="filer">Filer</option>
              <option value="nonFiler">Non-filer</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tax-exemption">Monthly exemption (PKR)</label>
            <input
              id="tax-exemption"
              inputMode="decimal"
              placeholder="0"
              value={exemption}
              onChange={(event) => setExemption(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-prior-income">Prior income this year (PKR)</label>
            <input
              id="tax-prior-income"
              inputMode="decimal"
              placeholder="0"
              value={priorIncome}
              onChange={(event) => setPriorIncome(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-credit">Annual tax credit (PKR)</label>
            <input
              id="tax-credit"
              inputMode="decimal"
              placeholder="0"
              value={credit}
              onChange={(event) => setCredit(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-fixed">Fixed monthly withholding (blank = ladder)</label>
            <input
              id="tax-fixed"
              inputMode="decimal"
              placeholder="Computed from the ladder"
              value={fixed}
              onChange={(event) => setFixed(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-note">Note</label>
            <input
              id="tax-note"
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <button className="button button-primary button-full" disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </Modal>
    </>
  );
};
