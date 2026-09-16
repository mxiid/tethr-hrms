import { useMutation, useQuery } from '@apollo/client';
import { IconPlus } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { Modal } from '../../../components/modal/Modal';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  BENEFIT_ENROLLMENTS_QUERY,
  BENEFIT_PLANS_QUERY,
  END_BENEFIT_ENROLLMENT_MUTATION,
  SET_BENEFIT_ENROLLMENT_MUTATION,
} from '../graphql/benefit.operations';

type BenefitPlanRecord = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly employeeContributionAmount: number;
  readonly employerContributionAmount: number;
  readonly reducesTaxable: boolean;
  readonly isActive: boolean;
};

type BenefitEnrollmentRecord = {
  readonly id: string;
  readonly planId: string;
  readonly planCode: string | null;
  readonly planName: string | null;
  readonly employeeContributionAmount: number;
  readonly employerContributionAmount: number;
  readonly reducesTaxable: boolean;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly note: string | null;
};

const formatMoney = (amount: number): string =>
  new Intl.NumberFormat('en', { currency: 'PKR', maximumFractionDigits: 0, style: 'currency' }).format(
    amount,
  );

// The employee's benefit enrollments on the Job & Pay tab: what payroll bills
// each month, when it started, and (for open ones) how to end it.
export const BenefitEnrollmentsSection = ({ employeeId }: { readonly employeeId: string }) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canManage =
    user?.roleKeys.includes('tethrAdmin') === true ||
    user?.roleKeys.includes('tethrHr') === true ||
    user?.roleKeys.includes('clientAdmin') === true;

  const enrollments = useQuery<{
    readonly benefitEnrollments: readonly BenefitEnrollmentRecord[];
  }>(BENEFIT_ENROLLMENTS_QUERY, { variables: { employeeId } });
  const plans = useQuery<{ readonly benefitPlans: readonly BenefitPlanRecord[] }>(BENEFIT_PLANS_QUERY, {
    skip: !canManage,
  });
  const [setEnrollment, { loading: saving }] = useMutation(SET_BENEFIT_ENROLLMENT_MUTATION);
  const [endEnrollment] = useMutation(END_BENEFIT_ENROLLMENT_MUTATION);

  const [modalOpen, setModalOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rows = enrollments.data?.benefitEnrollments ?? [];
  const activePlans = (plans.data?.benefitPlans ?? []).filter((plan) => plan.isActive);

  const onEnroll = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      await setEnrollment({
        variables: { input: { employeeId, planId, effectiveDate, note: note.trim() || null } },
      });
      await enrollments.refetch();
      setModalOpen(false);
      setNote('');
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not enroll in the plan.');
    }
  };

  const onEnd = async (row: BenefitEnrollmentRecord): Promise<void> => {
    setErrorMessage(null);
    try {
      await endEnrollment({
        variables: { employeeId, planId: row.planId, endDate: new Date().toISOString().slice(0, 10) },
      });
      await enrollments.refetch();
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not end the enrollment.');
    }
  };

  return (
    <>
      <section className="table-shell" aria-labelledby="benefit-enrollments-title">
        <div className="table-title-row">
          <div className="table-title" id="benefit-enrollments-title">
            Benefits
          </div>
          <div className="panel-actions">
            {canManage ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setPlanId('');
                  setEffectiveDate(new Date().toISOString().slice(0, 10));
                  setModalOpen(true);
                }}
              >
                <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Enroll
              </button>
            ) : null}
          </div>
        </div>

        {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}

        {rows.length === 0 ? (
          <p className="field-hint">
            No benefit enrollments — payroll bills nothing for benefits.
          </p>
        ) : (
          <ul className="record-list">
            {rows.map((row) => (
              <li className="record-item" key={row.id}>
                <span>
                  <strong>{row.planName ?? 'Benefit'}</strong>
                  <span className="employee-secondary">
                    {' '}
                    · employee {formatMoney(row.employeeContributionAmount)} · employer{' '}
                    {formatMoney(row.employerContributionAmount)}
                    {row.reducesTaxable ? ' · pre-tax' : ''}
                  </span>
                  <span className="employee-secondary">
                    {' '}
                    from {row.validFrom}
                    {row.validTo ? ` to ${row.validTo}` : ''}
                  </span>
                </span>
                <span className="record-inline-actions">
                  {row.validTo === null ? (
                    <>
                      <StatusChip color="green" label="Active" />
                      {canManage ? (
                        <button
                          className="button button-secondary button-sm"
                          type="button"
                          onClick={() => void onEnd(row)}
                        >
                          End
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <StatusChip color="gray" label="Ended" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Enroll in a benefit plan"
        width="sm"
      >
        {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
        <form className="config-form" onSubmit={(event) => void onEnroll(event)}>
          <div className="field">
            <label htmlFor="enrollment-plan">Plan</label>
            <select
              id="enrollment-plan"
              name="enrollment-plan"
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
            >
              <option value="">Choose a plan…</option>
              {activePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · employee {formatMoney(plan.employeeContributionAmount)} / employer{' '}
                  {formatMoney(plan.employerContributionAmount)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="enrollment-date">Effective from</label>
            <input
              id="enrollment-date"
              name="enrollment-date"
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="enrollment-note">Note</label>
            <input
              id="enrollment-note"
              maxLength={300}
              name="enrollment-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <button
            className="button button-primary button-full"
            disabled={saving || planId.length === 0}
            type="submit"
          >
            {saving ? 'Saving…' : 'Enroll'}
          </button>
        </form>
      </Modal>
    </>
  );
};
