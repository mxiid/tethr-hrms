import { toId, type EmployeeId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { StorageService } from '../../core/documents/storage.service';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { WorkflowService } from '../../core/workflow';
import { EmployeeDirectoryService } from '../employee';
import { OrganizationService } from '../organization/organization.service';
import { CompensationService } from '../finance/compensation';
import { InvoiceService } from '../finance/billing/invoice.service';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseClaimLine } from './entities/expense-claim-line.entity';
import { ExpenseClaim } from './entities/expense-claim.entity';
import { ExpenseClaimService, type ExpenseActor } from './expense-claim.service';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');
const OTHER_EMPLOYEE = toId<EmployeeId>('emp-2');
const USER = toId<UserId>('user-1');

const selfActor: ExpenseActor = { userId: USER, employeeId: EMPLOYEE, canManage: false };
const adminActor: ExpenseActor = { userId: USER, employeeId: null, canManage: true };

const claimFixture = (overrides: Partial<ExpenseClaim> = {}): ExpenseClaim =>
  ({
    id: 'claim-1',
    organizationId: ORG,
    employeeId: EMPLOYEE,
    claimNumber: 'EXP-0001',
    purpose: 'Site visit',
    status: 'approved',
    currency: 'PKR',
    totalAmount: '6000',
    billableAmount: '4500',
    submittedAt: new Date(),
    approvalRequestId: 'approval-1',
    decidedByUserId: USER,
    decidedAt: new Date(),
    decisionNote: null,
    reimbursementMethod: null,
    reimbursedAt: null,
    reimbursementReference: null,
    payrollAdjustmentId: null,
    reimbursementPeriodYear: null,
    reimbursementPeriodMonth: null,
    billedInvoiceId: null,
    billedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as ExpenseClaim;

const travelCategory = (overrides: Partial<ExpenseCategory> = {}): ExpenseCategory =>
  ({
    id: 'category-travel',
    organizationId: ORG,
    code: 'TRAVEL',
    name: 'Travel',
    description: null,
    requiresReceipt: true,
    billableToClient: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as ExpenseCategory;

const buildService = () => {
  const manager = {
    find: jest.fn(async () => [] as unknown[]),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (entity: unknown) => entity),
    remove: jest.fn(async (entity: unknown) => entity),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (mgr: typeof manager) => Promise<unknown>) => work(manager)),
  };
  const claims = {
    findById: jest.fn(async () => claimFixture()),
    find: jest.fn(async () => [] as ExpenseClaim[]),
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    save: jest.fn(async (entity: unknown) => entity),
    count: jest.fn(async () => 0),
  };
  const lines = {
    findById: jest.fn(async () => null),
    find: jest.fn(async () => [] as ExpenseClaimLine[]),
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    save: jest.fn(async (entity: unknown) => entity),
  };
  const categories = {
    findById: jest.fn(async () => travelCategory()),
    find: jest.fn(async () => [travelCategory()]),
    findOne: jest.fn(async () => null),
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    save: jest.fn(async (entity: unknown) => entity),
    count: jest.fn(async () => 6),
  };
  const workflow = {
    requestApproval: jest.fn(async () => ({ id: 'approval-1' })),
    decide: jest.fn(async () => ({})),
  };
  const storage = {
    statObject: jest.fn(async () => ({ sizeBytes: 10 })),
    createSignedUpload: jest.fn(async () => ({
      storageKey: 'expense-receipts/key',
      url: 'http://upload',
      method: 'PUT',
      headers: [],
      expiresAt: new Date(),
    })),
    createSignedDownload: jest.fn(async () => ({ url: 'http://download' })),
  };
  const employeeDirectory = {
    getById: jest.fn(async () => ({ firstName: 'Ayesha', lastName: 'Khan' })),
  };
  const compensation = { createAdjustment: jest.fn(async () => ({ id: 'adjustment-1' })) };
  const invoices = {
    addExpenseClaimLines: jest.fn(async () => ({ invoice: { id: 'invoice-1' }, addedLines: 1 })),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const tenantContext = { getOrganizationId: jest.fn(() => ORG) };
  const platformScope = {
    assertOperator: jest.fn(async () => ({ organizationId: ORG })),
    switchTo: jest.fn(async (_input: unknown, work: () => Promise<unknown>) => work()),
    listClientOrganizationIds: jest.fn(async () => []),
  };

  const service = new ExpenseClaimService(
    categories as unknown as TenantScopedRepository<ExpenseCategory>,
    claims as unknown as TenantScopedRepository<ExpenseClaim>,
    lines as unknown as TenantScopedRepository<ExpenseClaimLine>,
    dataSource as unknown as DataSource,
    tenantContext as unknown as TenantContextService,
    platformScope as unknown as PlatformScopeService,
    workflow as unknown as WorkflowService,
    storage as unknown as StorageService,
    employeeDirectory as unknown as EmployeeDirectoryService,
    { getById: jest.fn(async () => ({ displayName: 'Smoke Finance Co' })) } as unknown as OrganizationService,
    compensation as unknown as CompensationService,
    invoices as unknown as InvoiceService,
    audit as unknown as AuditService,
  );

  return { service, mocks: { claims, lines, categories, workflow, storage, compensation, invoices, manager } };
};

describe('ExpenseClaimService', () => {
  it('refuses a line for a receipt-mandatory category without a receipt', async () => {
    const { service, mocks } = buildService();
    mocks.claims.findById.mockResolvedValue(claimFixture({ status: 'draft' }));
    await expect(
      service.addLine(
        'claim-1',
        {
          categoryId: 'category-travel',
          expenseDate: '2027-05-04',
          description: 'Taxi',
          amount: 1500,
        },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('verifies a receipt really exists at the claimed size', async () => {
    const { service, mocks } = buildService();
    mocks.claims.findById.mockResolvedValue(claimFixture({ status: 'draft' }));
    mocks.storage.statObject.mockResolvedValueOnce(null as unknown as { sizeBytes: number });
    await expect(
      service.addLine(
        'claim-1',
        {
          categoryId: 'category-travel',
          expenseDate: '2027-05-04',
          description: 'Taxi',
          amount: 1500,
          receipt: {
            storageKey: `expense-receipts/${ORG}/2027-05-04/receipt.txt`,
            fileName: 'receipt.txt',
            contentType: 'text/plain',
            sizeBytes: 10,
          },
        },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(mocks.storage.statObject).toHaveBeenCalled();

    const { service: sizedService, mocks: sizedMocks } = buildService();
    sizedMocks.claims.findById.mockResolvedValue(claimFixture({ status: 'draft' }));
    sizedMocks.storage.statObject.mockResolvedValueOnce({ sizeBytes: 999 });
    await expect(
      sizedService.addLine(
        'claim-1',
        {
          categoryId: 'category-travel',
          expenseDate: '2027-05-04',
          description: 'Taxi',
          amount: 1500,
          receipt: {
            storageKey: `expense-receipts/${ORG}/2027-05-04/receipt.txt`,
            fileName: 'receipt.txt',
            contentType: 'text/plain',
            sizeBytes: 10,
          },
        },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('hides another employee claim from a self-service actor', async () => {
    const { service, mocks } = buildService();
    mocks.claims.findById.mockResolvedValue(claimFixture({ employeeId: OTHER_EMPLOYEE }));
    await expect(service.cancelClaim('claim-1', selfActor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('schedules a payroll reimbursement carrying the claim as provenance', async () => {
    const { service, mocks } = buildService();
    const saved = await service.markReimbursed(
      'claim-1',
      { method: 'payroll', componentId: 'component-reimb', periodYear: 2027, periodMonth: 5 },
      null,
    );
    expect(mocks.compensation.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: EMPLOYEE,
        kind: 'reimbursement',
        sourceType: 'expenseClaim',
        sourceId: 'claim-1',
        amount: 6000,
      }),
    );
    expect(saved.payrollAdjustmentId).toBe('adjustment-1');
    expect(saved.status).toBe('paid');
  });

  it('refuses reimbursement before approval', async () => {
    const { service, mocks } = buildService();
    mocks.claims.findById.mockResolvedValue(claimFixture({ status: 'submitted' }));
    await expect(
      service.markReimbursed('claim-1', { method: 'direct' }, null),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses a second client pass-through', async () => {
    const { service, mocks } = buildService();
    mocks.claims.findById.mockResolvedValue(claimFixture({ billedInvoiceId: 'invoice-9' }));
    await expect(service.billToClient('claim-1', 2027, 5, null)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('numbers a submitted claim and opens the workflow approval', async () => {
    const { service, mocks } = buildService();
    mocks.claims.findById.mockResolvedValue(claimFixture({ status: 'draft', claimNumber: null }));
    mocks.lines.find.mockResolvedValue([
      { id: 'line-1', claimId: 'claim-1' } as ExpenseClaimLine,
    ]);
    mocks.claims.count.mockResolvedValue(2);
    const submitted = await service.submitClaim('claim-1', selfActor);
    expect(submitted.claimNumber).toBe('EXP-0003');
    expect(submitted.status).toBe('submitted');
    expect(mocks.workflow.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ subjectType: 'expenseClaim', subjectId: 'claim-1' }),
    );
    expect(submitted.approvalRequestId).toBe('approval-1');
  });

  it('survives a concurrent default-category seed without failing the read', async () => {
    const { service, mocks } = buildService();
    mocks.categories.count.mockResolvedValue(0);
    mocks.categories.save
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { driverError: { code: '23505' } }),
      )
      .mockImplementation(async (entity: unknown) => entity);
    await expect(service.listCategories()).resolves.toHaveLength(1);
  });
});
