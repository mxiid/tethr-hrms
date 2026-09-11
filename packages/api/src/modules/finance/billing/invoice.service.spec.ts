import { toId, type BillingGroupId, type EmployeeId, type InvoiceId, type OrganizationId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import { ConflictError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';
import { PayrollRunService } from '../payroll';

import {
  BillingGroupMember,
} from './entities/billing-group-member.entity';
import { BillingGroup } from './entities/billing-group.entity';
import { ClientBillingConfig } from './entities/client-billing-config.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { Invoice } from './entities/invoice.entity';
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
  payslips: [{ employeeId: EMPLOYEE, paidDays: 14 }],
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
  const lines = { find: jest.fn(async () => []) as jest.Mock, count: jest.fn(async () => 0), save: jest.fn(async (v: unknown) => v) };
  const employeeDirectory = {
    getById: jest.fn(async () => employeeFixture()),
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
    dataSource as unknown as DataSource,
    tenantContext as unknown as TenantContextService,
    publisher as unknown as DomainEventPublisher,
    audit as unknown as AuditService,
    employeeDirectory as unknown as EmployeeDirectoryService,
    payrollRuns as unknown as PayrollRunService,
  );
  // Deterministic clock: drafted on the anchor day itself (Aug 20, 2026).
  service.nowProvider = () => new Date('2026-08-20T10:00:00Z');

  return {
    service,
    mocks: { manager, configs, groups, members, invoices, lines, employeeDirectory, payrollRuns, publisher },
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
  it('records payment on an issued invoice with reference', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.findById = jest.fn(async () => ({
      id: INVOICE_ID,
      status: 'issued',
      number: 'SP0001',
      paymentReference: null,
      save: undefined,
    }));
    const paid = await service.markInvoicePaid({
      invoiceId: INVOICE_ID,
      paymentReference: 'CHK-99',
    });
    expect(paid.status).toBe('paid');
    expect(paid.paymentReference).toBe('CHK-99');
    expect(paid.paidAt).not.toBeNull();
  });

  it('rejects marking a draft invoice paid', async () => {
    const { service, mocks } = buildService();
    mocks.invoices.findById = jest.fn(async () => ({ id: INVOICE_ID, status: 'draft' }));
    await expect(service.markInvoicePaid({ invoiceId: INVOICE_ID })).rejects.toThrow(
      /Only issued/,
    );
  });
});

