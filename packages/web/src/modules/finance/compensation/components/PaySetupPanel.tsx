import { useMutation, useQuery } from '@apollo/client';
import type { PayComponentCategory, PayFrequency } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import { IconCashBanknote, IconCurrencyDollar, IconPlus } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';

import { StatusChip } from '../../../../components/chip/StatusChip';
import { EmptyState } from '../../../../components/empty-state/EmptyState';
import { Modal } from '../../../../components/modal/Modal';
import { SkeletonRows } from '../../../../components/skeleton/Skeleton';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  COMPENSATION_SETUP_QUERY,
  CREATE_PAY_COMPONENT_MUTATION,
  CREATE_SALARY_STRUCTURE_MUTATION,
} from '../graphql/compensation.operations';

type PayComponentRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly category: PayComponentCategory;
  readonly taxable: boolean;
  readonly recurring: boolean;
};

type SalaryStructureRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly gradeId: string | null;
  readonly currency: string;
  readonly payFrequency: PayFrequency;
  readonly isActive: boolean;
};

type CompensationSetupData = {
  readonly payComponents: ReadonlyArray<PayComponentRecord>;
  readonly salaryStructures: ReadonlyArray<SalaryStructureRecord>;
};

type CreatePayComponentData = { readonly createPayComponent: PayComponentRecord };
type CreateSalaryStructureData = { readonly createSalaryStructure: SalaryStructureRecord };

const categoryLabels: Record<PayComponentCategory, string> = {
  earning: 'Earning',
  deduction: 'Deduction',
  employerContribution: 'Employer contribution',
};

const categoryColors: Record<PayComponentCategory, MainColorName> = {
  earning: 'green',
  deduction: 'tomato',
  employerContribution: 'blue',
};

const payFrequencyLabels: Record<PayFrequency, string> = {
  monthly: 'Monthly',
  semiMonthly: 'Semi-monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
};

const emptyPayComponentForm = {
  name: '',
  code: '',
  category: 'earning' as PayComponentCategory,
  taxable: true,
  recurring: true,
};

const emptySalaryStructureForm = {
  name: '',
  code: '',
  currency: 'USD',
  payFrequency: 'monthly' as PayFrequency,
};

const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');

/**
 * The two setup registries — pay components and salary structures — that used
 * to occupy the top of `/compensation` as primary content.
 */
export const PaySetupPanel = () => {
  const { theme } = useTheme();
  const { data, loading, refetch } = useQuery<CompensationSetupData>(COMPENSATION_SETUP_QUERY);
  const [createPayComponent, { loading: creatingComponent }] = useMutation<CreatePayComponentData>(
    CREATE_PAY_COMPONENT_MUTATION,
  );
  const [createSalaryStructure, { loading: creatingStructure }] =
    useMutation<CreateSalaryStructureData>(CREATE_SALARY_STRUCTURE_MUTATION);

  const payComponents = useMemo(() => data?.payComponents ?? [], [data]);
  const salaryStructures = useMemo(() => data?.salaryStructures ?? [], [data]);

  const [payComponentForm, setPayComponentForm] = useState(emptyPayComponentForm);
  const [salaryStructureForm, setSalaryStructureForm] = useState(emptySalaryStructureForm);
  const [openModal, setOpenModal] = useState<'component' | 'structure' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const closeModal = (): void => {
    setFormError(null);
    setOpenModal(null);
  };

  const onCreatePayComponent = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setFormMessage(null);
    try {
      await createPayComponent({
        variables: {
          input: {
            name: payComponentForm.name.trim(),
            code: normalizeCode(payComponentForm.code),
            category: payComponentForm.category,
            taxable: payComponentForm.taxable,
            recurring: payComponentForm.recurring,
          },
        },
      });
      await refetch();
      setPayComponentForm(emptyPayComponentForm);
      setOpenModal(null);
      setFormMessage('Pay component created.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create pay component');
    }
  };

  const onCreateSalaryStructure = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setFormMessage(null);
    try {
      await createSalaryStructure({
        variables: {
          input: {
            name: salaryStructureForm.name.trim(),
            code: normalizeCode(salaryStructureForm.code),
            currency: salaryStructureForm.currency.trim().toUpperCase(),
            payFrequency: salaryStructureForm.payFrequency,
          },
        },
      });
      await refetch();
      setSalaryStructureForm(emptySalaryStructureForm);
      setOpenModal(null);
      setFormMessage('Salary structure created.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create salary structure');
    }
  };

  return (
    <>
      {formMessage ? (
        <p className="form-success" role="status">
          {formMessage}
        </p>
      ) : null}
      <div className="compensation-grid">
        <section className="table-shell" aria-labelledby="pay-components-title">
          <div className="table-title-row">
            <div className="table-title" id="pay-components-title">
              Pay components
            </div>
            <div className="panel-actions">
              <div className="table-density">
                {loading
                  ? '…'
                  : `${payComponents.length} component${payComponents.length === 1 ? '' : 's'}`}
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setFormError(null);
                  setPayComponentForm(emptyPayComponentForm);
                  setOpenModal('component');
                }}
              >
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                New component
              </button>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '19%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Category</th>
                  <th>Taxable</th>
                  <th>Recurring</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows columnCount={4} rows={3} /> : null}
                {!loading && payComponents.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={4}>
                      <EmptyState
                        icon={IconCurrencyDollar}
                        title="No pay components yet"
                        description="Add the earnings and deductions this workspace can pay."
                        action={
                          <button
                            className="button button-secondary"
                            onClick={() => setOpenModal('component')}
                            type="button"
                          >
                            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                            New component
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : null}
                {!loading &&
                  payComponents.map((component) => (
                    <tr key={component.id}>
                      <td data-label="Component">
                        <div className="employee-primary">{component.name}</div>
                        <div className="employee-secondary">{component.code}</div>
                      </td>
                      <td data-label="Category">
                        <StatusChip
                          color={categoryColors[component.category]}
                          label={categoryLabels[component.category]}
                        />
                      </td>
                      <td data-label="Taxable">{component.taxable ? 'Yes' : 'No'}</td>
                      <td data-label="Recurring">{component.recurring ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-shell" aria-labelledby="salary-structures-title">
          <div className="table-title-row">
            <div className="table-title" id="salary-structures-title">
              Salary structures
            </div>
            <div className="panel-actions">
              <div className="table-density">
                {loading
                  ? '…'
                  : `${salaryStructures.length} structure${salaryStructures.length === 1 ? '' : 's'}`}
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setFormError(null);
                  setSalaryStructureForm(emptySalaryStructureForm);
                  setOpenModal('structure');
                }}
              >
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                New structure
              </button>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Structure</th>
                  <th>Currency</th>
                  <th>Frequency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows columnCount={4} rows={3} /> : null}
                {!loading && salaryStructures.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={4}>
                      <EmptyState
                        icon={IconCashBanknote}
                        title="No salary structures yet"
                        description="Structures split gross pay into the components above."
                        action={
                          <button
                            className="button button-secondary"
                            onClick={() => setOpenModal('structure')}
                            type="button"
                          >
                            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                            New structure
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : null}
                {!loading &&
                  salaryStructures.map((structure) => (
                    <tr key={structure.id}>
                      <td data-label="Structure">
                        <div className="employee-primary">{structure.name}</div>
                        <div className="employee-secondary">{structure.code}</div>
                      </td>
                      <td data-label="Currency">{structure.currency}</td>
                      <td data-label="Frequency">{payFrequencyLabels[structure.payFrequency]}</td>
                      <td data-label="Status">
                        <StatusChip
                          color={structure.isActive ? 'green' : 'gray'}
                          label={structure.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal
        isOpen={openModal === 'component'}
        onClose={closeModal}
        title="New pay component"
        width="md"
      >
        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}
        <form className="config-form" onSubmit={(event) => void onCreatePayComponent(event)}>
          <div className="field">
            <label htmlFor="component-name">Name</label>
            <input
              id="component-name"
              required
              value={payComponentForm.name}
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="component-code">Code</label>
            <input
              id="component-code"
              required
              value={payComponentForm.code}
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="component-category">Category</label>
            <select
              id="component-category"
              value={payComponentForm.category}
              onChange={(event) =>
                setPayComponentForm((current) => ({
                  ...current,
                  category: event.target.value as PayComponentCategory,
                }))
              }
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="checkbox-field">
            <input
              checked={payComponentForm.taxable}
              type="checkbox"
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, taxable: event.target.checked }))
              }
            />
            Taxable
          </label>
          <label className="checkbox-field">
            <input
              checked={payComponentForm.recurring}
              type="checkbox"
              onChange={(event) =>
                setPayComponentForm((current) => ({ ...current, recurring: event.target.checked }))
              }
            />
            Recurring
          </label>
          <button
            className="button button-primary button-full"
            disabled={creatingComponent}
            type="submit"
          >
            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {creatingComponent ? 'Saving…' : 'Add component'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={openModal === 'structure'}
        onClose={closeModal}
        title="New salary structure"
        width="md"
      >
        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}
        <form className="config-form" onSubmit={(event) => void onCreateSalaryStructure(event)}>
          <div className="field">
            <label htmlFor="structure-name">Name</label>
            <input
              id="structure-name"
              required
              value={salaryStructureForm.name}
              onChange={(event) =>
                setSalaryStructureForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="structure-code">Code</label>
            <input
              id="structure-code"
              required
              value={salaryStructureForm.code}
              onChange={(event) =>
                setSalaryStructureForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
          <div className="field-group">
            <div className="field">
              <label htmlFor="structure-currency">Currency</label>
              <input
                id="structure-currency"
                maxLength={3}
                required
                value={salaryStructureForm.currency}
                onChange={(event) =>
                  setSalaryStructureForm((current) => ({
                    ...current,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="structure-frequency">Frequency</label>
              <select
                id="structure-frequency"
                value={salaryStructureForm.payFrequency}
                onChange={(event) =>
                  setSalaryStructureForm((current) => ({
                    ...current,
                    payFrequency: event.target.value as PayFrequency,
                  }))
                }
              >
                {Object.entries(payFrequencyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="button button-primary button-full"
            disabled={creatingStructure}
            type="submit"
          >
            <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {creatingStructure ? 'Saving…' : 'Add structure'}
          </button>
        </form>
      </Modal>
    </>
  );
};
