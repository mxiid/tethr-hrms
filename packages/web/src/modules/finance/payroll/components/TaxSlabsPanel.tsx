import { useMutation, useQuery } from '@apollo/client';
import { useState, type FormEvent } from 'react';

import { StatusChip } from '../../../../components/chip/StatusChip';
import {
  ACTIVATE_TAX_SLAB_GROUP_MUTATION,
  CREATE_TAX_SLAB_GROUP_MUTATION,
  TAX_SLAB_GROUPS_QUERY,
} from '../graphql/payroll.operations';

type TaxSlabGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly financialYearLabel: string;
  readonly currency: string;
  readonly isActive: boolean;
};

type TaxGroupsData = { readonly taxSlabGroups: readonly TaxSlabGroupRecord[] };

const currentYear = new Date().getFullYear();

/**
 * Withholding tax ladders — workspace payroll configuration, so it belongs in
 * `/settings/payroll` rather than behind a button on the runs list.
 */
export const TaxSlabsPanel = () => {
  const { data, refetch } = useQuery<TaxGroupsData>(TAX_SLAB_GROUPS_QUERY);
  const [createTaxGroup, { loading: creatingTaxGroup }] = useMutation(
    CREATE_TAX_SLAB_GROUP_MUTATION,
  );
  const [activateTaxGroup, { loading: activating }] = useMutation(
    ACTIVATE_TAX_SLAB_GROUP_MUTATION,
  );
  const [taxGroupName, setTaxGroupName] = useState('');
  const [taxGroupYear, setTaxGroupYear] = useState(`FY ${currentYear}-${currentYear + 1}`);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const taxGroups = data?.taxSlabGroups ?? [];
  const activeTaxGroup = taxGroups.find((group) => group.isActive) ?? null;

  const onCreateTaxGroup = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!taxGroupName.trim()) return;
    setFormError(null);
    setNotice(null);
    try {
      await createTaxGroup({
        variables: { input: { name: taxGroupName.trim(), financialYearLabel: taxGroupYear.trim() } },
        refetchQueries: [{ query: TAX_SLAB_GROUPS_QUERY }],
      });
      setTaxGroupName('');
      setNotice('Slab group added.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create the slab group.');
    }
  };

  return (
    <section className="table-shell" aria-labelledby="tax-slabs-title">
      <div className="table-title-row">
        <div className="table-title" id="tax-slabs-title">
          Withholding tax slabs
        </div>
      </div>
      <div className="settings-section-body">
        {formError ? (
          <p className="auth-error" role="alert">
            {formError}
          </p>
        ) : null}
        {notice ? (
          <p className="form-success" role="status">
            {notice}
          </p>
        ) : null}
        <p className="field-hint">
          Active ladder:{' '}
          <strong>
            {activeTaxGroup ? activeTaxGroup.financialYearLabel : 'none — tax computes as zero'}
          </strong>
        </p>
        <div className="record-list">
          {taxGroups.map((group) => (
            <div className="inline-actions-row" key={group.id}>
              <span className="truncate">
                {group.name} · {group.financialYearLabel}
              </span>
              {group.isActive ? (
                <StatusChip color="green" label="Active" />
              ) : (
                <button
                  className="button button-secondary"
                  disabled={activating}
                  type="button"
                  onClick={() => {
                    void activateTaxGroup({
                      variables: { groupId: group.id },
                      refetchQueries: [{ query: TAX_SLAB_GROUPS_QUERY }],
                    }).then(() => refetch());
                  }}
                >
                  Activate
                </button>
              )}
            </div>
          ))}
          {taxGroups.length === 0 ? (
            <p className="field-hint">No ladders yet — tax computes as zero until one is active.</p>
          ) : null}
        </div>
        <form className="config-form" onSubmit={(event) => void onCreateTaxGroup(event)}>
          <div className="field">
            <label htmlFor="tax-group-name">New group name</label>
            <input
              id="tax-group-name"
              name="tax-group-name"
              placeholder="e.g. Finance Act 2026"
              value={taxGroupName}
              onChange={(event) => setTaxGroupName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tax-group-year">Financial year label</label>
            <input
              id="tax-group-year"
              name="tax-group-year"
              value={taxGroupYear}
              onChange={(event) => setTaxGroupYear(event.target.value)}
            />
          </div>
          <button
            className="button button-secondary button-full"
            disabled={creatingTaxGroup}
            type="submit"
          >
            {creatingTaxGroup ? 'Adding…' : 'Add slab group'}
          </button>
          <p className="field-hint">
            Configure the band rows from the group&rsquo;s detail once created; the last band stays
            open-ended.
          </p>
        </form>
      </div>
    </section>
  );
};
