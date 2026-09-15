import {
  toId,
  type BonusReason,
  type CompensationChangeReason,
  type EmployeeId,
  type GradeId,
  type IsoDate,
  type OrganizationId,
  type PayComponentCategory,
  type PayComponentId,
  type PayFrequency,
  type SalaryStructureId,
  type StructureComponentCalcType,
  type UserId,
} from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../../common/errors';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSIONS } from '../../../core/authz/permissions';
import { PermissionsGuard } from '../../../core/authz/permissions.guard';
import { RequirePermissions } from '../../../core/authz/require-permissions.decorator';
import { PlatformScopeService } from '../../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { CompensationService } from './compensation.service';
import { AwardBonusInput } from './dto/award-bonus.input';
import { BonusAwardView } from './dto/bonus-award.output';
import { CreatePayAdjustmentInput } from './dto/create-pay-adjustment.input';
import { CreatePayComponentInput } from './dto/create-pay-component.input';
import { CreateSalaryStructureInput } from './dto/create-salary-structure.input';
import { EmployeeTaxProfileView } from './dto/employee-tax-profile.output';
import { PayAdjustmentView } from './dto/pay-adjustment.output';
import { PayComponentView } from './dto/pay-component.output';
import { ReviseSalaryInput } from './dto/revise-salary.input';
import { SalaryRevisionView } from './dto/salary-revision.output';
import { SalaryStructureView } from './dto/salary-structure.output';
import { SetEmployeeTaxProfileInput } from './dto/set-employee-tax-profile.input';
import {
  StructureComponentInput,
} from './dto/structure-component.input';
import { SalaryStructureComponentView } from './dto/structure-component.output';
import { BonusAward } from './entities/bonus-award.entity';
import { EmployeeTaxProfile } from './entities/employee-tax-profile.entity';
import { PayAdjustment, type PayAdjustmentKind } from './entities/pay-adjustment.entity';
import { PayComponent } from './entities/pay-component.entity';
import { SalaryRevision } from './entities/salary-revision.entity';
import { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import { SalaryStructure } from './entities/salary-structure.entity';

const toPayComponentView = (component: PayComponent): PayComponentView => ({
  id: component.id,
  name: component.name,
  code: component.code,
  category: component.category,
  taxable: component.taxable,
  recurring: component.recurring,
  dependsOnPaymentDays: component.dependsOnPaymentDays,
});

const toTaxProfileView = (profile: EmployeeTaxProfile): EmployeeTaxProfileView => ({
  id: profile.id,
  employeeId: profile.employeeId,
  filerStatus: profile.filerStatus,
  monthlyExemptionAmount: Number(profile.monthlyExemptionAmount),
  annualTaxCreditAmount: Number(profile.annualTaxCreditAmount),
  priorAnnualIncome: Number(profile.priorAnnualIncome),
  fixedMonthlyWithholding:
    profile.fixedMonthlyWithholding === null ? null : Number(profile.fixedMonthlyWithholding),
  note: profile.note,
  validFrom: profile.validFrom,
  validTo: profile.validTo,
});

const toSalaryStructureView = (structure: SalaryStructure): SalaryStructureView => ({
  id: structure.id,
  name: structure.name,
  code: structure.code,
  gradeId: structure.gradeId,
  defaultAnnualAmount:
    structure.defaultAnnualAmount === null ? null : Number(structure.defaultAnnualAmount),
  currency: structure.currency,
  payFrequency: structure.payFrequency,
  isActive: structure.isActive,
});

const toSalaryRevisionView = (revision: SalaryRevision): SalaryRevisionView => ({
  id: revision.id,
  employeeId: revision.employeeId,
  salaryStructureId: revision.salaryStructureId,
  validFrom: revision.validFrom,
  validTo: revision.validTo,
  currency: revision.currency,
  annualAmount: Number(revision.annualAmount),
  reason: revision.reason,
  approvedByUserId: revision.approvedByUserId,
  note: revision.note,
});

const toBonusAwardView = (bonus: BonusAward): BonusAwardView => ({
  id: bonus.id,
  employeeId: bonus.employeeId,
  awardDate: bonus.awardDate,
  currency: bonus.currency,
  amount: Number(bonus.amount),
  reason: bonus.reason,
  approvedByUserId: bonus.approvedByUserId,
  note: bonus.note,
});

const toPayAdjustmentView = (adjustment: PayAdjustment): PayAdjustmentView => ({
  id: adjustment.id,
  employeeId: adjustment.employeeId,
  componentId: adjustment.componentId,
  amount: Number(adjustment.amount),
  currency: adjustment.currency,
  periodYear: adjustment.periodYear,
  periodMonth: adjustment.periodMonth,
  kind: adjustment.kind,
  sourceType: adjustment.sourceType,
  sourceId: adjustment.sourceId,
  overwritesStructureAmount: adjustment.overwritesStructureAmount,
  isRecurring: adjustment.isRecurring,
  recurringFrom: adjustment.recurringFrom,
  recurringTo: adjustment.recurringTo,
  note: adjustment.note,
});

const toStructureComponentView = (
  component: SalaryStructureComponent,
): SalaryStructureComponentView => ({  id: component.id,
  structureId: component.structureId,
  componentId: component.componentId,
  calcType: component.calcType,
  value: Number(component.value),
  sortOrder: component.sortOrder,
});

@Resolver(() => SalaryRevisionView)
export class CompensationResolver {
  constructor(
    private readonly compensationService: CompensationService,
    private readonly authService: AuthService,
    private readonly platformScope: PlatformScopeService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  @Query(() => [PayComponentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async payComponents(
    @Args('organizationId', { type: () => ID, nullable: true }) organizationId?: string,
  ): Promise<PayComponentView[]> {
    // The Tethr expense board needs a client workspace's components to schedule
    // a cross-workspace reimbursement; that read crosses the platform boundary
    // under the audited operator switch (platformReadAll is Tethr-only).
    if (organizationId && organizationId !== this.tenantContextService.getOrganizationId()) {
      await this.platformScope.assertOperator(PERMISSIONS.platformReadAll);
      return this.platformScope.switchTo(
        {
          organizationId: toId<OrganizationId>(organizationId),
          purpose: 'pay components read',
          resourceType: 'pay_component',
          resourceId: organizationId,
        },
        async () => (await this.compensationService.listPayComponents()).map(toPayComponentView),
      );
    }
    return (await this.compensationService.listPayComponents()).map(toPayComponentView);
  }

  @Mutation(() => PayComponentView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async createPayComponent(
    @Args('input') input: CreatePayComponentInput,
  ): Promise<PayComponentView> {
    const component = await this.compensationService.createPayComponent({
      name: input.name,
      code: input.code,
      category: input.category as PayComponentCategory,
      taxable: input.taxable,
      recurring: input.recurring,
      dependsOnPaymentDays: input.dependsOnPaymentDays,
    });
    return toPayComponentView(component);
  }

  @Query(() => [SalaryStructureView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async salaryStructures(): Promise<SalaryStructureView[]> {
    return (await this.compensationService.listSalaryStructures()).map(toSalaryStructureView);
  }

  @Mutation(() => SalaryStructureView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async createSalaryStructure(
    @Args('input') input: CreateSalaryStructureInput,
  ): Promise<SalaryStructureView> {
    const structure = await this.compensationService.createSalaryStructure({
      name: input.name,
      code: input.code,
      gradeId: input.gradeId ? toId<GradeId>(input.gradeId) : null,
      defaultAnnualAmount: input.defaultAnnualAmount ?? null,
      currency: input.currency,
      payFrequency: input.payFrequency as PayFrequency | undefined,
    });
    return toSalaryStructureView(structure);
  }

  @Query(() => [SalaryStructureComponentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async salaryStructureComponents(
    @Args('structureId', { type: () => ID }) structureId: string,
  ): Promise<SalaryStructureComponentView[]> {
    const rows = await this.compensationService.listSalaryStructureComponents(
      toId<SalaryStructureId>(structureId),
    );
    return rows.map(toStructureComponentView);
  }

  @Mutation(() => [SalaryStructureComponentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async setSalaryStructureComponents(
    @Args('structureId', { type: () => ID }) structureId: string,
    @Args('components', { type: () => [StructureComponentInput] })
    components: StructureComponentInput[],
  ): Promise<SalaryStructureComponentView[]> {
    const rows = await this.compensationService.setSalaryStructureComponents(
      toId<SalaryStructureId>(structureId),
      components.map((component) => ({
        componentId: toId<PayComponentId>(component.componentId),
        calcType: component.calcType as StructureComponentCalcType,
        value: component.value,
        sortOrder: component.sortOrder,
      })),
    );
    return rows.map(toStructureComponentView);
  }

  @Query(() => [SalaryRevisionView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async salaryRevisions(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<SalaryRevisionView[]> {
    const revisions = await this.compensationService.listSalaryRevisions(
      toId<EmployeeId>(employeeId),
    );
    return revisions.map(toSalaryRevisionView);
  }

  // --- Employee tax profiles ---

  @Query(() => [EmployeeTaxProfileView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async employeeTaxProfiles(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeTaxProfileView[]> {
    const profiles = await this.compensationService.listTaxProfiles(
      toId<EmployeeId>(employeeId),
    );
    return profiles.map(toTaxProfileView);
  }

  // The profile in force today; null when payroll falls back to the ladder.
  @Query(() => EmployeeTaxProfileView, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async employeeTaxProfile(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeTaxProfileView | null> {
    const profile = await this.compensationService.getTaxProfile(
      toId<EmployeeId>(employeeId),
      new Date().toISOString().slice(0, 10),
    );
    return profile ? toTaxProfileView(profile) : null;
  }

  @Mutation(() => EmployeeTaxProfileView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async setEmployeeTaxProfile(
    @Args('input') input: SetEmployeeTaxProfileInput,
  ): Promise<EmployeeTaxProfileView> {
    const profile = await this.compensationService.setTaxProfile({
      employeeId: toId<EmployeeId>(input.employeeId),
      effectiveDate: input.effectiveDate as IsoDate | undefined,
      filerStatus: input.filerStatus,
      monthlyExemptionAmount: input.monthlyExemptionAmount,
      annualTaxCreditAmount: input.annualTaxCreditAmount,
      priorAnnualIncome: input.priorAnnualIncome,
      fixedMonthlyWithholding: input.fixedMonthlyWithholding ?? null,
      note: input.note ?? null,
    });
    return toTaxProfileView(profile);
  }

  // Self-service read: the caller's own salary history ("your last raise,
  // effective when"). Identity comes from the session, never an argument.
  @Query(() => [SalaryRevisionView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationOwnRead)
  async mySalaryRevisions(): Promise<SalaryRevisionView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    const revisions = await this.compensationService.listSalaryRevisions(
      toId<EmployeeId>(user.employeeId),
    );
    return revisions.map(toSalaryRevisionView);
  }

  @Query(() => [BonusAwardView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationOwnRead)
  async myBonusAwards(): Promise<BonusAwardView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return (await this.compensationService.listBonusAwards(toId<EmployeeId>(user.employeeId))).map(
      toBonusAwardView,
    );
  }

  @Query(() => [PayAdjustmentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationOwnRead)
  async myPayAdjustments(): Promise<PayAdjustmentView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return (
      await this.compensationService.listAdjustmentsFor(toId<EmployeeId>(user.employeeId))
    ).map(toPayAdjustmentView);
  }

  @Query(() => SalaryRevisionView, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async currentSalaryRevision(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('asOf') asOf: string,
  ): Promise<SalaryRevisionView | null> {
    const revision = await this.compensationService.getCurrentSalaryRevision(
      toId<EmployeeId>(employeeId),
      asOf,
    );
    return revision ? toSalaryRevisionView(revision) : null;
  }

  @Mutation(() => SalaryRevisionView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async reviseSalary(@Args('input') input: ReviseSalaryInput): Promise<SalaryRevisionView> {
    const user = await this.authService.getCurrentUser();
    const revision = await this.compensationService.reviseSalary({
      employeeId: toId<EmployeeId>(input.employeeId),
      salaryStructureId: toId<SalaryStructureId>(input.salaryStructureId),
      effectiveDate: input.effectiveDate,
      annualAmount: input.annualAmount,
      reason: input.reason as CompensationChangeReason | undefined,
      approvedByUserId: input.approvedByUserId
        ? toId<UserId>(input.approvedByUserId)
        : toId<UserId>(user.id),
      note: input.note ?? null,
    });
    return toSalaryRevisionView(revision);
  }

  @Query(() => SalaryRevisionView, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationOwnRead)
  async myCurrentSalaryRevision(@Args('asOf') asOf: string): Promise<SalaryRevisionView | null> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    const revision = await this.compensationService.getCurrentSalaryRevision(user.employeeId, asOf);
    return revision ? toSalaryRevisionView(revision) : null;
  }

  @Query(() => [BonusAwardView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async bonusAwards(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<BonusAwardView[]> {
    return (await this.compensationService.listBonusAwards(toId<EmployeeId>(employeeId))).map(
      toBonusAwardView,
    );
  }

  @Mutation(() => BonusAwardView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.bonusManage)
  async awardBonus(@Args('input') input: AwardBonusInput): Promise<BonusAwardView> {
    const user = await this.authService.getCurrentUser();
    const bonus = await this.compensationService.awardBonus({
      employeeId: toId<EmployeeId>(input.employeeId),
      awardDate: input.awardDate,
      currency: input.currency,
      amount: input.amount,
      reason: input.reason as BonusReason,
      awardedByUserId: toId<UserId>(user.id),
      approvedByUserId: input.approvedByUserId ? toId<UserId>(input.approvedByUserId) : null,
      note: input.note ?? null,
    });
    return toBonusAwardView(bonus);
  }

  @Query(() => [PayAdjustmentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationRead)
  async payAdjustments(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<PayAdjustmentView[]> {
    return (await this.compensationService.listAdjustmentsFor(toId<EmployeeId>(employeeId))).map(
      toPayAdjustmentView,
    );
  }

  @Mutation(() => PayAdjustmentView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async createPayAdjustment(
    @Args('input') input: CreatePayAdjustmentInput,
  ): Promise<PayAdjustmentView> {
    const adjustment = await this.compensationService.createAdjustment({
      employeeId: toId<EmployeeId>(input.employeeId),
      componentId: toId<PayComponentId>(input.componentId),
      amount: input.amount,
      currency: input.currency,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      kind: input.kind as PayAdjustmentKind,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      overwritesStructureAmount: input.overwritesStructureAmount ?? false,
      isRecurring: input.isRecurring ?? false,
      recurringFrom: input.recurringFrom ?? null,
      recurringTo: input.recurringTo ?? null,
      note: input.note ?? null,
    });
    return toPayAdjustmentView(adjustment);
  }
}
