import { toId, type EmployeeId, type HolidayCalendarId, type PayrollRunId, type TaxSlabGroupId } from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../../common/errors';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSIONS } from '../../../core/authz/permissions';
import { PermissionsGuard } from '../../../core/authz/permissions.guard';
import { RequirePermissions } from '../../../core/authz/require-permissions.decorator';
import { ConfigService } from '../../../core/config/config.service';

import { PayrollRunLineComponentView, PayrollRunView } from './dto/payroll-run.view';
import {
  CreatePayrollRunInput,
  CreateTaxSlabGroupInput,
  FinalizePayrollRunArgs,
  ReplaceTaxSlabsArgs,
  UpdatePayrollRunLineInput,
} from './dto/payroll.inputs';
import { PayslipView } from './dto/payslip.view';
import { TaxSlabGroupView, TaxSlabView } from './dto/tax-slab.view';
import { PayrollRun } from './entities/payroll-run.entity';
import type { PayslipLine } from './entities/payslip-line.entity';
import type { Payslip } from './entities/payslip.entity';
import { TaxSlab, TaxSlabGroup } from './entities/tax-slab.entities';
import type { RunDetail } from './payroll-run.service';
import { PayrollRunService } from './payroll-run.service';
import { PayslipPdfService } from './pdf/payslip-pdf.service';
import { TaxSlabService } from './tax-slab.service';

const toRunView = (run: PayrollRun): PayrollRunView => ({
  id: run.id,
  periodYear: run.periodYear,
  periodMonth: run.periodMonth,
  status: run.status,
  currency: run.currency,
  standardWorkingDays: run.standardWorkingDays,
  holidayCalendarId: run.holidayCalendarId,
  finalizedAt: run.finalizedAt,
});

const toPayslipView = (payslip: Payslip): PayslipView => ({
  id: payslip.id,
  runId: payslip.runId,
  employeeId: payslip.employeeId,
  payslipNumber: payslip.payslipNumber,
  periodYear: payslip.periodYear,
  periodMonth: payslip.periodMonth,
  payDate: payslip.payDate,
  currency: payslip.currency,
  employeeNumber: payslip.employeeNumber,
  employeeName: payslip.employeeName,
  roleTitle: payslip.roleTitle,
  hireDate: payslip.hireDate,
  paidDays: Number(payslip.paidDays),
  lopDays: Number(payslip.lopDays),
  grossAmount: Number(payslip.grossAmount),
  taxableAmount: Number(payslip.taxableAmount),
  incomeTaxAmount: Number(payslip.incomeTaxAmount),
  netPayAmount: Number(payslip.netPayAmount),
  notes: payslip.notes,
});

const toPayslipLineView = (line: PayslipLine) => ({
  id: line.id,
  componentCode: line.componentCode,
  componentName: line.componentName,
  category: line.category,
  taxable: line.taxable,
  amount: Number(line.amount),
});

const toTaxSlabGroupView = (group: TaxSlabGroup): TaxSlabGroupView => ({
  id: group.id,
  name: group.name,
  financialYearLabel: group.financialYearLabel,
  currency: group.currency,
  isActive: group.isActive,
});

const toTaxSlabView = (slab: TaxSlab): TaxSlabView => ({
  id: slab.id,
  groupId: slab.groupId,
  sortOrder: slab.sortOrder,
  upperBound: slab.upperBound === null ? null : Number(slab.upperBound),
  ratePercent: Number(slab.ratePercent),
  flatAdditive: Number(slab.flatAdditive),
});

const toRunDetailView = (detail: RunDetail): PayrollRunView => ({
  ...toRunView(detail.run),
  lines: detail.items.map((item) => ({
    id: item.line.id,
    runId: item.line.runId,
    employeeId: item.line.employeeId,
    displayName: item.displayName,
    payableDays: Number(item.line.payableDays),
    lopDays: Number(item.line.lopDays),
    grossAmount: Number(item.line.grossAmount),
    taxOverrideAmount:
      item.line.taxOverrideAmount === null ? null : Number(item.line.taxOverrideAmount),
    note: item.line.note,
    totalEarnings: item.derived.totalEarnings,
    taxableAmount: item.derived.taxableAmount,
    incomeTax: item.derived.incomeTax,
    netPayAmount: item.derived.netPayAmount,
    components: item.components.map(
      (component): PayrollRunLineComponentView => ({
        id: component.id,
        componentCode: component.componentCode,
        componentName: component.componentName,
        category: component.category,
        taxable: component.taxable,
        amount: Number(component.amount),
      }),
    ),
  })),
});

@Resolver(() => PayrollRunView)
export class PayrollResolver {
  constructor(
    private readonly runService: PayrollRunService,
    private readonly taxConfig: TaxSlabService,
    private readonly pdfService: PayslipPdfService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // --- Runs (finance) ---

  @Query(() => [PayrollRunView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollRead)
  async payrollRuns(): Promise<PayrollRunView[]> {
    return (await this.runService.listRuns()).map(toRunView);
  }

  @Query(() => PayrollRunView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollRead)
  async payrollRun(
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<PayrollRunView> {
    const detail = await this.runService.getRunDetail(toId<PayrollRunId>(runId));
    return toRunDetailView(detail);
  }

  @Mutation(() => PayrollRunView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollWrite)
  async createPayrollRun(@Args('input') input: CreatePayrollRunInput): Promise<PayrollRunView> {
    const run = await this.runService.createRun({
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      holidayCalendarId: input.holidayCalendarId
        ? toId<HolidayCalendarId>(input.holidayCalendarId)
        : null,
    });
    const detail = await this.runService.getRunDetail(run.id as PayrollRunId);
    return toRunDetailView(detail);
  }

  @Mutation(() => PayrollRunView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollWrite)
  async regeneratePayrollRun(
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<PayrollRunView> {
    const run = await this.runService.regenerateRun(toId<PayrollRunId>(runId));
    const detail = await this.runService.getRunDetail(run.id as PayrollRunId);
    return toRunDetailView(detail);
  }

  @Mutation(() => PayrollRunView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollWrite)
  async updatePayrollRunLine(
    @Args('input') input: UpdatePayrollRunLineInput,
  ): Promise<PayrollRunView> {
    const line = await this.runService.updateRunLine({
      lineId: input.lineId,
      payableDays: input.payableDays ?? null,
      lopDays: input.lopDays ?? null,
      taxOverrideAmount: input.taxOverrideAmount === undefined ? undefined : input.taxOverrideAmount,
      note: input.note === undefined ? undefined : input.note,
    });
    const detail = await this.runService.getRunDetail(line.runId as PayrollRunId);
    return toRunDetailView(detail);
  }

  @Mutation(() => PayrollRunView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollWrite)
  async removePayrollRunLine(
    @Args('lineId', { type: () => ID }) lineId: string,
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<PayrollRunView> {
    await this.runService.removeRunLine(lineId);
    const detail = await this.runService.getRunDetail(toId<PayrollRunId>(runId));
    return toRunDetailView(detail);
  }

  @Mutation(() => PayrollRunView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollFinalize)
  async finalizePayrollRun(@Args() args: FinalizePayrollRunArgs): Promise<PayrollRunView> {
    const user = await this.authService.getCurrentUser();
    const run = await this.runService.finalizeRun({
      runId: toId<PayrollRunId>(args.runId),
      payDate: args.payDate ?? null,
      finalizedByUserId: toId(user.id),
    });
    // Lines remain in the run tables after finalization; the detail view now
    // shows the frozen values that were snapshotted into payslips.
    const detail = await this.runService.getRunDetail(run.id as PayrollRunId);
    return toRunDetailView(detail);
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollRead)
  async bankAdviceCsv(
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<string> {
    return this.runService.buildBankAdviceCsv(toId<PayrollRunId>(runId));
  }

  // --- Payslips ---

  @Query(() => [PayslipView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payslipOwnRead)
  async myPayslips(): Promise<PayslipView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    const payslips = await this.runService.listPayslipsForEmployee(
      toId<EmployeeId>(user.employeeId),
    );
    return payslips.map(toPayslipView);
  }

  @Query(() => PayslipView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payslipRead)
  async payslip(
    @Args('payslipId', { type: () => ID }) payslipId: string,
  ): Promise<PayslipView> {
    const { payslip, lines } = await this.runService.getPayslipWithLines(payslipId);
    return { ...toPayslipView(payslip), lines: lines.map(toPayslipLineView) };
  }

  @Query(() => [PayslipView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollRead)
  async runPayslips(
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<PayslipView[]> {
    return (await this.runService.listPayslipsForRun(toId<PayrollRunId>(runId))).map(toPayslipView);
  }

  // --- Payslip PDFs ---

  private async renderPayslipPdfBase64(payslipId: string): Promise<string> {
    const { payslip, lines } = await this.runService.getPayslipWithLines(payslipId);
    const pdf = await this.pdfService.renderPayslipPdf(payslip, lines, {
      name: this.configService.get('PDF_EMPLOYER_NAME'),
      location: this.configService.get('PDF_EMPLOYER_LOCATION'),
    });
    return pdf.toString('base64');
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payslipRead)
  async payslipPdf(@Args('payslipId', { type: () => ID }) payslipId: string): Promise<string> {
    return this.renderPayslipPdfBase64(payslipId);
  }

  // Self-service variant: the payslip must belong to the signed-in employee.
  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payslipOwnRead)
  async myPayslipPdf(@Args('payslipId', { type: () => ID }) payslipId: string): Promise<string> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    const { payslip } = await this.runService.getPayslipWithLines(payslipId);
    if (payslip.employeeId !== user.employeeId) {
      throw new NotFoundError('Payslip not found', { id: payslipId });
    }
    return this.renderPayslipPdfBase64(payslipId);
  }

  // --- Tax configuration ---

  @Query(() => [TaxSlabGroupView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollRead)
  async taxSlabGroups(): Promise<TaxSlabGroupView[]> {
    const groups = await this.taxConfig.listGroups();
    return groups.map((group) => ({ ...toTaxSlabGroupView(group), slabs: [] }));
  }

  @Query(() => TaxSlabGroupView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollRead)
  async taxSlabGroup(
    @Args('groupId', { type: () => ID }) groupId: string,
  ): Promise<TaxSlabGroupView> {
    const groups = await this.taxConfig.listGroups();
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) {
      throw new NotFoundError('Tax slab group not found', { id: groupId });
    }
    const slabs = await this.taxConfig.listSlabs(group.id as TaxSlabGroupId);
    return { ...toTaxSlabGroupView(group), slabs: slabs.map(toTaxSlabView) };
  }

  @Mutation(() => TaxSlabGroupView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollWrite)
  async createTaxSlabGroup(
    @Args('input') input: CreateTaxSlabGroupInput,
  ): Promise<TaxSlabGroupView> {
    const group = await this.taxConfig.createGroup({
      name: input.name,
      financialYearLabel: input.financialYearLabel,
      currency: input.currency ?? 'PKR',
    });
    return { ...toTaxSlabGroupView(group), slabs: [] };
  }

  @Mutation(() => [TaxSlabView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollWrite)
  async replaceTaxSlabs(@Args() args: ReplaceTaxSlabsArgs): Promise<TaxSlabView[]> {
    const slabs = await this.taxConfig.replaceSlabs(
      toId<TaxSlabGroupId>(args.groupId),
      args.slabs.map((entry) => ({
        upperBound: entry.upperBound ?? null,
        ratePercent: entry.ratePercent,
        flatAdditive: entry.flatAdditive,
      })),
    );
    return slabs.map(toTaxSlabView);
  }

  @Mutation(() => TaxSlabGroupView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.payrollFinalize)
  async activateTaxSlabGroup(
    @Args('groupId', { type: () => ID }) groupId: string,
  ): Promise<TaxSlabGroupView> {
    const group = await this.taxConfig.activateGroup(groupId);
    const slabs = await this.taxConfig.listSlabs(group.id as TaxSlabGroupId);
    return { ...toTaxSlabGroupView(group), slabs: slabs.map(toTaxSlabView) };
  }
}
