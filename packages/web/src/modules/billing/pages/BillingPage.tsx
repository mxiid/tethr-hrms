import { useMutation, useQuery } from '@apollo/client';
import {
  Banknote,
  FileText,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

// shadcn/ui primitives (finance-module experiment).
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/card';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { Separator } from '@/components/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table';

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

const statusVariant = (status: string): 'default' | 'secondary' | 'outline' =>
  status === 'paid' ? 'outline' : status === 'issued' ? 'default' : 'secondary';

const now = new Date();

export const BillingPage = () => {
  const { data, loading, error, refetch } = useQuery<BillingPageData>(BILLING_PAGE_DATA_QUERY);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  // Commercial terms + letterhead + addresses.
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

  // Group + member forms.
  const [groupName, setGroupName] = useState('');
  const [servicesPrefix, setServicesPrefix] = useState('SP');
  const [expensesPrefix, setExpensesPrefix] = useState('EP');
  const [memberEmployeeId, setMemberEmployeeId] = useState('');
  const [memberGroupId, setMemberGroupId] = useState('');
  const [memberRate, setMemberRate] = useState('');

  // Expenses pass-through.
  const [expenseGroupId, setExpenseGroupId] = useState('');
  const [expenseYear, setExpenseYear] = useState(now.getFullYear());
  const [expenseMonth, setExpenseMonth] = useState(now.getMonth() + 1);

  const [updateConfig] = useMutation(UPDATE_BILLING_CONFIG_MUTATION);
  const [createGroup, { loading: creatingGroup }] = useMutation(CREATE_BILLING_GROUP_MUTATION);
  const [setMember, { loading: savingMember }] = useMutation(SET_BILLING_MEMBER_MUTATION);
  const [removeMember] = useMutation(REMOVE_BILLING_MEMBER_MUTATION);
  const [openExpenses] = useMutation(OPEN_EXPENSES_INVOICE_MUTATION);

  const config = data?.billingConfig;
  const groups = data?.billingGroups ?? [];
  const members = data?.billingMembers ?? [];
  const invoices = [...(data?.invoices ?? [])].sort(
    (a, b) => b.serviceYear - a.serviceYear || b.serviceMonth - a.serviceMonth,
  );
  const employees = data?.employees ?? [];

  const run = async (action: () => Promise<unknown>, message?: string): Promise<void> => {
    setFormError(null);
    setFormMessage(null);
    try {
      await action();
      await refetch();
      if (message) setFormMessage(message);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Operation failed.');
    }
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

  const onSaveConfig = (event: FormEvent): void => {
    event.preventDefault();
    void run(
      () =>
        updateConfig({
          variables: {
            input: {
              ...(feeAmount !== '' ? { feeAmount: Number(feeAmount) } : {}),
              ...(netDays !== '' ? { paymentTermsNetDays: Number(netDays) } : {}),
              ...(anchorDay !== '' ? { anchorDay: Number(anchorDay) } : {}),
              ...(receiverName !== '' ? { receiverName } : {}),
              ...Object.fromEntries(Object.entries(addressForm).filter(([, v]) => v !== '')),
              ...(logoDataUrl ? { invoiceLogoDataUrl: logoDataUrl } : {}),
              ...(signatureDataUrl ? { signatureDataUrl } : {}),
            },
          },
          refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
        }),
      'Setup saved.',
    );
  };

  const onCreateGroup = (event: FormEvent): void => {
    event.preventDefault();
    if (!groupName.trim()) return;
    void run(
      () =>
        createGroup({
          variables: {
            input: { name: groupName.trim(), servicesPrefix, expensesPrefix },
          },
          refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
        }),
      'Group created.',
    ).then(() => setGroupName(''));
  };

  const onAssignMember = (event: FormEvent): void => {
    event.preventDefault();
    if (!memberEmployeeId || !memberGroupId || memberRate === '') return;
    void run(
      () =>
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
      'Rate saved.',
    );
  };

  const money = (amount: number, currency: string): string =>
    new Intl.NumberFormat('en', { currency, maximumFractionDigits: 0, style: 'currency' }).format(
      amount,
    );

  return (
    <main className="finance-ui min-h-0 overflow-auto p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
            <p className="text-muted-foreground text-sm">
              Tethr → client invoicing: groups, agreed rates, and the invoice pipeline
              (auto-drafted when payroll finalizes).
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => void refetch()} title="Refresh">
            <RefreshCw />
          </Button>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            Could not load billing data.
          </p>
        ) : null}
        {formError ? (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        ) : null}
        {formMessage ? <p className="text-sm text-green-600">{formMessage}</p> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            {/* Billing groups */}
            <Card>
              <CardHeader>
                <CardTitle>Billing groups</CardTitle>
                <CardDescription>
                  Each group issues its own Services + Expenses invoice pair.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Prefixes</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.length === 0 && !loading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          No groups yet — create one to start billing.
                        </TableCell>
                      </TableRow>
                    ) : (
                      groups.map((group) => (
                        <TableRow key={group.id}>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{group.servicesPrefix}</Badge>{' '}
                            <Badge variant="outline">{group.expensesPrefix}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{group.memberCount ?? 0}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Agreed rates */}
            <Card>
              <CardHeader>
                <CardTitle>Agreed rates</CardTitle>
                <CardDescription>
                  Fixed USD monthly rate billed to the client for each person.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right">Monthly rate</TableHead>
                      <TableHead aria-label="Remove" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.length === 0 && !loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          Nobody assigned yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.displayName ?? member.employeeId}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.groupName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {`$${member.monthlyRate.toLocaleString()} / mo`}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Remove membership"
                              onClick={() => {
                                void run(() =>
                                  removeMember({
                                    variables: { employeeId: member.employeeId },
                                    refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
                                  }),
                                );
                              }}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Invoices */}
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>
                  Services invoices draft automatically when a payroll run finalizes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Covers</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead aria-label="Open" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 && !loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          No invoices yet — finalize a payroll run to auto-draft services
                          invoices.
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium tabular-nums">
                            {invoice.number ?? 'Draft'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {`${MONTH_NAMES[invoice.serviceMonth - 1]} ${invoice.serviceYear}`}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {money(invoice.totalAmount, invoice.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/billing/${invoice.id}`}>Open</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Setup column */}
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="size-4" /> Commercial terms
                </CardTitle>
                <CardDescription>
                  Current: ${config?.feeAmount ?? '—'} PEPM · Net {config?.paymentTermsNetDays ?? '—'} ·
                  anchor day {config?.anchorDay ?? '—'}
                </CardDescription>
                <CardAction>
                  <Badge variant="secondary">PEPM</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <form className="flex flex-col gap-4" onSubmit={onSaveConfig}>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="fee-amount">PEPM fee</Label>
                      <Input
                        id="fee-amount"
                        min={0}
                        placeholder={String(config?.feeAmount ?? '')}
                        step="0.01"
                        type="number"
                        value={feeAmount}
                        onChange={(e) => setFeeAmount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="net-days">Net days</Label>
                      <Input
                        id="net-days"
                        min={0}
                        placeholder={String(config?.paymentTermsNetDays ?? '')}
                        type="number"
                        value={netDays}
                        onChange={(e) => setNetDays(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="anchor-day">Anchor</Label>
                      <Input
                        id="anchor-day"
                        max={28}
                        min={1}
                        placeholder={String(config?.anchorDay ?? '')}
                        type="number"
                        value={anchorDay}
                        onChange={(e) => setAnchorDay(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="receiver-name">Client receiver name</Label>
                    <Input
                      id="receiver-name"
                      placeholder={config?.receiverName ?? 'SynAck Solutions LLC'}
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                    />
                  </div>

                  <Separator />

                  <div className="text-sm font-medium">Sender (Tethr) address</div>
                  <div className="flex flex-col gap-2">
                    <Input
                      aria-label="Sender street address"
                      placeholder="Street address"
                      value={addressForm.senderAddress}
                      onChange={(e) => setAddressForm((f) => ({ ...f, senderAddress: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      aria-label="Sender zip code"
                      placeholder="Zip"
                      value={addressForm.senderZipCode}
                      onChange={(e) => setAddressForm((f) => ({ ...f, senderZipCode: e.target.value }))}
                    />
                    <Input
                      aria-label="Sender city"
                      placeholder="City"
                      value={addressForm.senderCity}
                      onChange={(e) => setAddressForm((f) => ({ ...f, senderCity: e.target.value }))}
                    />
                    <Input
                      aria-label="Sender country"
                      placeholder="Country"
                      value={addressForm.senderCountry}
                      onChange={(e) => setAddressForm((f) => ({ ...f, senderCountry: e.target.value }))}
                    />
                  </div>
                  <Input
                    aria-label="Sender phone"
                    placeholder="Phone"
                    value={addressForm.senderPhone}
                    onChange={(e) => setAddressForm((f) => ({ ...f, senderPhone: e.target.value }))}
                  />

                  <div className="text-sm font-medium">Receiver (client) address</div>
                  <Input
                    aria-label="Receiver street address"
                    placeholder="Street address"
                    value={addressForm.receiverAddress}
                    onChange={(e) => setAddressForm((f) => ({ ...f, receiverAddress: e.target.value }))}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      aria-label="Receiver zip code"
                      placeholder="Zip"
                      value={addressForm.receiverZipCode}
                      onChange={(e) => setAddressForm((f) => ({ ...f, receiverZipCode: e.target.value }))}
                    />
                    <Input
                      aria-label="Receiver city"
                      placeholder="City"
                      value={addressForm.receiverCity}
                      onChange={(e) => setAddressForm((f) => ({ ...f, receiverCity: e.target.value }))}
                    />
                    <Input
                      aria-label="Receiver country"
                      placeholder="Country"
                      value={addressForm.receiverCountry}
                      onChange={(e) => setAddressForm((f) => ({ ...f, receiverCountry: e.target.value }))}
                    />
                  </div>
                  <Input
                    aria-label="Receiver phone"
                    placeholder="Phone"
                    value={addressForm.receiverPhone}
                    onChange={(e) => setAddressForm((f) => ({ ...f, receiverPhone: e.target.value }))}
                  />

                  <Button className="w-full" variant="secondary" type="submit">
                    Save terms
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4" /> Letterhead
                </CardTitle>
                <CardDescription>
                  Logo and signature are stamped on every generated PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="invoice-logo">Invoice logo</Label>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        <Upload className="size-3.5" />
                        Choose file
                        <input
                          accept="image/*"
                          className="hidden"
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) readFileAsDataUrl(file, setLogoDataUrl);
                          }}
                        />
                      </label>
                    </Button>
                    {config?.invoiceLogoDataUrl || logoDataUrl ? (
                      <img
                        alt="Invoice logo preview"
                        className="max-h-10 object-contain"
                        src={logoDataUrl || config?.invoiceLogoDataUrl || undefined}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">None uploaded</span>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="signature-image">Signature</Label>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        <Upload className="size-3.5" />
                        Choose file
                        <input
                          accept="image/*"
                          className="hidden"
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) readFileAsDataUrl(file, setSignatureDataUrl);
                          }}
                        />
                      </label>
                    </Button>
                    {config?.signatureDataUrl || signatureDataUrl ? (
                      <img
                        alt="Signature preview"
                        className="max-h-8 object-contain"
                        src={signatureDataUrl || config?.signatureDataUrl || undefined}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">None uploaded</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>New billing group</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="flex flex-col gap-4" onSubmit={onCreateGroup}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="group-name">Name</Label>
                    <Input
                      id="group-name"
                      placeholder="PowerTech"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sp-prefix">Services prefix</Label>
                      <Input
                        id="sp-prefix"
                        maxLength={8}
                        value={servicesPrefix}
                        onChange={(e) => setServicesPrefix(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ep-prefix">Expenses prefix</Label>
                      <Input
                        id="ep-prefix"
                        maxLength={8}
                        value={expensesPrefix}
                        onChange={(e) => setExpensesPrefix(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    disabled={creatingGroup}
                    type="submit"
                    variant="secondary"
                  >
                    <Plus /> Create group
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assign rate</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="flex flex-col gap-4" onSubmit={onAssignMember}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="member-employee">Employee</Label>
                    <select
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      id="member-employee"
                      value={memberEmployeeId}
                      onChange={(e) => setMemberEmployeeId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {`${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="member-group">Group</Label>
                    <select
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      id="member-group"
                      value={memberGroupId}
                      onChange={(e) => setMemberGroupId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="member-rate">Monthly rate (USD)</Label>
                    <Input
                      id="member-rate"
                      min={0}
                      required
                      step="0.01"
                      type="number"
                      value={memberRate}
                      onChange={(e) => setMemberRate(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" disabled={savingMember} type="submit">
                    <Plus /> Save rate
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expenses pass-through</CardTitle>
                <CardDescription>Open a manual draft for reimbursables.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!expenseGroupId) return;
                    void run(
                      () =>
                        openExpenses({
                          variables: {
                            groupId: expenseGroupId,
                            serviceYear: expenseYear,
                            serviceMonth: expenseMonth,
                          },
                          refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
                        }),
                      'Expenses draft opened.',
                    );
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="expense-group">Group</Label>
                    <select
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      id="expense-group"
                      value={expenseGroupId}
                      onChange={(e) => setExpenseGroupId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="expense-month">Month</Label>
                      <select
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        id="expense-month"
                        value={expenseMonth}
                        onChange={(e) => setExpenseMonth(Number(e.target.value))}
                      >
                        {MONTH_NAMES.map((name, index) => (
                          <option key={name} value={index + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="expense-year">Year</Label>
                      <Input
                        id="expense-year"
                        max={2100}
                        min={2000}
                        type="number"
                        value={expenseYear}
                        onChange={(e) => setExpenseYear(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!expenseGroupId}
                    type="submit"
                    variant="secondary"
                  >
                    <FileText /> Open draft
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
};
