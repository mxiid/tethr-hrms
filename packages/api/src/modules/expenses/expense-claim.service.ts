import { randomUUID } from 'node:crypto';

import {
  toId,
  type EmployeeId,
  type ExpenseClaimStatus,
  type ExpenseReimbursementMethod,
  type IsoDate,
  type OrganizationId,
  type PayComponentId,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import type { StorageAccessHeader } from '../../core/documents/storage.driver';
import { StorageService } from '../../core/documents/storage.service';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { WorkflowService } from '../../core/workflow';
import { EmployeeDirectoryService } from '../employee';
import { InvoiceService } from '../finance/billing/invoice.service';
import { CompensationService } from '../finance/compensation';
import { OrganizationService } from '../organization/organization.service';

import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseClaimLine } from './entities/expense-claim-line.entity';
import { ExpenseClaim } from './entities/expense-claim.entity';
import {
  EXPENSE_CATEGORY_REPOSITORY,
  EXPENSE_CLAIM_LINE_REPOSITORY,
  EXPENSE_CLAIM_REPOSITORY,
} from './expenses.tokens';

export type ExpenseActor = {
  readonly userId: UserId;
  // Null for admins acting on anyone; set for self-service (own claims only).
  readonly employeeId: EmployeeId | null;
  readonly canManage: boolean;
};

export type ExpenseClaimDetail = {
  readonly claim: ExpenseClaim;
  readonly lines: readonly ExpenseClaimLine[];
  readonly employeeName: string | null;
  readonly categoryNameByCategoryId: ReadonlyMap<string, string>;
};

export type ExpenseClaimRecord = ExpenseClaimDetail & {
  readonly organizationId: string;
  readonly organizationName: string;
};

export type ExpenseLineData = {
  readonly categoryId: string;
  readonly expenseDate: IsoDate;
  readonly description: string;
  readonly amount: number;
  readonly receipt?: ExpenseReceiptData | null;
};

export type ExpenseReceiptData = {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
};

export type MarkClaimReimbursedData = {
  readonly method: ExpenseReimbursementMethod;
  readonly paymentReference?: string | null;
  readonly periodYear?: number | null;
  readonly periodMonth?: number | null;
  readonly componentId?: string | null;
};

type CreateCategoryData = {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly requiresReceipt?: boolean;
  readonly billableToClient?: boolean;
};

type UpdateCategoryData = {
  readonly categoryId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly requiresReceipt?: boolean;
  readonly billableToClient?: boolean;
  readonly isActive?: boolean;
};

const DEFAULT_CATEGORIES: readonly CreateCategoryData[] = [
  { code: 'TRAVEL', name: 'Travel', requiresReceipt: true, billableToClient: false },
  { code: 'MEALS', name: 'Meals', requiresReceipt: true, billableToClient: false },
  { code: 'SUPPLIES', name: 'Office supplies', requiresReceipt: true, billableToClient: false },
  { code: 'SOFTWARE', name: 'Software & subscriptions', requiresReceipt: true, billableToClient: false },
  { code: 'CLIENT', name: 'Client entertainment', requiresReceipt: true, billableToClient: true },
  { code: 'OTHER', name: 'Other', requiresReceipt: false, billableToClient: false },
];

const toMoneyString = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);
const round2 = (value: number): number => Math.round(value * 100) / 100;
const pad4 = (value: number): string => String(value).padStart(4, '0');
const todayIso = (): IsoDate => new Date().toISOString().slice(0, 10);
const safeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);

// Postgres unique_violation, as surfaced by TypeORM's QueryFailedError.
const isUniqueViolation = (cause: unknown): boolean => {
  const driverError = (cause as { readonly driverError?: { readonly code?: string } }).driverError;
  return driverError?.code === '23505';
};

// The employee expense-claim domain: categories, claims and lines, with
// approval riding the shared workflow engine and reimbursement flowing either
// directly or as a payroll `reimbursement` adjustment. Billable lines can be
// pushed onto the client's expenses invoice through the billing published
// method — this module never reads billing tables itself.
@Injectable()
export class ExpenseClaimService {
  constructor(
    @Inject(EXPENSE_CATEGORY_REPOSITORY)
    private readonly categories: TenantScopedRepository<ExpenseCategory>,
    @Inject(EXPENSE_CLAIM_REPOSITORY)
    private readonly claims: TenantScopedRepository<ExpenseClaim>,
    @Inject(EXPENSE_CLAIM_LINE_REPOSITORY)
    private readonly lines: TenantScopedRepository<ExpenseClaimLine>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly platformScope: PlatformScopeService,
    private readonly workflow: WorkflowService,
    private readonly storage: StorageService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly organizations: OrganizationService,
    private readonly compensation: CompensationService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
  ) {}

  // --- Categories ---

  // Config-as-data with usable defaults: the first read seeds the standard
  // vocabulary so a workspace can claim without a setup step.
  async listCategories(): Promise<ExpenseCategory[]> {
    await this.ensureDefaultCategories();
    return this.categories.find({
      order: { name: 'ASC' },
      where: { isActive: true } as FindOptionsWhere<ExpenseCategory>,
    });
  }

  async createCategory(input: CreateCategoryData): Promise<ExpenseCategory> {
    const code = input.code.trim().toUpperCase().slice(0, 32);
    if (code.length === 0) {
      throw new ValidationFailedError('code is required');
    }
    const existing = await this.categories.findOne({
      where: { code } as FindOptionsWhere<ExpenseCategory>,
    });
    if (existing) {
      throw new ConflictError('An expense category with this code already exists', { code });
    }
    const saved = await this.categories.save(
      this.categories.create({
        code,
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 300) ?? null,
        requiresReceipt: input.requiresReceipt ?? false,
        billableToClient: input.billableToClient ?? false,
        isActive: true,
      }),
    );
    await this.audit.record({
      action: 'create',
      resourceType: 'expense_category',
      resourceId: saved.id,
      after: { code: saved.code, name: saved.name },
    });
    return saved;
  }

  async updateCategory(input: UpdateCategoryData): Promise<ExpenseCategory> {
    const category = await this.categories.findById(input.categoryId);
    if (!category) {
      throw new NotFoundError('Expense category not found', { id: input.categoryId });
    }
    if (input.name !== undefined) category.name = input.name.trim().slice(0, 120);
    if (input.description !== undefined) {
      category.description = input.description?.trim().slice(0, 300) ?? null;
    }
    if (input.requiresReceipt !== undefined) category.requiresReceipt = input.requiresReceipt;
    if (input.billableToClient !== undefined) category.billableToClient = input.billableToClient;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    const saved = await this.categories.save(category);
    await this.audit.record({
      action: 'update',
      resourceType: 'expense_category',
      resourceId: saved.id,
      after: {
        name: saved.name,
        requiresReceipt: saved.requiresReceipt,
        billableToClient: saved.billableToClient,
        isActive: saved.isActive,
      },
    });
    return saved;
  }

  private async ensureDefaultCategories(): Promise<void> {
    const count = await this.categories.count();
    if (count > 0) {
      return;
    }
    for (const category of DEFAULT_CATEGORIES) {
      try {
        await this.categories.save(
          this.categories.create({
            code: category.code,
            name: category.name,
            description: null,
            requiresReceipt: category.requiresReceipt ?? false,
            billableToClient: category.billableToClient ?? false,
            isActive: true,
          }),
        );
      } catch (cause) {
        // Two concurrent first reads can race past the count; the unique index
        // on (organizationId, code) rejects the loser. That is benign — the
        // winner's row is the same seed.
        if (!isUniqueViolation(cause)) {
          throw cause;
        }
      }
    }
  }

  // --- Claims ---

  async listClaims(status?: ExpenseClaimStatus): Promise<ExpenseClaim[]> {
    return this.claims.find({
      where: (status ? { status } : {}) as FindOptionsWhere<ExpenseClaim>,
      order: { createdAt: 'DESC' },
    });
  }

  async listClaimDetails(status?: ExpenseClaimStatus): Promise<ExpenseClaimDetail[]> {
    return this.hydrateClaims(await this.listClaims(status));
  }

  async listMyClaims(employeeId: EmployeeId): Promise<ExpenseClaimDetail[]> {
    const claims = await this.claims.find({
      where: { employeeId } as FindOptionsWhere<ExpenseClaim>,
      order: { createdAt: 'DESC' },
    });
    return this.hydrateClaims(claims);
  }

  async getClaimDetail(claimId: string): Promise<ExpenseClaimDetail> {
    const claim = await this.claims.findById(claimId);
    if (!claim) {
      throw new NotFoundError('Expense claim not found', { id: claimId });
    }
    const [detail] = await this.hydrateClaims([claim]);
    return detail;
  }

  // The cross-workspace board: one read across every client workspace plus the
  // operator's own, guarded and audited per workspace switch (same shape as the
  // hiring-request board).
  async listClientClaims(): Promise<ExpenseClaimRecord[]> {
    const operator = await this.platformScope.assertOperator(PERMISSIONS.platformReadAll);
    const clientOrganizationIds = await this.platformScope.listClientOrganizationIds();
    const organizationIds = [
      operator.organizationId,
      ...clientOrganizationIds.filter((id) => id !== operator.organizationId),
    ];
    const records: ExpenseClaimRecord[] = [];
    for (const organizationId of organizationIds) {
      const organization = await this.organizations.getById(organizationId);
      const tenantDetails = await this.platformScope.switchTo(
        {
          organizationId,
          purpose: 'expense claim board read',
          resourceType: 'expense_claim',
          resourceId: organizationId,
        },
        () => this.listAllClaimDetails(),
      );
      for (const detail of tenantDetails) {
        records.push({
          ...detail,
          organizationId,
          organizationName: organization?.displayName ?? 'Unknown workspace',
        });
      }
    }
    return records.sort(
      (left, right) => right.claim.createdAt.getTime() - left.claim.createdAt.getTime(),
    );
  }

  private async listAllClaimDetails(): Promise<ExpenseClaimDetail[]> {
    const claims = await this.claims.find({ order: { createdAt: 'DESC' } });
    return this.hydrateClaims(claims);
  }

  private async hydrateClaims(claims: readonly ExpenseClaim[]): Promise<ExpenseClaimDetail[]> {
    if (claims.length === 0) {
      return [];
    }
    const claimIds = claims.map((claim) => claim.id);
    const lines = await this.lines.find({
      where: { claimId: In(claimIds) } as FindOptionsWhere<ExpenseClaimLine>,
      order: { expenseDate: 'ASC', createdAt: 'ASC' },
    });
    const categories = await this.categories.find({
      where: { id: In([...new Set(lines.map((line) => line.categoryId))]) } as FindOptionsWhere<ExpenseCategory>,
    });
    const categoryNameByCategoryId = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const details: ExpenseClaimDetail[] = [];
    for (const claim of claims) {
      const employee = await this.employeeDirectory.getById(claim.employeeId);
      details.push({
        claim,
        lines: lines.filter((line) => line.claimId === claim.id),
        employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
        categoryNameByCategoryId,
      });
    }
    return details;
  }

  async createDraft(input: {
    readonly employeeId: EmployeeId;
    readonly purpose: string;
    readonly currency?: string;
  }): Promise<ExpenseClaim> {
    const employee = await this.employeeDirectory.getById(input.employeeId);
    if (!employee) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const saved = await this.claims.save(
      this.claims.create({
        employeeId: input.employeeId,
        purpose: input.purpose.trim().slice(0, 300),
        status: 'draft',
        currency: (input.currency ?? 'PKR').trim().toUpperCase().slice(0, 3),
        totalAmount: '0',
        billableAmount: '0',
      }),
    );
    await this.audit.record({
      action: 'create',
      resourceType: 'expense_claim',
      resourceId: saved.id,
      after: { employeeId: saved.employeeId, purpose: saved.purpose },
    });
    return saved;
  }

  async addLine(
    claimId: string,
    input: ExpenseLineData,
    actor: ExpenseActor,
  ): Promise<ExpenseClaimLine> {
    const claim = await this.loadEditableClaim(claimId, actor);
    const category = await this.loadCategory(input.categoryId);
    await this.assertReceipt(category, input.receipt);
    const saved = await this.lines.save(
      this.lines.create({
        claimId: claim.id,
        categoryId: category.id,
        expenseDate: input.expenseDate,
        description: input.description.trim().slice(0, 200),
        amount: toMoneyString(input.amount),
        receiptStorageKey: input.receipt?.storageKey ?? null,
        receiptFileName: input.receipt?.fileName ?? null,
        receiptContentType: input.receipt?.contentType ?? null,
        receiptSizeBytes: input.receipt ? String(input.receipt.sizeBytes) : null,
      }),
    );
    await this.recomputeTotals(claim.id);
    return saved;
  }

  async updateLine(
    lineId: string,
    input: Partial<ExpenseLineData>,
    actor: ExpenseActor,
  ): Promise<ExpenseClaimLine> {
    const line = await this.loadLine(lineId);
    const claim = await this.loadEditableClaim(line.claimId, actor);
    if (input.categoryId !== undefined) {
      const category = await this.loadCategory(input.categoryId);
      line.categoryId = category.id;
    }
    if (input.expenseDate !== undefined) line.expenseDate = input.expenseDate;
    if (input.description !== undefined) {
      line.description = input.description.trim().slice(0, 200);
    }
    if (input.amount !== undefined) line.amount = toMoneyString(input.amount);
    if (input.receipt !== undefined) {
      const category = await this.loadCategory(line.categoryId);
      await this.assertReceipt(category, input.receipt);
      line.receiptStorageKey = input.receipt?.storageKey ?? null;
      line.receiptFileName = input.receipt?.fileName ?? null;
      line.receiptContentType = input.receipt?.contentType ?? null;
      line.receiptSizeBytes = input.receipt ? String(input.receipt.sizeBytes) : null;
    } else {
      // Category may have flipped to receipt-mandatory; re-check the stored one.
      const category = await this.loadCategory(line.categoryId);
      if (category.requiresReceipt && !line.receiptStorageKey) {
        throw new ValidationFailedError('This category requires a receipt');
      }
    }
    const saved = await this.lines.save(line);
    await this.recomputeTotals(claim.id);
    return saved;
  }

  async removeLine(lineId: string, actor: ExpenseActor): Promise<void> {
    const line = await this.loadLine(lineId);
    const claim = await this.loadEditableClaim(line.claimId, actor);
    await this.dataSource.transaction(async (manager) => {
      await manager.remove(line);
      await this.recomputeTotalsWithin(manager, claim.id);
    });
  }

  // Submitting assigns the human number and opens the workflow approval.
  async submitClaim(claimId: string, actor: ExpenseActor): Promise<ExpenseClaim> {
    const claim = await this.loadEditableClaim(claimId, actor);
    const lines = await this.lines.find({
      where: { claimId: claim.id } as FindOptionsWhere<ExpenseClaimLine>,
    });
    if (lines.length === 0) {
      throw new ValidationFailedError('Cannot submit a claim with no lines');
    }
    return this.assignNumberAndSubmit(claim, actor.userId);
  }

  private async assignNumberAndSubmit(claim: ExpenseClaim, userId: UserId): Promise<ExpenseClaim> {
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const sequence = await this.claims.count();
        claim.claimNumber = `EXP-${pad4(sequence + 1)}`;
        claim.status = 'submitted';
        claim.submittedAt = new Date();
        const saved = await this.claims.save(claim);
        const approval = await this.workflow.requestApproval({
          subjectType: 'expenseClaim',
          subjectId: saved.id,
          requestedByUserId: userId,
        });
        saved.approvalRequestId = approval.id;
        const withApproval = await this.claims.save(saved);
        await this.audit.record({
          action: 'submit',
          resourceType: 'expense_claim',
          resourceId: withApproval.id,
          after: { claimNumber: withApproval.claimNumber, total: Number(withApproval.totalAmount) },
        });
        return withApproval;
      } catch (cause) {
        if (attempt >= maxAttempts || !isUniqueViolation(cause)) {
          throw cause;
        }
      }
    }
  }

  async cancelClaim(claimId: string, actor: ExpenseActor): Promise<ExpenseClaim> {
    const claim = await this.loadVisibleClaim(claimId, actor);
    if (claim.status !== 'draft' && claim.status !== 'submitted') {
      throw new ConflictError(`A ${claim.status} claim cannot be cancelled`);
    }
    claim.status = 'cancelled';
    const saved = await this.claims.save(claim);
    await this.audit.record({
      action: 'cancel',
      resourceType: 'expense_claim',
      resourceId: saved.id,
      after: { claimNumber: saved.claimNumber },
    });
    return saved;
  }

  // Approver side: the workflow decision is recorded first, then the claim
  // reflects it. `sourceOrganizationId` lets the Tethr board act on a client's
  // workspace through the audited platform switch.
  async decideClaim(
    claimId: string,
    decision: 'approved' | 'rejected',
    note: string | null,
    userId: UserId,
    sourceOrganizationId?: string | null,
  ): Promise<ExpenseClaim> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (sourceOrganizationId && sourceOrganizationId !== organizationId) {
      await this.platformScope.assertOperator(PERMISSIONS.platformReadAll);
      return this.platformScope.switchTo(
        {
          organizationId: toId<OrganizationId>(sourceOrganizationId),
          purpose: 'expense claim decision',
          resourceType: 'expense_claim',
          resourceId: claimId,
        },
        () => this.decideClaim(claimId, decision, note, userId, null),
      );
    }
    const claim = await this.claims.findById(claimId);
    if (!claim) {
      throw new NotFoundError('Expense claim not found', { id: claimId });
    }
    if (claim.status !== 'submitted') {
      throw new ConflictError(`Only submitted claims can be decided (status: ${claim.status})`);
    }
    if (claim.approvalRequestId) {
      await this.workflow.decide(claim.approvalRequestId, userId, decision, note ?? undefined);
    }
    claim.status = decision;
    claim.decidedByUserId = userId;
    claim.decidedAt = new Date();
    claim.decisionNote = note?.slice(0, 300) ?? null;
    const saved = await this.claims.save(claim);
    await this.audit.record({
      action: decision === 'approved' ? 'approve' : 'reject',
      resourceType: 'expense_claim',
      resourceId: saved.id,
      after: { claimNumber: saved.claimNumber, note: saved.decisionNote },
    });
    return saved;
  }

  // Reimbursement: `direct` records the payment; `payroll` schedules an earning
  // adjustment for a chosen period and keeps the adjustment id, so the payslip
  // line traces back to this claim.
  async markReimbursed(
    claimId: string,
    input: MarkClaimReimbursedData,
    sourceOrganizationId?: string | null,
  ): Promise<ExpenseClaim> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (sourceOrganizationId && sourceOrganizationId !== organizationId) {
      await this.platformScope.assertOperator(PERMISSIONS.platformReadAll);
      return this.platformScope.switchTo(
        {
          organizationId: toId<OrganizationId>(sourceOrganizationId),
          purpose: 'expense claim reimbursement',
          resourceType: 'expense_claim',
          resourceId: claimId,
        },
        () => this.markReimbursed(claimId, input, null),
      );
    }
    const claim = await this.claims.findById(claimId);
    if (!claim) {
      throw new NotFoundError('Expense claim not found', { id: claimId });
    }
    if (claim.status !== 'approved') {
      throw new ConflictError(`Only approved claims can be reimbursed (status: ${claim.status})`);
    }
    if (input.method === 'payroll') {
      if (!input.componentId || !input.periodYear || !input.periodMonth) {
        throw new ValidationFailedError(
          'Payroll reimbursement needs a componentId and a pay period',
        );
      }
      const adjustment = await this.compensation.createAdjustment({
        employeeId: claim.employeeId,
        componentId: toId<PayComponentId>(input.componentId),
        amount: Number(claim.totalAmount),
        currency: claim.currency,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        kind: 'reimbursement',
        sourceType: 'expenseClaim',
        sourceId: claim.id,
        note: `Expense claim ${claim.claimNumber ?? claim.id}`,
      });
      claim.payrollAdjustmentId = adjustment.id;
      claim.reimbursementPeriodYear = input.periodYear;
      claim.reimbursementPeriodMonth = input.periodMonth;
      claim.reimbursementReference = input.paymentReference ?? null;
    } else {
      claim.reimbursementReference = input.paymentReference?.slice(0, 120) ?? null;
    }
    claim.reimbursementMethod = input.method;
    claim.reimbursedAt = new Date();
    claim.status = 'paid';
    const saved = await this.claims.save(claim);
    await this.audit.record({
      action: 'reimburse',
      resourceType: 'expense_claim',
      resourceId: saved.id,
      after: {
        claimNumber: saved.claimNumber,
        method: saved.reimbursementMethod,
        total: Number(saved.totalAmount),
        payrollAdjustmentId: saved.payrollAdjustmentId,
      },
    });
    return saved;
  }

  // Billable lines ride the client's expenses invoice through the billing
  // published method; the claim keeps the invoice id for the audit trail.
  async billToClient(
    claimId: string,
    serviceYear: number,
    serviceMonth: number,
    sourceOrganizationId?: string | null,
  ): Promise<{ readonly claim: ExpenseClaim; readonly invoiceId: string; readonly addedLines: number }> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (sourceOrganizationId && sourceOrganizationId !== organizationId) {
      await this.platformScope.assertOperator(PERMISSIONS.platformReadAll);
      return this.platformScope.switchTo(
        {
          organizationId: toId<OrganizationId>(sourceOrganizationId),
          purpose: 'expense claim client billing',
          resourceType: 'expense_claim',
          resourceId: claimId,
        },
        () => this.billToClient(claimId, serviceYear, serviceMonth, null),
      );
    }
    const claim = await this.claims.findById(claimId);
    if (!claim) {
      throw new NotFoundError('Expense claim not found', { id: claimId });
    }
    if (claim.status !== 'approved' && claim.status !== 'paid') {
      throw new ConflictError(`Only approved or paid claims can be billed (status: ${claim.status})`);
    }
    if (claim.billedInvoiceId) {
      throw new ConflictError('This claim is already billed to the client', {
        invoiceId: claim.billedInvoiceId,
      });
    }
    if (Number(claim.billableAmount) <= 0) {
      throw new ValidationFailedError('This claim has no client-billable lines');
    }
    const lines = await this.lines.find({
      where: { claimId: claim.id } as FindOptionsWhere<ExpenseClaimLine>,
      order: { expenseDate: 'ASC' },
    });
    const categories = await this.categories.find({
      where: { id: In([...new Set(lines.map((line) => line.categoryId))]) } as FindOptionsWhere<ExpenseCategory>,
    });
    const billableCategories = new Map(
      categories.filter((category) => category.billableToClient).map((category) => [category.id, category]),
    );
    const billableLines = lines.filter((line) => billableCategories.has(line.categoryId));
    if (billableLines.length === 0) {
      throw new ValidationFailedError('This claim has no client-billable lines');
    }
    const result = await this.invoices.addExpenseClaimLines({
      employeeId: claim.employeeId,
      serviceYear,
      serviceMonth,
      sourceLabel: claim.claimNumber ?? claim.id,
      lines: billableLines.map((line) => ({
        description: `${billableCategories.get(line.categoryId)?.name ?? 'Expense'}: ${line.description}`,
        amount: Number(line.amount),
      })),
    });
    claim.billedInvoiceId = result.invoice.id;
    claim.billedAt = new Date();
    const saved = await this.claims.save(claim);
    await this.audit.record({
      action: 'billToClient',
      resourceType: 'expense_claim',
      resourceId: saved.id,
      after: {
        claimNumber: saved.claimNumber,
        invoiceId: result.invoice.id,
        addedLines: result.addedLines,
      },
    });
    return { claim: saved, invoiceId: result.invoice.id, addedLines: result.addedLines };
  }

  // --- Receipts ---

  async prepareReceiptUpload(input: {
    readonly fileName: string;
    readonly contentType: string;
  }): Promise<{
    readonly storageKey: string;
    readonly url: string;
    readonly method: 'PUT';
    readonly expiresAt: Date;
    readonly headers: readonly StorageAccessHeader[];
  }> {
    const organizationId = this.tenantContext.getOrganizationId();
    const storageKey = `expense-receipts/${organizationId}/${todayIso()}/${randomUUID()}-${safeSegment(
      input.fileName,
    )}`;
    const signed = await this.storage.createSignedUpload({
      storageKey,
      contentType: input.contentType,
    });
    return {
      storageKey: signed.storageKey,
      url: signed.url,
      method: 'PUT',
      expiresAt: signed.expiresAt,
      headers: signed.headers,
    };
  }

  async getReceiptUrl(lineId: string, actor: ExpenseActor): Promise<string> {
    const line = await this.loadLine(lineId);
    const claim = await this.loadVisibleClaim(line.claimId, actor);
    void claim;
    if (!line.receiptStorageKey) {
      throw new NotFoundError('This line has no receipt');
    }
    const signed = await this.storage.createSignedDownload({
      storageKey: line.receiptStorageKey,
      contentType: line.receiptContentType ?? 'application/octet-stream',
    });
    return signed.url;
  }

  // A receipt must be a real object the caller uploaded into this tenant's
  // prefix, at the size it claims — otherwise a line could point at any object
  // in the bucket.
  private async assertReceipt(
    category: ExpenseCategory,
    receipt: ExpenseReceiptData | null | undefined,
  ): Promise<void> {
    if (!receipt) {
      if (category.requiresReceipt) {
        throw new ValidationFailedError(`A receipt is required for ${category.name}`);
      }
      return;
    }
    const organizationId = this.tenantContext.getOrganizationId();
    if (!receipt.storageKey.startsWith(`expense-receipts/${organizationId}/`)) {
      throw new ValidationFailedError('Receipt does not belong to this workspace');
    }
    const info = await this.storage.statObject(receipt.storageKey);
    if (!info) {
      throw new ValidationFailedError('Receipt upload was not found');
    }
    if (info.sizeBytes !== receipt.sizeBytes) {
      throw new ValidationFailedError('Receipt size does not match the uploaded object', {
        expected: receipt.sizeBytes,
        actual: info.sizeBytes,
      });
    }
  }

  // --- internals ---

  private async loadCategory(categoryId: string): Promise<ExpenseCategory> {
    const category = await this.categories.findById(categoryId);
    if (!category || !category.isActive) {
      throw new NotFoundError('Expense category not found', { id: categoryId });
    }
    return category;
  }

  private async loadLine(lineId: string): Promise<ExpenseClaimLine> {
    const line = await this.lines.findById(lineId);
    if (!line) {
      throw new NotFoundError('Expense claim line not found', { id: lineId });
    }
    return line;
  }

  private async loadVisibleClaim(claimId: string, actor: ExpenseActor): Promise<ExpenseClaim> {
    const claim = await this.claims.findById(claimId);
    if (
      !claim ||
      (!actor.canManage && (!actor.employeeId || claim.employeeId !== actor.employeeId))
    ) {
      // A self-service caller never learns that another employee's claim exists.
      throw new NotFoundError('Expense claim not found', { id: claimId });
    }
    return claim;
  }

  private async loadEditableClaim(claimId: string, actor: ExpenseActor): Promise<ExpenseClaim> {
    const claim = await this.loadVisibleClaim(claimId, actor);
    if (claim.status !== 'draft') {
      throw new ConflictError(`Only draft claims can be edited (status: ${claim.status})`);
    }
    return claim;
  }

  // Totals are always server-derived from the lines; billableAmount tracks only
  // categories flagged for client recovery.
  private async recomputeTotals(claimId: string): Promise<void> {
    await this.dataSource.transaction((manager) => this.recomputeTotalsWithin(manager, claimId));
  }

  private async recomputeTotalsWithin(
    manager: DataSource['manager'],
    claimId: string,
  ): Promise<void> {
    const lines = await manager.find(ExpenseClaimLine, {
      where: { claimId } as FindOptionsWhere<ExpenseClaimLine>,
    });
    const categories = await manager.find(ExpenseCategory, {
      where: {
        id: In([...new Set(lines.map((line) => line.categoryId))]),
      } as FindOptionsWhere<ExpenseCategory>,
    });
    const billableIds = new Set(
      categories.filter((category) => category.billableToClient).map((category) => category.id),
    );
    const total = round2(lines.reduce((sum, line) => sum + Number(line.amount), 0));
    const billable = round2(
      lines
        .filter((line) => billableIds.has(line.categoryId))
        .reduce((sum, line) => sum + Number(line.amount), 0),
    );
    const claim = await manager.findOne(ExpenseClaim, {
      where: { id: claimId } as FindOptionsWhere<ExpenseClaim>,
    });
    if (!claim) {
      throw new NotFoundError('Expense claim not found', { id: claimId });
    }
    claim.totalAmount = toMoneyString(total);
    claim.billableAmount = toMoneyString(billable);
    await manager.save(claim);
  }
}
