import { useMutation, useQuery } from '@apollo/client';
import { IconFileInvoice, IconPlus, IconRefresh, IconSettings } from '@tabler/icons-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Modal } from '../../../../components/modal/Modal';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  BILLING_PAGE_DATA_QUERY,
  CREATE_BILLING_GROUP_MUTATION,
  OPEN_EXPENSES_INVOICE_MUTATION,
  REMOVE_BILLING_MEMBER_MUTATION,
  SET_BILLING_MEMBER_MUTATION,
  UPDATE_BILLING_CONFIG_MUTATION,
} from '../graphql/billing.operations';

type BillingConfigRecord = {
  readonly id: string;
  readonly feeAmount: number;
  readonly feeCurrency: string;
  readonly paymentTermsNetDays: number;
  readonly anchorDay: number;
  readonly receiverName: string | null;
  readonly receiverEmail: string | null;
  readonly receiverAddress: string | null;
  readonly receiverZipCode: string | null;
  readonly receiverCity: string | null;
  readonly receiverCountry: string | null;
  readonly receiverPhone: string | null;
  readonly senderAddress: string | null;
  readonly senderZipCode: string | null;
  readonly senderCity: string | null;
  readonly senderCountry: string | null;
  readonly senderPhone: string | null;
  readonly invoiceLogoDataUrl: string | null;
  readonly signatureDataUrl: string | null;
};

type BillingGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly servicesPrefix: string;
  readonly expensesPrefix: string;
  readonly memberCount?: number;
};

type BillingMemberRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly displayName: string | null;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly monthlyRate: number;
  readonly rateCurrency: string;
};

type InvoiceRow = {
  readonly id: string;
  readonly groupName: string | null;
  readonly type: string;
  readonly status: string;
  readonly serviceYear: number;
  readonly serviceMonth: number;
  readonly number: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly totalAmount: number;
};

type EmployeeOption = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
};

type BillingPageData = {
  readonly billingConfig: BillingConfigRecord;
  readonly billingGroups: readonly BillingGroupRecord[];
  readonly billingMembers: readonly BillingMemberRecord[];
  readonly invoices: readonly InvoiceRow[];
  readonly employees: readonly EmployeeOption[];
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const statusColor = (status: string): string =>
  status === 'paid' ? 'green' : status === 'issued' ? 'blue' : 'amber';

const now = new Date();

export const BillingPage = () => {
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useQuery<BillingPageData>(BILLING_PAGE_DATA_QUERY);
  const [formError, setFormError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<'settings' | 'group' | 'rate' | 'expenses' | null>(
    null,
  );

  const [groupName, setGroupName] = useState('');
  const [servicesPrefix, setServicesPrefix] = useState('SP');
  const [expensesPrefix, setExpensesPrefix] = useState('EP');

  const [memberEmployeeId, setMemberEmployeeId] = useState('');
  const [memberGroupId, setMemberGroupId] = useState('');
  const [memberRate, setMemberRate] = useState('');

  const [feeAmount, setFeeAmount] = useState('');
  const [netDays, setNetDays] = useState('');
  const [anchorDay, setAnchorDay] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [addressForm, setAddressForm] = useState({
    senderAddress: '', senderZipCode: '', senderCity: '', senderCountry: '', senderPhone: '',
    receiverAddress: '', receiverZipCode: '', receiverCity: '', receiverCountry: '', receiverPhone: '',
  });
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [logoFileName, setLogoFileName] = useState('');
  const [signatureFileName, setSignatureFileName] = useState('');

  const [expenseGroupId, setExpenseGroupId] = useState('');
  const [expenseYear, setExpenseYear] = useState(now.getFullYear());
  const [expenseMonth, setExpenseMonth] = useState(now.getMonth() + 1);

  const [updateConfig] = useMutation(UPDATE_BILLING_CONFIG_MUTATION);
  const [createGroup] = useMutation(CREATE_BILLING_GROUP_MUTATION);
  const [setMember] = useMutation(SET_BILLING_MEMBER_MUTATION);
  const [removeMember] = useMutation(REMOVE_BILLING_MEMBER_MUTATION);
  const [openExpenses] = useMutation(OPEN_EXPENSES_INVOICE_MUTATION);

  const config = data?.billingConfig;
  const groups = data?.billingGroups ?? [];
  const members = data?.billingMembers ?? [];
  const invoices = [...(data?.invoices ?? [])].sort((a, b) => b.serviceYear - a.serviceYear || b.serviceMonth - a.serviceMonth);
  const employees = data?.employees ?? [];

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setFormError(null);
    try {
      await action();
      await refetch();
      return true;
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Operation failed.');
      return false;
    }
  };

  const openModalWith = (modal: 'settings' | 'group' | 'rate' | 'expenses'): void => {
    setFormError(null);
    setOpenModal(modal);
  };

  const onSaveConfig = (event: FormEvent): void => {
    event.preventDefault();
    void run(() =>
      updateConfig({
        variables: {
          input: {
            ...(feeAmount !== '' ? { feeAmount: Number(feeAmount) } : {}),
            ...(netDays !== '' ? { paymentTermsNetDays: Number(netDays) } : {}),
            ...(anchorDay !== '' ? { anchorDay: Number(anchorDay) } : {}),
            ...(receiverName !== '' ? { receiverName } : {}),
            ...Object.fromEntries(
              Object.entries(addressForm).filter(([, value]) => value !== ''),
            ),
            ...(logoDataUrl ? { invoiceLogoDataUrl: logoDataUrl } : {}),
            ...(signatureDataUrl ? { signatureDataUrl } : {}),
          },
        },
        refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
      }),
    ).then((ok) => {
      if (ok) {
        setOpenModal(null);
      }
    });
  };

  const readFileAsDataUrl = (file: File, setter: (dataUrl: string) => void): void => {
    if (file.size > 300_000) {
      setFormError('Image must be under 300 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onCreateGroup = (event: FormEvent): void => {
    event.preventDefault();
    if (!groupName.trim()) return;
    void run(() =>
      createGroup({
        variables: { input: { name: groupName.trim(), servicesPrefix, expensesPrefix } },
        refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
      }),
    ).then((ok) => {
      if (ok) {
        setGroupName('');
        setOpenModal(null);
      }
    });
  };

  const onAssignMember = (event: FormEvent): void => {
    event.preventDefault();
    if (!memberEmployeeId || !memberGroupId || memberRate === '') return;
    void run(() =>
      setMember({
        variables: {
          input: {
            employeeId: memberEmployeeId,
            groupId: memberGroupId,
            monthlyRate: Number(memberRate),
          },
        },
        refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
      }),
    ).then((ok) => {
      if (ok) {
        setMemberEmployeeId('');
        setMemberGroupId('');
        setMemberRate('');
        setOpenModal(null);
      }
    });
  };

  return (
    <main className="page-frame page-frame-single">
      <div className="employees-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Billing</h1>
            <p className="page-subtitle">
              Tethr → client invoicing: groups, agreed rates, and the invoice pipeline
              (auto-drafted when payroll finalizes).
            </p>
          </div>
          <div className="page-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => openModalWith('settings')}
            >
              <IconSettings size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Billing settings
            </button>
            <button className="icon-button" onClick={() => void refetch()} title="Refresh" type="button">
              <IconRefresh size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            </button>
          </div>
        </header>

        {error ? <p className="auth-error" role="alert">Could not load billing data.</p> : null}

        <section className="table-shell" aria-labelledby="groups-title">
          <div className="table-title-row">
            <div className="table-title" id="groups-title">Billing groups</div>
            <div className="panel-actions">
              <div className="table-density">{loading ? 'Loading…' : `${groups.length}`}</div>
              <button className="button button-secondary" type="button" onClick={() => openModalWith('group')}>
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                New group
              </button>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Group</th><th>Prefixes</th><th>Members</th></tr>
              </thead>
              <tbody>
                {groups.length === 0 && !loading ? (
                  <tr><td colSpan={3}>No groups yet — create one to start billing.</td></tr>
                ) : (
                  groups.map((group) => (
                    <tr key={group.id}>
                      <td><span className="employee-primary">{group.name}</span></td>
                      <td>{`${group.servicesPrefix} / ${group.expensesPrefix}`}</td>
                      <td>{group.memberCount ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-shell" aria-labelledby="members-title">
          <div className="table-title-row">
            <div className="table-title" id="members-title">Agreed rates</div>
            <div className="panel-actions">
              <div className="table-density">{members.length}</div>
              <button className="button button-secondary" type="button" onClick={() => openModalWith('rate')}>
                <IconPlus size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Assign rate
              </button>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Employee</th><th>Group</th><th>Monthly rate</th><th aria-label="Remove" /></tr>
              </thead>
              <tbody>
                {members.length === 0 && !loading ? (
                  <tr><td colSpan={4}>Nobody assigned yet.</td></tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id}>
                      <td><Link className="table-link" to={`/employees/${member.employeeId}`}>{member.displayName ?? member.employeeId}</Link></td>
                      <td>{member.groupName}</td>
                      <td>{`$${member.monthlyRate.toLocaleString()} / mo`}</td>
                      <td>
                        <button
                          className="icon-button"
                          type="button"
                          title="Remove membership"
                          onClick={() => void run(() => removeMember({ variables: { employeeId: member.employeeId }, refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }] }))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-shell" aria-labelledby="invoices-title">
          <div className="table-title-row">
            <div className="table-title" id="invoices-title">Invoices</div>
            <div className="panel-actions">
              <div className="table-density">{invoices.length}</div>
              <button className="button button-secondary" type="button" onClick={() => openModalWith('expenses')}>
                <IconFileInvoice size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                Open expenses draft
              </button>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Number</th><th>Group / Type</th><th>Covers</th><th>Total</th><th>Status</th><th>Due</th><th aria-label="Open" /></tr>
              </thead>
              <tbody>
                {invoices.length === 0 && !loading ? (
                  <tr><td colSpan={7}>No invoices yet — finalize a payroll run to auto-draft services invoices.</td></tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td><span className="employee-primary">{invoice.number ?? 'Draft'}</span></td>
                      <td>{`${invoice.groupName ?? '—'} · ${invoice.type}`}</td>
                      <td>{`${MONTH_NAMES[invoice.serviceMonth - 1]} ${invoice.serviceYear}`}</td>
                      <td>{new Intl.NumberFormat('en', { currency: invoice.currency, style: 'currency' }).format(invoice.totalAmount)}</td>
                      <td>
                        <span
                          className="chip"
                          style={{ '--chip-color': `var(--hrms-color-tag-${statusColor(invoice.status)})` } as CSSProperties}
                        >
                          <span className="chip-dot" />
                          {invoice.status}
                        </span>
                      </td>
                      <td>{invoice.dueDate ?? '—'}</td>
                      <td><Link className="table-link" to={`/billing/${invoice.id}`}>Open</Link></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal
        isOpen={openModal === 'settings'}
        onClose={() => setOpenModal(null)}
        title="Billing settings"
        width="lg"
      >
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        <form className="config-form" onSubmit={onSaveConfig}>
          <h3 className="section-title">Commercial terms</h3>
          <p className="field-hint">Current: ${config?.feeAmount ?? '—'} PEPM · Net {config?.paymentTermsNetDays ?? '—'} · anchor day {config?.anchorDay ?? '—'}</p>
          <div className="field"><label htmlFor="fee-amount">PEPM fee (USD)</label>
            <input id="fee-amount" min={0} placeholder={String(config?.feeAmount ?? '')} step="0.01" type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="net-days">Payment terms (net days)</label>
            <input id="net-days" min={0} placeholder={String(config?.paymentTermsNetDays ?? '')} type="number" value={netDays} onChange={(e) => setNetDays(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="anchor-day">Anchor day</label>
            <input id="anchor-day" max={28} min={1} placeholder={String(config?.anchorDay ?? '')} type="number" value={anchorDay} onChange={(e) => setAnchorDay(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="receiver-name">Client receiver name</label>
            <input id="receiver-name" placeholder={config?.receiverName ?? 'SynAck Solutions LLC'} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
          </div>

          <h3 className="section-title">Letterhead</h3>
          <div className="field">
            <label htmlFor="invoice-logo">Invoice logo (PNG/JPG, ≤300 KB)</label>
            <div className="file-input">
              <label className="file-input-trigger" htmlFor="invoice-logo">
                Choose file
              </label>
              <span className="file-input-name">{logoFileName || 'No file chosen'}</span>
              <input
                accept="image/*"
                className="file-input-native"
                id="invoice-logo"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setLogoFileName(file.name);
                    readFileAsDataUrl(file, setLogoDataUrl);
                  }
                }}
              />
            </div>
          </div>
          {config?.invoiceLogoDataUrl || logoDataUrl ? (
            <img
              alt="Invoice logo preview"
              src={logoDataUrl || config?.invoiceLogoDataUrl || undefined}
              style={{ maxHeight: 60, marginBottom: 8, objectFit: 'contain' }}
            />
          ) : null}
          <div className="field">
            <label htmlFor="signature-image">Signature image (≤300 KB)</label>
            <div className="file-input">
              <label className="file-input-trigger" htmlFor="signature-image">
                Choose file
              </label>
              <span className="file-input-name">{signatureFileName || 'No file chosen'}</span>
              <input
                accept="image/*"
                className="file-input-native"
                id="signature-image"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setSignatureFileName(file.name);
                    readFileAsDataUrl(file, setSignatureDataUrl);
                  }
                }}
              />
            </div>
          </div>
          {config?.signatureDataUrl || signatureDataUrl ? (
            <img
              alt="Signature preview"
              src={signatureDataUrl || config?.signatureDataUrl || undefined}
              style={{ maxHeight: 40, marginBottom: 8, objectFit: 'contain' }}
            />
          ) : null}

          <h3 className="section-title">Sender (Tethr) address</h3>
          <div className="field"><label htmlFor="sender-address">Street address</label>
            <input id="sender-address" placeholder={config?.senderAddress ?? '152, Street 23, G-10/2'} value={addressForm.senderAddress} onChange={(e) => setAddressForm((f) => ({ ...f, senderAddress: e.target.value }))} />
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="sender-zip">Zip</label>
              <input id="sender-zip" placeholder={config?.senderZipCode ?? '42201'} value={addressForm.senderZipCode} onChange={(e) => setAddressForm((f) => ({ ...f, senderZipCode: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="sender-city">City</label>
              <input id="sender-city" placeholder={config?.senderCity ?? 'Islamabad'} value={addressForm.senderCity} onChange={(e) => setAddressForm((f) => ({ ...f, senderCity: e.target.value }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="sender-country">Country</label>
              <input id="sender-country" placeholder={config?.senderCountry ?? 'Pakistan'} value={addressForm.senderCountry} onChange={(e) => setAddressForm((f) => ({ ...f, senderCountry: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="sender-phone">Phone</label>
              <input id="sender-phone" placeholder={config?.senderPhone ?? '+92 332 8883847'} value={addressForm.senderPhone} onChange={(e) => setAddressForm((f) => ({ ...f, senderPhone: e.target.value }))} />
            </div>
          </div>

          <h3 className="section-title">Receiver (client) address</h3>
          <div className="field"><label htmlFor="receiver-address">Street address</label>
            <input id="receiver-address" placeholder={config?.receiverAddress ?? '7709 Inwood Ave'} value={addressForm.receiverAddress} onChange={(e) => setAddressForm((f) => ({ ...f, receiverAddress: e.target.value }))} />
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="receiver-zip">Zip</label>
              <input id="receiver-zip" placeholder={config?.receiverZipCode ?? '21228'} value={addressForm.receiverZipCode} onChange={(e) => setAddressForm((f) => ({ ...f, receiverZipCode: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="receiver-city">City</label>
              <input id="receiver-city" placeholder={config?.receiverCity ?? 'Baltimore'} value={addressForm.receiverCity} onChange={(e) => setAddressForm((f) => ({ ...f, receiverCity: e.target.value }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="receiver-country">Country</label>
              <input id="receiver-country" placeholder={config?.receiverCountry ?? 'United States'} value={addressForm.receiverCountry} onChange={(e) => setAddressForm((f) => ({ ...f, receiverCountry: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="receiver-phone">Phone</label>
              <input id="receiver-phone" placeholder={config?.receiverPhone ?? '+1 443 805 9476'} value={addressForm.receiverPhone} onChange={(e) => setAddressForm((f) => ({ ...f, receiverPhone: e.target.value }))} />
            </div>
          </div>

          <button className="button button-secondary button-full" type="submit">Save terms</button>
        </form>
      </Modal>

      <Modal
        isOpen={openModal === 'group'}
        onClose={() => setOpenModal(null)}
        title="New billing group"
        width="sm"
      >
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        <form className="config-form" onSubmit={onCreateGroup}>
          <div className="field"><label htmlFor="group-name">Name</label>
            <input id="group-name" placeholder="PowerTech" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="sp-prefix">Services prefix</label>
            <input id="sp-prefix" maxLength={8} value={servicesPrefix} onChange={(e) => setServicesPrefix(e.target.value.toUpperCase())} />
          </div>
          <div className="field"><label htmlFor="ep-prefix">Expenses prefix</label>
            <input id="ep-prefix" maxLength={8} value={expensesPrefix} onChange={(e) => setExpensesPrefix(e.target.value.toUpperCase())} />
          </div>
          <button className="button button-secondary button-full" type="submit">Create group</button>
        </form>
      </Modal>

      <Modal
        isOpen={openModal === 'rate'}
        onClose={() => setOpenModal(null)}
        title="Assign rate"
        width="md"
      >
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        <form className="config-form" onSubmit={onAssignMember}>
          <div className="field"><label htmlFor="member-employee">Employee</label>
            <select id="member-employee" value={memberEmployeeId} onChange={(e) => setMemberEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{`${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`}</option>
              ))}
            </select>
          </div>
          <div className="field"><label htmlFor="member-group">Group</label>
            <select id="member-group" value={memberGroupId} onChange={(e) => setMemberGroupId(e.target.value)}>
              <option value="">Select…</option>
              {groups.map((group) => (<option key={group.id} value={group.id}>{group.name}</option>))}
            </select>
          </div>
          <div className="field"><label htmlFor="member-rate">Monthly rate (USD)</label>
            <input id="member-rate" min={0} required step="0.01" type="number" value={memberRate} onChange={(e) => setMemberRate(e.target.value)} />
          </div>
          <button className="button button-primary button-full" type="submit">Save rate</button>
        </form>
      </Modal>

      <Modal
        isOpen={openModal === 'expenses'}
        onClose={() => setOpenModal(null)}
        title="Open expenses draft"
        width="sm"
      >
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        <form
          className="config-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!expenseGroupId) return;
            void run(() =>
              openExpenses({
                variables: { groupId: expenseGroupId, serviceYear: expenseYear, serviceMonth: expenseMonth },
                refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
              }),
            ).then((ok) => {
              if (ok) {
                setOpenModal(null);
              }
            });
          }}
        >
          <div className="field"><label htmlFor="expense-group">Group</label>
            <select id="expense-group" value={expenseGroupId} onChange={(e) => setExpenseGroupId(e.target.value)}>
              <option value="">Select…</option>
              {groups.map((group) => (<option key={group.id} value={group.id}>{group.name}</option>))}
            </select>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="expense-month">Month</label>
              <select id="expense-month" value={expenseMonth} onChange={(e) => setExpenseMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, index) => (<option key={name} value={index + 1}>{name}</option>))}
              </select>
            </div>
            <div className="field"><label htmlFor="expense-year">Year</label>
              <input id="expense-year" max={2100} min={2000} type="number" value={expenseYear} onChange={(e) => setExpenseYear(Number(e.target.value))} />
            </div>
          </div>
          <button className="button button-secondary button-full" disabled={!expenseGroupId} type="submit">
            <IconFileInvoice size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            Open draft
          </button>
        </form>
      </Modal>
    </main>
  );
};

