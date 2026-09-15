import { useMutation, useQuery } from '@apollo/client';
import { IconHeartHandshake, IconPlus } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';

import { EmptyState } from '../../../components/empty-state/EmptyState';
import { Modal } from '../../../components/modal/Modal';
import { SkeletonRows } from '../../../components/skeleton/Skeleton';
import { useTheme } from '../../../providers/theme/useTheme';
import {
  BENEFIT_PLANS_QUERY,
  CREATE_BENEFIT_PLAN_MUTATION,
  UPDATE_BENEFIT_PLAN_MUTATION,
} from '../graphql/benefit.operations';

type BenefitPlanRecord = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly employeeContributionAmount: number;
  readonly employerContributionAmount: number;
  readonly reducesTaxable: boolean;
  readonly isActive: boolean;
};

const formatMoney = (amount: number): string =>
  new Intl.NumberFormat('en', { currency: 'PKR', maximumFractionDigits: 0, style: 'currency' }).format(
    amount,
  );

// Benefit plans are config-as-data: finance defines what employees can enroll
// in, what each side pays per month, and whether the employee share is pre-tax.
export const BenefitPlansPanel = () => {
  const { theme } = useTheme();
  const { data, loading, refetch } = useQuery<{ readonly benefitPlans: readonly BenefitPlanRecord[] }>(
    BENEFIT_PLANS_QUERY,
  );
  const [createPlan, { loading: creating }] = useMutation(CREATE_BENEFIT_PLAN_MUTATION);
  const [updatePlan, { loading: updating }] = useMutation(UPDATE_BENEFIT_PLAN_MUTATION);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BenefitPlanRecord | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [employeeAmount, setEmployeeAmount] = useState('');
  const [employerAmount, setEmployerAmount] = useState('');
  const [reducesTaxable, setReducesTaxable] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const plans = data?.benefitPlans ?? [];

  const openCreate = (): void => {
    setEditing(null);
    setCode('');
    setName('');
    setEmployeeAmount('');
    setEmployerAmount('');
    setReducesTaxable(false);
    setIsActive(true);
    setErrorMessage(null);
    setModalOpen(true);
  };

  const openEdit = (plan: BenefitPlanRecord): void => {
    setEditing(plan);
    setCode(plan.code);
    setName(plan.name);
    setEmployeeAmount(String(plan.employeeContributionAmount));
    setEmployerAmount(String(plan.employerContributionAmount));
    setReducesTaxable(plan.reducesTaxable);
    setIsActive(plan.isActive);
    setErrorMessage(null);
    setModalOpen(true);
  };

  const onSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      if (editing) {
        await updatePlan({
          variables: {
            input: {
              planId: editing.id,
              name: name.trim(),
              employeeContributionAmount: Number(employeeAmount || 0),
              employerContributionAmount: Number(employerAmount || 0),
              reducesTaxable,
              isActive,
            },
          },
        });
      } else {
        await createPlan({
          variables: {
            input: {
              code: code.trim(),
              name: name.trim(),
              employeeContributionAmount: Number(employeeAmount || 0),
              employerContributionAmount: Number(employerAmount || 0),
              reducesTaxable,
            },
          },
        });
      }
      await refetch();
      setModalOpen(false);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not save the plan.');
    }
  };

  return (
    <>
      <section className="table-shell" aria-labelledby="benefit-plans-title">
        <div className="table-title-row">
          <div className="table-title" id="benefit-plans-title">
            Benefit plans
          </div>
          <div className="panel-actions">
            <div className="table-density">
              {loading ? '…' : `${plans.length} plan${plans.length === 1 ? '' : 's'}`}
            </div>
            <button className="button button-secondary" type="button" onClick={openCreate}>
              <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              New plan
            </button>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Employee / month</th>
                <th>Employer / month</th>
                <th>Pre-tax</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows columnCount={5} rows={3} /> : null}
              {!loading && plans.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={5}>
                    <EmptyState
                      icon={IconHeartHandshake}
                      title="No benefit plans yet"
                      description="Add the plans employees can enroll in; payroll bills their shares each run."
                      action={
                        <button className="button button-secondary" type="button" onClick={openCreate}>
                          <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                          New plan
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : null}
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td data-label="Plan">
                    <button
                      className="table-link"
                      type="button"
                      onClick={() => openEdit(plan)}
                    >
                      {plan.name}
                    </button>
                    <span className="employee-secondary"> · {plan.code}</span>
                  </td>
                  <td data-label="Employee / month">{formatMoney(plan.employeeContributionAmount)}</td>
                  <td data-label="Employer / month">{formatMoney(plan.employerContributionAmount)}</td>
                  <td data-label="Pre-tax">{plan.reducesTaxable ? 'Yes' : 'No'}</td>
                  <td data-label="Status">{plan.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit benefit plan' : 'New benefit plan'}
        width="sm"
      >
        {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
        <form className="config-form" onSubmit={(event) => void onSave(event)}>
          {!editing ? (
            <div className="field">
              <label htmlFor="benefit-code">Code</label>
              <input
                id="benefit-code"
                maxLength={32}
                placeholder="HEALTH"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="benefit-name">Name</label>
            <input
              id="benefit-name"
              maxLength={120}
              placeholder="Health insurance"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="benefit-employee">Employee / month (PKR)</label>
              <input
                id="benefit-employee"
                inputMode="decimal"
                placeholder="0"
                value={employeeAmount}
                onChange={(event) => setEmployeeAmount(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="benefit-employer">Employer / month (PKR)</label>
              <input
                id="benefit-employer"
                inputMode="decimal"
                placeholder="0"
                value={employerAmount}
                onChange={(event) => setEmployerAmount(event.target.value)}
              />
            </div>
          </div>
          <label className="field field-checkbox">
            <input
              checked={reducesTaxable}
              type="checkbox"
              onChange={(event) => setReducesTaxable(event.target.checked)}
            />
            Employee share is pre-tax (reduces withholding)
          </label>
          {editing ? (
            <label className="field field-checkbox">
              <input
                checked={isActive}
                type="checkbox"
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Active
            </label>
          ) : null}
          <button
            className="button button-primary button-full"
            disabled={creating || updating || name.trim().length === 0 || (!editing && code.trim().length < 2)}
            type="submit"
          >
            {creating || updating ? 'Saving…' : editing ? 'Save plan' : 'Create plan'}
          </button>
        </form>
      </Modal>
    </>
  );
};
