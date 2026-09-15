import { toId, type EmployeeId, type ExpenseClaimStatus, type IsoDate, type UserId } from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import {
  AddExpenseClaimLineInput,
  BillExpenseClaimArgs,
  CreateExpenseCategoryInput,
  CreateExpenseClaimInput,
  CreateMyExpenseClaimInput,
  DecideExpenseClaimArgs,
  MarkExpenseClaimReimbursedArgs,
  PrepareExpenseReceiptUploadInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseClaimLineInput,
} from './dto/expense.inputs';
import {
  BillExpenseClaimResultView,
  ExpenseCategoryView,
  ExpenseClaimView,
  ExpenseReceiptUploadView,
} from './dto/expense.view';
import type { ExpenseCategory } from './entities/expense-category.entity';
import type { ExpenseClaimLine } from './entities/expense-claim-line.entity';
import type {
  ExpenseActor,
  ExpenseClaimDetail,
  ExpenseClaimRecord,
} from './expense-claim.service';
import { ExpenseClaimService } from './expense-claim.service';

const toCategoryView = (category: ExpenseCategory): ExpenseCategoryView => ({
  id: category.id,
  code: category.code,
  name: category.name,
  description: category.description,
  requiresReceipt: category.requiresReceipt,
  billableToClient: category.billableToClient,
  isActive: category.isActive,
});

const toLineView = (line: ExpenseClaimLine, categoryName: string | null) => ({
  id: line.id,
  categoryId: line.categoryId,
  categoryName,
  expenseDate: line.expenseDate,
  description: line.description,
  amount: Number(line.amount),
  hasReceipt: line.receiptStorageKey !== null,
  receiptFileName: line.receiptFileName,
});

const toClaimView = (detail: ExpenseClaimDetail | ExpenseClaimRecord): ExpenseClaimView => {
  const record = detail as ExpenseClaimRecord;
  return {
    id: detail.claim.id,
    claimNumber: detail.claim.claimNumber,
    employeeId: detail.claim.employeeId,
    employeeName: detail.employeeName,
    organizationId: record.organizationId ?? null,
    organizationName: record.organizationName ?? null,
    purpose: detail.claim.purpose,
    status: detail.claim.status,
    currency: detail.claim.currency,
    totalAmount: Number(detail.claim.totalAmount),
    billableAmount: Number(detail.claim.billableAmount),
    submittedAt: detail.claim.submittedAt,
    decidedAt: detail.claim.decidedAt,
    decisionNote: detail.claim.decisionNote,
    reimbursementMethod: detail.claim.reimbursementMethod,
    reimbursedAt: detail.claim.reimbursedAt,
    reimbursementReference: detail.claim.reimbursementReference,
    reimbursementPeriodYear: detail.claim.reimbursementPeriodYear,
    reimbursementPeriodMonth: detail.claim.reimbursementPeriodMonth,
    billedInvoiceId: detail.claim.billedInvoiceId,
    createdAt: detail.claim.createdAt,
    lines: detail.lines.map((line) =>
      toLineView(line, detail.categoryNameByCategoryId.get(line.categoryId) ?? null),
    ),
  };
};

const toLineData = (input: AddExpenseClaimLineInput) => ({
  categoryId: input.categoryId,
  expenseDate: input.expenseDate as IsoDate,
  description: input.description,
  amount: input.amount,
  receipt: input.receipt ?? null,
});

const toLineUpdate = (input: UpdateExpenseClaimLineInput) => ({
  categoryId: input.categoryId,
  expenseDate: input.expenseDate as IsoDate | undefined,
  description: input.description,
  amount: input.amount,
  receipt:
    input.receipt === undefined ? undefined : (input.receipt ?? null),
});

@Resolver(() => ExpenseClaimView)
export class ExpensesResolver {
  constructor(
    private readonly claimService: ExpenseClaimService,
    private readonly authService: AuthService,
  ) {}

  private async selfActor(): Promise<ExpenseActor> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return {
      userId: toId<UserId>(user.id),
      employeeId: toId<EmployeeId>(user.employeeId),
      canManage: false,
    };
  }

  private async adminActor(): Promise<ExpenseActor> {
    const user = await this.authService.getCurrentUser();
    return { userId: toId<UserId>(user.id), employeeId: null, canManage: true };
  }

  // --- Categories (approvers/admins manage; employees read their own view) ---

  @Query(() => [ExpenseCategoryView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseRead)
  async expenseCategories(): Promise<ExpenseCategoryView[]> {
    return (await this.claimService.listCategories()).map(toCategoryView);
  }

  @Query(() => [ExpenseCategoryView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnRead)
  async myExpenseCategories(): Promise<ExpenseCategoryView[]> {
    return (await this.claimService.listCategories()).map(toCategoryView);
  }

  @Mutation(() => ExpenseCategoryView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async createExpenseCategory(
    @Args('input') input: CreateExpenseCategoryInput,
  ): Promise<ExpenseCategoryView> {
    return toCategoryView(await this.claimService.createCategory(input));
  }

  @Mutation(() => ExpenseCategoryView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async updateExpenseCategory(
    @Args('input') input: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategoryView> {
    return toCategoryView(await this.claimService.updateCategory(input));
  }

  // --- Claim reads ---

  @Query(() => [ExpenseClaimView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseRead)
  async expenseClaims(
    @Args('status', { type: () => String, nullable: true }) status?: string,
  ): Promise<ExpenseClaimView[]> {
    const details = await this.claimService.listClaimDetails(
      status as ExpenseClaimStatus | undefined,
    );
    return details.map(toClaimView);
  }

  // The Tethr cross-workspace board: platformReadAll is Tethr-only, so client
  // roles can never reach the operator read even if they hold expenseRead.
  @Query(() => [ExpenseClaimView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseRead, PERMISSIONS.platformReadAll)
  async clientExpenseClaims(): Promise<ExpenseClaimView[]> {
    return (await this.claimService.listClientClaims()).map(toClaimView);
  }

  @Query(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseRead)
  async expenseClaim(@Args('claimId', { type: () => ID }) claimId: string): Promise<ExpenseClaimView> {
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Query(() => [ExpenseClaimView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnRead)
  async myExpenseClaims(): Promise<ExpenseClaimView[]> {
    const actor = await this.selfActor();
    return (await this.claimService.listMyClaims(actor.employeeId as EmployeeId)).map(toClaimView);
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseRead)
  async expenseReceiptUrl(
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<string> {
    return this.claimService.getReceiptUrl(lineId, await this.adminActor());
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnRead)
  async myExpenseReceiptUrl(
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<string> {
    return this.claimService.getReceiptUrl(lineId, await this.selfActor());
  }

  // --- Claim writes (admin / HR path) ---

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async createExpenseClaim(
    @Args('input') input: CreateExpenseClaimInput,
  ): Promise<ExpenseClaimView> {
    const claim = await this.claimService.createDraft({
      employeeId: toId<EmployeeId>(input.employeeId),
      purpose: input.purpose,
      currency: input.currency,
    });
    return toClaimView(await this.claimService.getClaimDetail(claim.id));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async addExpenseClaimLine(
    @Args('claimId', { type: () => ID }) claimId: string,
    @Args('input') input: AddExpenseClaimLineInput,
  ): Promise<ExpenseClaimView> {
    await this.claimService.addLine(
      claimId,
      toLineData(input),
      await this.adminActor(),
    );
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async updateExpenseClaimLine(
    @Args('input') input: UpdateExpenseClaimLineInput,
  ): Promise<ExpenseClaimView> {
    const line = await this.claimService.updateLine(
      input.lineId,
      toLineUpdate(input),
      await this.adminActor(),
    );
    const detail = await this.claimService.getClaimDetail(line.claimId);
    return toClaimView(detail);
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async removeExpenseClaimLine(
    @Args('lineId', { type: () => ID }) lineId: string,
    @Args('claimId', { type: () => ID }) claimId: string,
  ): Promise<ExpenseClaimView> {
    await this.claimService.removeLine(lineId, await this.adminActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async submitExpenseClaim(
    @Args('claimId', { type: () => ID }) claimId: string,
  ): Promise<ExpenseClaimView> {
    await this.claimService.submitClaim(claimId, await this.adminActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async cancelExpenseClaim(
    @Args('claimId', { type: () => ID }) claimId: string,
  ): Promise<ExpenseClaimView> {
    await this.claimService.cancelClaim(claimId, await this.adminActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  // --- Approval & payout ---

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseApprove)
  async decideExpenseClaim(@Args() args: DecideExpenseClaimArgs): Promise<ExpenseClaimView> {
    const user = await this.authService.getCurrentUser();
    const claim = await this.claimService.decideClaim(
      args.claimId,
      args.decision,
      args.note ?? null,
      toId<UserId>(user.id),
      args.sourceOrganizationId ?? null,
    );
    return toClaimView(await this.claimService.getClaimDetail(claim.id));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expensePay)
  async markExpenseClaimReimbursed(
    @Args() args: MarkExpenseClaimReimbursedArgs,
  ): Promise<ExpenseClaimView> {
    const claim = await this.claimService.markReimbursed(
      args.claimId,
      {
        method: args.method,
        paymentReference: args.paymentReference ?? null,
        periodYear: args.periodYear ?? null,
        periodMonth: args.periodMonth ?? null,
        componentId: args.componentId ?? null,
      },
      args.sourceOrganizationId ?? null,
    );
    return toClaimView(await this.claimService.getClaimDetail(claim.id));
  }

  @Mutation(() => BillExpenseClaimResultView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expensePay, PERMISSIONS.billingWrite)
  async billExpenseClaimToClient(
    @Args() args: BillExpenseClaimArgs,
  ): Promise<BillExpenseClaimResultView> {
    const result = await this.claimService.billToClient(
      args.claimId,
      args.serviceYear,
      args.serviceMonth,
      args.sourceOrganizationId ?? null,
    );
    return {
      claim: toClaimView(await this.claimService.getClaimDetail(result.claim.id)),
      invoiceId: result.invoiceId,
      addedLines: result.addedLines,
    };
  }

  // --- Self-service (employee portal) ---

  @Mutation(() => ExpenseReceiptUploadView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async prepareMyExpenseReceiptUpload(
    @Args('input') input: PrepareExpenseReceiptUploadInput,
  ): Promise<ExpenseReceiptUploadView> {
    return this.prepareReceiptUpload(input);
  }

  @Mutation(() => ExpenseReceiptUploadView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseWrite)
  async prepareExpenseReceiptUpload(
    @Args('input') input: PrepareExpenseReceiptUploadInput,
  ): Promise<ExpenseReceiptUploadView> {
    return this.prepareReceiptUpload(input);
  }

  private async prepareReceiptUpload(
    input: PrepareExpenseReceiptUploadInput,
  ): Promise<ExpenseReceiptUploadView> {
    const upload = await this.claimService.prepareReceiptUpload(input);
    return {
      storageKey: upload.storageKey,
      url: upload.url,
      method: upload.method,
      expiresAt: upload.expiresAt.toISOString(),
      headers: upload.headers.map((header) => ({ name: header.name, value: header.value })),
    };
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async createMyExpenseClaim(
    @Args('input') input: CreateMyExpenseClaimInput,
  ): Promise<ExpenseClaimView> {
    const actor = await this.selfActor();
    const claim = await this.claimService.createDraft({
      employeeId: actor.employeeId as EmployeeId,
      purpose: input.purpose,
      currency: input.currency,
    });
    return toClaimView(await this.claimService.getClaimDetail(claim.id));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async addMyExpenseClaimLine(
    @Args('claimId', { type: () => ID }) claimId: string,
    @Args('input') input: AddExpenseClaimLineInput,
  ): Promise<ExpenseClaimView> {
    await this.claimService.addLine(claimId, toLineData(input), await this.selfActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async updateMyExpenseClaimLine(
    @Args('input') input: UpdateExpenseClaimLineInput,
  ): Promise<ExpenseClaimView> {
    const line = await this.claimService.updateLine(
      input.lineId,
      toLineUpdate(input),
      await this.selfActor(),
    );
    return toClaimView(await this.claimService.getClaimDetail(line.claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async removeMyExpenseClaimLine(
    @Args('lineId', { type: () => ID }) lineId: string,
    @Args('claimId', { type: () => ID }) claimId: string,
  ): Promise<ExpenseClaimView> {
    await this.claimService.removeLine(lineId, await this.selfActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async submitMyExpenseClaim(
    @Args('claimId', { type: () => ID }) claimId: string,
  ): Promise<ExpenseClaimView> {
    await this.claimService.submitClaim(claimId, await this.selfActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }

  @Mutation(() => ExpenseClaimView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.expenseOwnWrite)
  async cancelMyExpenseClaim(
    @Args('claimId', { type: () => ID }) claimId: string,
  ): Promise<ExpenseClaimView> {
    await this.claimService.cancelClaim(claimId, await this.selfActor());
    return toClaimView(await this.claimService.getClaimDetail(claimId));
  }
}
