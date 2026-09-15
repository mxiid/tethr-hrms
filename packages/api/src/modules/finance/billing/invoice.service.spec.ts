import { toId, type BillingGroupId, type EmployeeId, type InvoiceId, type OrganizationId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import { ConflictError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';
import { FxService } from '../fx/fx.service';
import { PayrollRunService } from '../payroll';

import {
  BillingGroupMember,
} from './entities/billing-group-member.entity';
import { BillingGroup } from './entities/billing-group.entity';
import { BillingPeriodClose } from './entities/billing-period-close.entity';
import { ClientBillingConfig } from './entities/client-billing-config.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { Invoice } from './entities/invoice.entity';
import { PayrollCostSnapshot } from './entities/payroll-cost-snapshot.entity';
import { InvoiceService } from './invoice.service';

const ORG = toId<OrganizationId>('org-1');
const GROUP = toId<BillingGroupId>('group-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');
const INVOICE_ID = toId<InvoiceId>('inv-1');

const configFixture = (): ClientBillingConfig =>
  ({
    id: 'config-1',
    organizationId: ORG,
    feeAmount: '300.00',
    feeCurrency: 'USD',
    paymentTermsNetDays: 7,
    anchorDay: 20,
    receiverName: null,
    receiverAddress: null,
    receiverEmail: null,
    senderName: null,
    senderAddress: null,
    senderEmail: null,
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    bankSwift: null,
  }) as unknown as ClientBillingConfig;

const groupFixture = (): BillingGroup =>
  ({
    id: GROUP,
    organizationId: ORG,
    name: 'PowerTech',
    servicesPrefix: 'SP',
    expensesPrefix: 'EP',
  }) as unknown as BillingGroup;

const memberFixture = (): BillingGroupMember =>
  ({
    id: 'member-1',
    organizationId: ORG,
    employeeId: EMPLOYEE,
    groupId: GROUP,
    monthlyRate: '900.00',
    rateCurrency: 'USD',
    validFrom: '2026-08-12',
    validTo: null,
  }) as unknown as BillingGroupMember;

const employeeFixture = () => ({
  id: EMPLOYEE,
  employeeNumber: 'EMP-001',
  firstName: 'Waheed',
  lastName: 'Ali',
  hireDate: '2026-08-12',
  employmentStatus: 'active',
});

const summaryFixture = () => ({
  runId: toId('run-1'),
  periodYear: 2026,
  periodMonth: 8,
  standardWorkingDays: 21,
  payslips: [{ employeeId: EMPLOYEE, paidDays: 14, grossAmount: 100000, employerCostAmount: 110000 }],
  payrollCurrency: 'PKR',
  grossTotal: 100000,
  employerCostTotal: 110000,
  payDate: '2026-08-28',
});

const buildService = () => {
  let generated = 0;
  const manager = {
    create: jest.fn((_target: unknown, attrs: Record<string, unknown>) => ({ ...attrs })),
    save: jest.fn(async (entity: Record<string, unknown>) =>
      entity.id !== undefined ? entity : { ...entity, id: `gen-${(generated += 1)}` },
    ),
    find: jest.fn(async () => [] as unknown[]),
    findOne: jest.fn(),
    count: jest.fn(async () => 0),
    remove: jest.fn(async (entity: unknown) => entity),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (mgr: typeof manager) => Promise<unknown>) => cb(manager)),
  };

  const configs = { findOne: jest.fn(async () => configFixture()), save: jest.fn(async (v: unknown) => v) };
  const groups = { find: jest.fn(async () => [groupFixture()]), findById: jest.fn(async () => groupFixture()) };
  const members = { find: jest.fn(async () => [memberFixture()]), findOne: jest.fn(async () => memberFixture()) };
  const invoices = {
    find: jest.fn(async () => []) as jest.Mock,
    findOne: jest.fn(async () => null) as jest.Mock,
    findById: jest.fn(async () => null) as jest.Mock,
    save: jest.fn(async (v: unknown) => v),
    count: jest.fn(async () => 0),
  };
  const lines = {
    find: jest.fn(async () => []) as jest.Mock,
    count: jest.fn(async () => 0),
    create: jest.fn((attrs: Record<string, unknown>) => ({ ...attrs })),
    save: jest.fn(async (v: unknown) => v),
  };
  const costSnapshots = {
    findOne: jest.fn(async () => null) as jest.Mock,
    create: jest.fn((attrs: Record<string, unknown>) => ({ ...attrs })),
    save: jest.fn(async (v: unknown) => v),
  };
  const periodCloses = {
    find: jest.fn(async () => []) as jest.Mock,
    findOne: jest.fn(async () => null) as jest.Mock,
    create: jest.fn((attrs: Record<string, unknown>) => ({ ...attrs })),
    save: jest.fn(async (v: unknown) => v),
  };
  const fx = { getRate: jest.fn(async () => 0.0036) as jest.Mock };
  const employeeDirectory = {
    getById: jest.fn(async () => employeeFixture()) as jest.Mock,
    exists: jest.fn(async () => true),
    getDisplayName: jest.fn(async () => 'Waheed Ali'),
  };
  const payrollRuns = { getFinalizedRunSummary: jest.fn(async () => summaryFixture()) };
  const publisher = { publishWithin: jest.fn(async () => undefined) };
  const tenantContext = { getOrganizationId: jest.fn(() => ORG) };
  const audit = { record: jest.fn(async () => undefined) };

  const service = new InvoiceService(
    configs as unknown as TenantScopedRepository<ClientBillingConfig>,
    groups as unknown as TenantScopedRepository<BillingGroup>,
    members as unknown as TenantScopedRepository<BillingGroupMember>,
    invoices as unknown as TenantScopedRepository<Invoice>,
    lines as unknown as TenantScopedRepository<InvoiceLine>,
    costSnapshots as unknown as TenantScopedRepository<PayrollCostSnapshot>,
    periodCloses as unknown as TenantScopedRepository<BillingPeriodClose>,
    dataSource as unknown as DataSource,
    tenantContext as unknown as TenantContextService,
    publisher as unknown as DomainEventPublisher,
    audit as unknown as AuditService,
    employeeDirectory as unknown as EmployeeDirectoryService,
    payrollRuns as unknown as PayrollRunService,
    fx as unknown as FxService,
  );
  // Deterministic clock: drafted on the anchor day itself (Aug 20, 2026).
  service.nowProvider = () => new Date('2026-08-20T10:00:00Z');

  return {
    service,
    mocks: { manager, configs, groups, members, invoices, lines, costSnapshots, periodCloses, employeeDirectory, payrollRuns, publisher, fx, audit },
  };
};

describe('InvoiceService.draftInvoicesFromRun', () => {
  it('drafts catch-up + service month + fee lines with advance-billing window', async () => {
    const { service, mocks } = buildService();
    const created = await service.draftInvoicesFromRun('run-1');

    expect(created).toHaveLength(1);
    const invoiceAttrs = mocks.manager.create.mock.calls.find(
      ([target]) => target === Invoice,
    )![1] as Record<string, unknown>;
    expect(invoiceAttrs.type).toBe('services');
    expect(invoiceAttrs.serviceYear).toBe(2026);
    expect(invoiceAttrs.serviceMonth).toBe(9);
    expect(invoiceAttrs.periodStart).toBe('2026-08-20');
    expect(invoiceAttrs.periodEndExclusive).toBe('2026-09-20');

    const lineCalls = mocks.manager.create.mock.calls.filter(
      ([target]) => target === InvoiceLine,
    );
    const kinds = lineCalls.map(([, attrs]) => (attrs as Record<string, unknown>).kind);
    expect(kinds).toEqual(['catchup', 'salary', 'fee']);
    const amounts = lineCalls.map(([, attrs]) => (attrs as Record<string, string>).total);
    // Aug catch-up: 900 × 14/21 working days; Sep full rate; PEPM fee.
    expect(amounts).toEqual(['600.00', '900.00', '300.00']);
    expect(Number(invoiceAttrs.totalAmount)).toBe(1800);
  });

  it('is a no-op when the service month is already covered for the group', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.findOne.mockResolvedValue({ id: 'existing' });
    const created = await service.draftInvoicesFromRun('run-1');
    expect(created).toHaveLength(0);
  });

  it('bills a terminated-mid-month employee for the partial month only', async () => {
    const { service, mocks } = buildService();
    // Hired 12 Aug, terminated 20 Aug; drafted on 20 Aug (service month Sep).
    mocks.employeeDirectory.getById.mockResolvedValue({
      ...employeeFixture(),
      terminationDate: '2026-08-20',
      employmentStatus: 'terminated',
    });

    const created = await service.draftInvoicesFromRun('run-1');

    expect(created).toHaveLength(1);
    const lineCalls = mocks.manager.create.mock.calls.filter(
      ([target]) => target === InvoiceLine,
    );
    const kinds = lineCalls.map(([, attrs]) => (attrs as Record<string, unknown>).kind);
    // No September salary line (terminated before it) and no PEPM fee; only the
    // partial August catch-up, pro-rated through the termination date.
    expect(kinds).toEqual(['catchup']);
    expect((lineCalls[0][1] as Record<string, string>).total).toBe('300.00');
  });

  it('keeps a zero-invoiced close when a run has cost but nobody billable', async () => {
    const { service, mocks } = buildService();
    // No billing groups at all: the run still finalizes and carries cost.
    mocks.groups.find.mockResolvedValue([]);

    const created = await service.draftInvoicesFromRun('run-1');

    expect(created).toHaveLength(0);
    // 110000 PKR employer cost at 0.0036 → 396.00 USD, nothing invoiced.
    expect(mocks.periodCloses.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceYear: 2026,
        serviceMonth: 8,
        invoiceCount: 0,
        invoicedAmount: '0.00',
        payrollCostAmount: '396.00',
        varianceAmount: '-396.00',
        status: 'variance',
      }),
    );
  });

  const winnerSnapshot = {
    id: 'snapshot-winner',
    payrollRunId: 'run-1',
    periodYear: 2026,
    periodMonth: 8,
    payDate: '2026-08-28',
    billingCurrency: 'USD',
    fxRate: '0.0036',
    convertedEmployerCost: '396.00',
    employeeCosts: [],
  };

  it('recovers a concurrent snapshot insert and reuses the winner row', async () => {
    const { service, mocks } = buildService();
    mocks.groups.find.mockResolvedValue([]);
    mocks.costSnapshots.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
    mocks.costSnapshots.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winnerSnapshot);

    const created = await service.draftInvoicesFromRun('run-1');

    expect(created).toHaveLength(0);
    expect(mocks.periodCloses.save).toHaveBeenCalledWith(
      expect.objectContaining({ payrollCostAmount: '396.00', invoicedAmount: '0.00' }),
    );
  });

  it('rethrows the unique violation when the winner row cannot be found', async () => {
    const { service, mocks } = buildService();
    mocks.groups.find.mockResolvedValue([]);
    const violation = { driverError: { code: '23505' } };
    mocks.costSnapshots.save.mockRejectedValueOnce(violation);

    await expect(service.draftInvoicesFromRun('run-1')).rejects.toMatchObject(violation);
  });

  it('propagates snapshot insert errors that are not unique violations', async () => {
    const { service, mocks } = buildService();
    mocks.groups.find.mockResolvedValue([]);
    mocks.costSnapshots.save.mockRejectedValueOnce(new Error('snapshot boom'));

    await expect(service.draftInvoicesFromRun('run-1')).rejects.toThrow('snapshot boom');
  });
});

describe('InvoiceService.listReconciliation', () => {
  it('returns close-only months (cost, nothing invoiced) with zero amounts', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.find.mockResolvedValue([]);
    mocks.periodCloses.find.mockResolvedValue([
      {
        id: 'close-1',
        payrollRunId: 'run-1',
        serviceYear: 2026,
        serviceMonth: 8,
        status: 'variance',
        currency: 'USD',
        invoiceCount: 0,
        invoicedAmount: '0.00',
        payrollCostAmount: '396.00',
        varianceAmount: '-396.00',
        payDate: '2026-08-28',
      },
    ]);

    const periods = await service.listReconciliation();

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      serviceYear: 2026,
      serviceMonth: 8,
      status: 'variance',
      currency: 'USD',
      invoiceCount: 0,
      invoicedAmount: 0,
      payrollCostAmount: 396,
      varianceAmount: -396,
      payrollRunId: 'run-1',
      payDate: '2026-08-28',
    });
    expect(periods[0].invoices).toHaveLength(0);
  });
});

describe('InvoiceService.issueInvoice', () => {
  const draftInvoice = () => ({
    id: INVOICE_ID,
    organizationId: ORG,
    groupId: GROUP,
    type: 'services',
    status: 'draft',
    currency: 'USD',
    totalAmount: '1800.00',
    number: null,
    issueDate: null,
    dueDate: null,
  });

  it('assigns the prefixed sequence number and freezes the document', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne.mockImplementation(async (target: unknown) => {
      if (target === Invoice) return draftInvoice();
      if (target === BillingGroup) return groupFixture();
      return configFixture();
    });
    mocks.manager.find.mockResolvedValue([{ id: 'line-1', total: '1800.00' }]);
    mocks.manager.count.mockResolvedValue(5);

    const issued = await service.issueInvoice(INVOICE_ID);

    expect(issued.number).toBe('SP0006');
    expect(issued.status).toBe('issued');
    expect(issued.dueDate).toBe('2026-08-27');
    expect(mocks.publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'invoice.issued',
        payload: expect.objectContaining({ invoiceNumber: 'SP0006', totalAmount: 1800 }),
      }),
    );
  });

  it('refuses to issue twice', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne.mockImplementation(async (target: unknown) =>
      target === Invoice
        ? { ...draftInvoice(), status: 'issued', number: 'SP0001' }
        : groupFixture(),
    );
    await expect(service.issueInvoice(INVOICE_ID)).rejects.toThrow(/already issued/);
  });

  it('refuses to edit an issued invoice', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne.mockImplementation(async (target: unknown) =>
      target === InvoiceLine
        ? { id: 'line-1', invoiceId: INVOICE_ID }
        : { ...draftInvoice(), status: 'issued', number: 'SP0001' },
    );
    await expect(
      service.updateDraftLine({ lineId: 'line-1', unitPrice: 10 }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('InvoiceService.markInvoicePaid', () => {
  it('records payment on an issued invoice with reference inside the locked transaction', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne = jest.fn(async () => ({
      id: INVOICE_ID,
      status: 'issued',
      number: 'SP0001',
      paymentReference: null,
    }));
    const paid = await service.markInvoicePaid({
      invoiceId: INVOICE_ID,
      paymentReference: 'CHK-99',
    });
    expect(paid.status).toBe('paid');
    expect(paid.paymentReference).toBe('CHK-99');
    expect(paid.paidAt).not.toBeNull();
    expect(mocks.manager.findOne).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({
        where: expect.objectContaining({ id: INVOICE_ID, organizationId: ORG }),
        lock: { mode: 'pessimistic_write' },
      }),
    );
    // The audit commits with the payment facts, not after them.
    expect(mocks.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'markPaid', resourceId: INVOICE_ID }),
      mocks.manager,
    );
  });

  it('records the settlement date and effective paidAt in the audit payload', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne = jest.fn(async () => ({
      id: INVOICE_ID,
      status: 'issued',
      number: 'SP0001',
      issueDate: '2026-09-01',
      paymentReference: null,
    }));
    await service.markInvoicePaid({ invoiceId: INVOICE_ID, settlementDate: '2026-09-10' });
    expect(mocks.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'markPaid',
        after: expect.objectContaining({
          settlementDate: '2026-09-10',
          paidAt: '2026-09-10T00:00:00.000Z',
        }),
      }),
      mocks.manager,
    );
  });

  it('rejects a regex-shaped but impossible settlement date before any read', async () => {
    const { service, mocks } = buildService();
    await expect(
      service.markInvoicePaid({ invoiceId: INVOICE_ID, settlementDate: '2026-02-31' }),
    ).rejects.toThrow(/real calendar date/);
    expect(mocks.manager.findOne).not.toHaveBeenCalled();
  });

  it('rejects a settlement date before the invoice issue date', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne = jest.fn(async () => ({
      id: INVOICE_ID,
      status: 'issued',
      number: 'SP0001',
      issueDate: '2026-09-01',
      paymentReference: null,
    }));
    await expect(
      service.markInvoicePaid({ invoiceId: INVOICE_ID, settlementDate: '2026-08-31' }),
    ).rejects.toThrow(/cannot precede the invoice issue date/);
  });

  it('rejects marking a draft invoice paid', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne = jest.fn(async () => ({ id: INVOICE_ID, status: 'draft' }));
    await expect(service.markInvoicePaid({ invoiceId: INVOICE_ID })).rejects.toThrow(
      /Only issued/,
    );
  });

  it('refuses a second confirmation found paid inside the lock', async () => {
    const { service, mocks } = buildService();
    mocks.manager.findOne = jest.fn(async () => ({
      id: INVOICE_ID,
      status: 'paid',
      number: 'SP0001',
    }));
    await expect(service.markInvoicePaid({ invoiceId: INVOICE_ID })).rejects.toThrow(
      /Only issued/,
    );
  });

  it('refreshes the month close when a draft is voided', async () => {
    const { service, mocks } = buildService();
    // Advance-billed document: service month a month ahead of the covered lines.
    mocks.manager.findOne = jest.fn(async () => ({
      id: INVOICE_ID,
      status: 'draft',
      serviceYear: 2026,
      serviceMonth: 10,
      type: 'services',
    }));
    mocks.lines.find.mockResolvedValue([
      {
        id: 'line-1',
        invoiceId: INVOICE_ID,
        kind: 'salary',
        monthLabel: 'September 2026',
      },
    ]);
    mocks.periodCloses.findOne = jest.fn(async () => ({
      id: 'close-1',
      payrollRunId: 'run-1',
      serviceYear: 2026,
      serviceMonth: 9,
    }));
    const voided = await service.voidInvoice(INVOICE_ID);
    expect(voided.status).toBe('voided');
    // The September close is refreshed even though the invoice says October.
    expect(mocks.payrollRuns.getFinalizedRunSummary).toHaveBeenCalled();
    expect(mocks.periodCloses.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ serviceYear: 2026, serviceMonth: 9 }),
      }),
    );
    // The void and its audit committed together, inside the locked transaction.
    expect(mocks.manager.findOne).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({
        where: expect.objectContaining({ id: INVOICE_ID, organizationId: ORG }),
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(mocks.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'void', resourceId: INVOICE_ID }),
      mocks.manager,
    );
  });
});

describe('InvoiceService.setMember', () => {
  it('rejects a membership whose range overlaps an existing one (finding 3)', async () => {
    const { service, mocks } = buildService();
    // A closed historical row that still covers today, plus the open row that
    // will be closed by this call.
    mocks.members.find = jest.fn(async () => [
      memberFixture(),
      {
        id: 'member-old',
        organizationId: ORG,
        employeeId: EMPLOYEE,
        groupId: GROUP,
        monthlyRate: '800.00',
        rateCurrency: 'USD',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
      } as unknown as BillingGroupMember,
    ]);

    await expect(
      service.setMember({ employeeId: EMPLOYEE, groupId: GROUP, monthlyRate: 1000 }),
    ).rejects.toThrow(/already covers this period/);
  });
});

describe('InvoiceService.addExpenseClaimLines', () => {
  const expensesInvoice = (status: string) => ({
    id: 'invoice-exp',
    organizationId: ORG,
    groupId: GROUP,
    type: 'expenses',
    status,
    currency: 'USD',
    subTotal: '0',
    totalAmount: '0',
  });

  const claimLines = {
    employeeId: EMPLOYEE,
    serviceYear: 2026,
    serviceMonth: 9,
    sourceLabel: 'EXP-0001',
    lines: [{ description: 'Travel: taxi', amount: 500 }],
  };

  it('converts each line at its own expense date rate', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.findOne.mockResolvedValue(expensesInvoice('draft'));
    mocks.fx.getRate.mockImplementation(async (_base: string, _quote: string, date: string) =>
      date === '2026-09-04' ? 0.0036 : 0.004,
    );
    const result = await service.addExpenseClaimLines({
      ...claimLines,
      sourceCurrency: 'PKR',
      lines: [
        { description: 'Older taxi', amount: 1000, asOf: '2026-09-04' },
        { description: 'Newer taxi', amount: 1000, asOf: '2026-09-12' },
      ],
    });
    expect(result.addedLines).toBe(2);
    const created = mocks.manager.create.mock.calls
      .map((call) => call[1] as Record<string, unknown>)
      .filter((line) => line['kind'] === 'expense');
    expect(created.map((line) => line['total'])).toEqual(['3.60', '4.00']);
  });

  it('refuses pass-through lines once the month has been issued', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.findOne.mockResolvedValue(expensesInvoice('issued'));
    await expect(service.addExpenseClaimLines(claimLines)).rejects.toThrow(/already issued/);
  });

  it('stamps the tenant on an invoice created through the transaction manager', async () => {
    const { service, mocks } = buildService();
    // No expenses invoice exists yet for the month.
    const result = await service.addExpenseClaimLines(
      claimLines,
      mocks.manager as unknown as EntityManager,
    );
    expect(result.addedLines).toBe(1);
    const invoiceAttrs = mocks.manager.create.mock.calls.find(
      ([target]) => target === Invoice,
    )?.[1] as Record<string, unknown> | undefined;
    expect(invoiceAttrs).toBeDefined();
    expect(invoiceAttrs?.organizationId).toBe(ORG);
    expect(invoiceAttrs?.type).toBe('expenses');
  });

  it('appends marked lines to the month draft and skips a retry', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.findOne.mockResolvedValue(expensesInvoice('draft'));

    const first = await service.addExpenseClaimLines(claimLines);
    expect(first.addedLines).toBe(1);
    expect(mocks.manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: 'Travel: taxi [EXP-0001]' }),
    );

    // A retry finds its own marker and adds nothing.
    mocks.lines.find.mockResolvedValue([
      { id: 'line-1', invoiceId: 'invoice-exp', description: 'Travel: taxi [EXP-0001]' },
    ]);
    const retry = await service.addExpenseClaimLines(claimLines);
    expect(retry.addedLines).toBe(0);
  });
});

