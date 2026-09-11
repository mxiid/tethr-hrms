import {
  addIsoDays,
  compareIsoDate,
  countWorkingDays,
  isoMonthRange,
  toId,
  type EmployeeId,
  type HolidayCalendarId,
  type IsoDate,
  type PayrollRunId,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import {
  CompensationService,
  type StructureBreakdownLine,
} from '../compensation';
import { EmployeeDirectoryService } from '../../employee';
import { EmployeeRecordsService } from '../../employee-records';
import { HolidayService, LeaveRequestService } from '../../leave';

import { PayrollRunLineComponent } from './entities/payroll-run-line-component.entity';
import { PayrollRunLine } from './entities/payroll-run-line.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayslipLine } from './entities/payslip-line.entity';
import { Payslip } from './entities/payslip.entity';
import {
  deriveLineTotals,
  prorateComponent,
  sumEarnings,
  type DerivedLineTotals,
} from './line-math';
import {
  PAYSLIP_LINE_REPOSITORY,
  PAYSLIP_REPOSITORY,
  PAYROLL_RUN_LINE_COMPONENT_REPOSITORY,
  PAYROLL_RUN_LINE_REPOSITORY,
  PAYROLL_RUN_REPOSITORY,
} from './payroll.tokens';
import { calculateMonthlyWithholding } from './tax/calculator';
import { TaxSlabService } from './tax-slab.service';

export type CreatePayrollRunData = {
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly holidayCalendarId?: HolidayCalendarId | null;
};

export type UpdatePayrollRunLineData = {
  readonly lineId: string;
  readonly payableDays?: number | null;
  readonly lopDays?: number | null;
  readonly taxOverrideAmount?: number | null;
  readonly note?: string | null;
};

export type FinalizePayrollRunData = {
  readonly runId: PayrollRunId;
  readonly payDate?: IsoDate | null;
  readonly finalizedByUserId: UserId;
  readonly overrideReason?: string | null;
};

// The published summary Billing consumes after `payroll.finalized`: enough to
// draft invoices without reaching into payroll tables (plan.md §5.1).
export type RunBillingSummary = {
  readonly runId: PayrollRunId;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly standardWorkingDays: number;
  readonly payslips: readonly { readonly employeeId: EmployeeId; readonly paidDays: number }[];
};

// A run line joined with everything the UI needs: its snapshotted component
// breakdown, the employee's display name, and the derived money totals exactly
// as finalization will record them.
export type RunLineDetail = {
  readonly line: PayrollRunLine;
  readonly components: readonly PayrollRunLineComponent[];
  readonly displayName: string | null;
  // HR context so finance isn't reading a bare UUID.
  readonly roleTitle: string | null;
  readonly hireDate: IsoDate | null;
  readonly employmentStatus: string | null;
  readonly derived: DerivedLineTotals & { readonly incomeTax: number };
};

export type RunDetail = {
  readonly run: PayrollRun;
  readonly items: readonly RunLineDetail[];
};

// Phase 1 readiness spine: what would stop each active employee being paid, and
// global notes. `hard` blockers should stop a finalize (with an explicit
// override); `warning` ones are advisory.
export type ReadinessBlockerCode =
  | 'noPayAssignment'
  | 'structureHasNoComponents'
  | 'missingBankDetails'
  | 'noActiveTaxLadder';

export type ReadinessBlocker = {
  readonly code: ReadinessBlockerCode;
  readonly severity: 'hard' | 'warning';
  readonly message: string;
};

export type EmployeeReadiness = {
  readonly employeeId: EmployeeId;
  readonly displayName: string | null;
  readonly blockers: readonly ReadinessBlocker[];
};

export type PayrollReadiness = {
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly hardBlockerCount: number;
  readonly warningCount: number;
  readonly employees: readonly EmployeeReadiness[];
};

// One employee's computed draft inputs before persistence.
type DraftComponent = {
  readonly componentCode: string;
  readonly componentName: string;
  readonly category: StructureBreakdownLine['category'];
  readonly taxable: boolean;
  readonly dependsOnPaymentDays: boolean;
  readonly defaultAmount: number;
  readonly amount: number;
  // Provenance for adjustment-derived lines (e.g. 'bonusAward'); null for
  // structure lines.
  readonly sourceType: string | null;
  readonly sourceId: string | null;
};

type LineDraft = {
  readonly employeeId: EmployeeId;
  payableDays: number;
  lopDays: number;
  standardWorkingDays: number;
  grossAmount: number;
  readonly components: readonly DraftComponent[];
  note: string | null;
};

type PreparedFinalization = {
  readonly line: PayrollRunLine;
  readonly components: readonly PayrollRunLineComponent[];
  readonly taxableAmount: number;
  readonly incomeTax: number;
  readonly netPayAmount: number;
};

// The single computed basis for one employee in a period, shared by the
// readiness banner and draft generation so eligibility can never disagree
// (finding 4 in the review).
type EmployeePayBasis = {
  readonly employeeId: EmployeeId;
  readonly displayName: string;
  readonly eligible: boolean;
  readonly blockers: readonly ReadinessBlocker[];
  readonly payableDays: number;
  readonly lopDays: number;
  readonly standardWorkingDays: number;
  readonly components: readonly DraftComponent[];
  readonly grossAmount: number;
};

type DirectoryEmployee = Awaited<ReturnType<EmployeeDirectoryService['listActive']>>[number];


const toMoneyString = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);
const toDaysString = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

const escapeCsvField = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const todayIso = (): IsoDate => new Date().toISOString().slice(0, 10);

// Owns the payroll-run lifecycle: draft computation (pro-rata by working days,
// unpaid-leave reduction), finance adjustments while draft, and finalization into
// immutable payslip snapshots plus the transactional `payroll.finalized` event.
// Cross-module facts come only through the published interfaces injected here —
// never through their tables.
@Injectable()
export class PayrollRunService {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY)
    private readonly runs: TenantScopedRepository<PayrollRun>,
    @Inject(PAYROLL_RUN_LINE_REPOSITORY)
    private readonly lines: TenantScopedRepository<PayrollRunLine>,
    @Inject(PAYROLL_RUN_LINE_COMPONENT_REPOSITORY)
    private readonly lineComponents: TenantScopedRepository<PayrollRunLineComponent>,
    @Inject(PAYSLIP_REPOSITORY)
    private readonly payslips: TenantScopedRepository<Payslip>,
    @Inject(PAYSLIP_LINE_REPOSITORY)
    private readonly payslipLines: TenantScopedRepository<PayslipLine>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly compensation: CompensationService,
    private readonly leaveRequests: LeaveRequestService,
    private readonly holidays: HolidayService,
    private readonly taxSlabs: TaxSlabService,
    private readonly employeeRecords: EmployeeRecordsService,
  ) {}

  async createRun(input: CreatePayrollRunData): Promise<PayrollRun> {
    this.assertPeriod(input.periodYear, input.periodMonth);
    const existing = await this.runs.findOne({
      where: {
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      } as FindOptionsWhere<PayrollRun>,
    });
    if (existing) {
      throw new ConflictError('A payroll run already exists for this period', {
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      });
    }
    return this.persistDraft(null, input.periodYear, input.periodMonth, input.holidayCalendarId ?? null);
  }

  // Full recompute of a draft: replaces every line and component from current
  // published-interface facts. Finalized runs are frozen.
  async regenerateRun(runId: PayrollRunId): Promise<PayrollRun> {
    const run = await this.getDraftRun(runId);
    return this.persistDraft(
      run.id as PayrollRunId,
      run.periodYear,
      run.periodMonth,
      run.holidayCalendarId,
    );
  }

  async updateRunLine(input: UpdatePayrollRunLineData): Promise<PayrollRunLine> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const line = await manager.findOne(PayrollRunLine, {
        where: { id: input.lineId, organizationId },
      });
      if (!line) {
        throw new NotFoundError('Payroll run line not found', { id: input.lineId });
      }
      const run = await manager.findOne(PayrollRun, { where: { id: line.runId, organizationId } });
      if (!run) {
        throw new NotFoundError('Payroll run not found', { id: line.runId });
      }
      if (run.status !== 'draft') {
        throw new ConflictError('Only draft runs can be edited');
      }
      // Prefer the line's own denominator (per-employee calendar); fall back to
      // the run's for legacy lines written before per-line days were stored.
      const standardWorkingDays =
        line.standardWorkingDays > 0 ? line.standardWorkingDays : run.standardWorkingDays;
      let payableDays = Number(line.payableDays);
      let daysChanged = false;
      const payableDaysProvided = input.payableDays != null;
      if (input.payableDays != null) {
        if (input.payableDays < 0 || input.payableDays > standardWorkingDays) {
          throw new ValidationFailedError(
            `payableDays must be between 0 and ${standardWorkingDays}`,
          );
        }
        payableDays = input.payableDays;
        daysChanged = true;
      }
      if (input.lopDays != null) {
        if (input.lopDays < 0) {
          throw new ValidationFailedError('lopDays must be zero or greater');
        }
        const lopDays = Math.min(input.lopDays, standardWorkingDays);
        if (payableDaysProvided) {
          // Both edited together: payableDays is authoritative, but keep the
          // invariant payable + unpaid ≤ worked days (≤ standard days). Applying
          // the lop delta on top would double-count the change.
          payableDays = Math.min(payableDays, standardWorkingDays - lopDays);
        } else {
          // Only unpaid days changed: shift payable days by the same delta so
          // the two controls can't silently disagree.
          payableDays = Math.min(
            standardWorkingDays,
            Math.max(0, payableDays - (lopDays - Number(line.lopDays))),
          );
        }
        line.lopDays = toDaysString(lopDays);
        daysChanged = true;
      }
      if (daysChanged) {
        line.payableDays = toDaysString(payableDays);
        await this.recomputeDayDependentAmounts(manager, line, standardWorkingDays);
      }
      if (input.taxOverrideAmount !== undefined) {
        if (input.taxOverrideAmount === null) {
          line.taxOverrideAmount = null;
        } else {
          if (input.taxOverrideAmount < 0) {
            throw new ValidationFailedError('taxOverrideAmount must be zero or greater');
          }
          line.taxOverrideAmount = toMoneyString(input.taxOverrideAmount);
        }
      }
      if (input.note !== undefined) {
        line.note = input.note ?? null;
      }
      return manager.save(line);
    });
  }

  async removeRunLine(lineId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      const line = await manager.findOne(PayrollRunLine, {
        where: { id: lineId, organizationId },
      });
      if (!line) {
        throw new NotFoundError('Payroll run line not found', { id: lineId });
      }
      const run = await manager.findOne(PayrollRun, { where: { id: line.runId, organizationId } });
      if (!run) {
        throw new NotFoundError('Payroll run not found', { id: line.runId });
      }
      if (run.status !== 'draft') {
        throw new ConflictError('Only draft run lines can be removed');
      }
      const components = await manager.find(PayrollRunLineComponent, {
        where: { organizationId, lineId } as FindOptionsWhere<PayrollRunLineComponent>,
      });
      for (const component of components) {
        await manager.remove(component);
      }
      await manager.remove(line);
    });
  }

  // The point of no return: snapshot one immutable payslip per line, lock the
  // run, announce it transactionally. Totals are computed BEFORE the transaction
  // so the outbox event carries the real figure; writing is pure persistence.
  async finalizeRun(input: FinalizePayrollRunData): Promise<PayrollRun> {
    const run = await this.getDraftRun(input.runId);
    const organizationId = this.tenantContext.getOrganizationId();
    const allLines = await this.lines.find({
      where: { runId: run.id } as FindOptionsWhere<PayrollRunLine>,
    });
    if (allLines.length === 0) {
      throw new ValidationFailedError('Cannot finalize a run with no lines');
    }

    const ladder = await this.taxSlabs.getActiveLadder();
    const prepared: PreparedFinalization[] = [];
    for (const line of allLines) {
      const components = await this.lineComponents.find({
        where: { lineId: line.id } as FindOptionsWhere<PayrollRunLineComponent>,
        order: { sortOrder: 'ASC' },
      });
      const categorized = components.map((component) => ({
        category: component.category,
        taxable: component.taxable,
        amount: Number(component.amount),
      }));
      const taxableAmount = categorized
        .filter((component) => component.category === 'earning' && component.taxable)
        .reduce((sum, component) => sum + component.amount, 0);
      const incomeTax =
        line.taxOverrideAmount !== null
          ? Number(line.taxOverrideAmount)
          : calculateMonthlyWithholding(taxableAmount, ladder ?? []);
      const totals = deriveLineTotals(categorized, incomeTax);
      prepared.push({ line, components, taxableAmount, incomeTax, netPayAmount: totals.netPayAmount });
    }
    const totalNetPay =
      Math.round(prepared.reduce((sum, item) => sum + item.netPayAmount, 0) * 100) / 100;
    const payDate = input.payDate ?? todayIso();

    // Guard 0.3: a line with no earning component means a misconfigured salary
    // structure (or none), which would otherwise finalize as a silent zero
    // payslip. A line with earning components that totals zero is suspicious
    // when days were payable (e.g. a bad holiday calendar zeroed the period) but
    // legitimate when the person had no payable days at all (full unpaid leave).
    // Both need an explicit override; a genuinely idle month does not.
    const unconfigured = prepared.filter(
      (item) => !item.components.some((component) => component.category === 'earning'),
    );
    const zeroedWithDays = prepared.filter((item) => {
      const earningComponents = item.components.filter(
        (component) => component.category === 'earning',
      );
      const totalEarnings = earningComponents.reduce(
        (sum, component) => sum + Number(component.amount),
        0,
      );
      return (
        earningComponents.length > 0 &&
        totalEarnings === 0 &&
        Number(item.line.payableDays) > 0 &&
        item.line.standardWorkingDays > 0
      );
    });
    if ((unconfigured.length > 0 || zeroedWithDays.length > 0) && !input.overrideReason) {
      const parts: string[] = [];
      if (unconfigured.length > 0) {
        parts.push(`${unconfigured.length} line(s) have no earning components`);
      }
      if (zeroedWithDays.length > 0) {
        parts.push(
          `${zeroedWithDays.length} line(s) have payable days but zero earnings (check the holiday calendar)`,
        );
      }
      throw new ValidationFailedError(
        `Cannot finalize: ${parts.join('; ')}. Fix the underlying data or re-run with an override reason.`,
        {
          employeeIds: [...unconfigured, ...zeroedWithDays].map((item) => item.line.employeeId),
        },
      );
    }
    const overrideReason = unconfigured.length > 0 ? (input.overrideReason ?? null) : null;

    let sequence = await this.payslips.count();

    await this.dataSource.transaction(async (manager) => {
      for (const item of prepared) {
        const employee = await this.employeeDirectory.getById(item.line.employeeId);
        if (!employee) {
          throw new NotFoundError('Employee disappeared since draft', {
            id: item.line.employeeId,
          });
        }
        sequence += 1;
        const payslipNumber = `PS-${run.periodYear}${String(run.periodMonth).padStart(2, '0')}-${String(
          sequence,
        ).padStart(4, '0')}`;

        const payslip = manager.create(Payslip, {
          organizationId,
          runId: run.id,
          employeeId: item.line.employeeId,
          payslipNumber,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          payDate,
          currency: run.currency,
          employeeNumber: employee.employeeNumber,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          roleTitle: employee.roleTitle,
          hireDate: employee.hireDate,
          paidDays: item.line.payableDays,
          lopDays: item.line.lopDays,
          standardWorkingDays:
            item.line.standardWorkingDays > 0
              ? item.line.standardWorkingDays
              : run.standardWorkingDays,
          grossAmount: item.line.grossAmount,
          taxableAmount: toMoneyString(item.taxableAmount),
          incomeTaxAmount: toMoneyString(item.incomeTax),
          netPayAmount: toMoneyString(item.netPayAmount),
          notes: item.line.note,
        });
        const savedPayslip = await manager.save(payslip);

        for (const component of item.components) {
          await manager.save(
            manager.create(PayslipLine, {
              organizationId,
              payslipId: savedPayslip.id,
              componentCode: component.componentCode,
              componentName: component.componentName,
              category: component.category,
              taxable: component.taxable,
              dependsOnPaymentDays: component.dependsOnPaymentDays,
              defaultAmount: component.defaultAmount,
              amount: component.amount,
              sourceType: component.sourceType,
              sourceId: component.sourceId,
              sortOrder: component.sortOrder,
            }),
          );
        }
      }

      const savedRun = await manager.findOne(PayrollRun, { where: { id: run.id, organizationId } });
      if (!savedRun) {
        throw new NotFoundError('Payroll run not found', { id: run.id });
      }
      savedRun.status = 'finalized';
      savedRun.finalizedAt = new Date();
      savedRun.finalizedByUserId = input.finalizedByUserId;
      savedRun.finalizeOverrideReason = overrideReason;
      const persistedRun = await manager.save(savedRun);

      await this.publisher.publishWithin(manager, {
        name: 'payroll.finalized',
        payload: {
          payrollRunId: toId<PayrollRunId>(persistedRun.id),
          periodYear: persistedRun.periodYear,
          periodMonth: persistedRun.periodMonth,
          currency: persistedRun.currency,
          payslipCount: prepared.length,
          totalNetPay,
        },
      });
      return persistedRun;
    });

    await this.audit.record({
      action: 'finalize',
      resourceType: 'payroll_run',
      resourceId: run.id,
      after: {
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        payslipCount: prepared.length,
        totalNetPay,
        ...(overrideReason ? { overrideReason } : {}),
      },
    });
    const finalized = await this.runs.findById(run.id);
    if (!finalized) {
      throw new NotFoundError('Payroll run not found', { id: run.id });
    }
    return finalized;
  }

  listRuns(): Promise<PayrollRun[]> {
    return this.runs.find({ order: { periodYear: 'DESC', periodMonth: 'DESC' } });
  }

  // Published write for the `compensation.revised` consumer (plan Phase 2 #14):
  // flag any DRAFT run whose period is on/after the raise so finance regenerates
  // before finalizing. Finalized runs are never touched — their history is frozen.
  async markDraftsStaleForSalaryRevision(effectiveDate: IsoDate): Promise<number> {
    const drafts = await this.runs.find({
      where: { status: 'draft' } as FindOptionsWhere<PayrollRun>,
    });
    let marked = 0;
    for (const run of drafts) {
      const { endExclusive } = isoMonthRange(run.periodYear, run.periodMonth);
      const endInclusive = addIsoDays(endExclusive, -1);
      if (compareIsoDate(effectiveDate, endInclusive) > 0) {
        continue; // raise is after this period — not relevant to it
      }
      if (run.isStale) {
        continue;
      }
      run.isStale = true;
      run.staleReason = `Salary revised effective ${effectiveDate}`;
      await this.runs.save(run);
      marked += 1;
    }
    return marked;
  }

  // Published read for the billing module's `payroll.finalized` consumer.
  async getFinalizedRunSummary(runId: PayrollRunId): Promise<RunBillingSummary> {
    const run = await this.getRun(runId);
    if (run.status !== 'finalized') {
      throw new ConflictError('Only finalized runs can be billed');
    }
    const payslips = await this.listPayslipsForRun(run.id as PayrollRunId);
    return {
      runId: run.id as PayrollRunId,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      standardWorkingDays: run.standardWorkingDays,
      payslips: payslips.map((payslip) => ({
        employeeId: toId<EmployeeId>(payslip.employeeId),
        paidDays: Number(payslip.paidDays),
      })),
    };
  }

  // Everything the run screen renders in one read: run, per-line snapshot
  // components, display names, and derived totals identical to finalization's.
  async getRunDetail(runId: PayrollRunId): Promise<RunDetail> {
    const run = await this.getRun(runId);
    const lines = await this.lines.find({
      where: { runId: run.id } as FindOptionsWhere<PayrollRunLine>,
      order: { createdAt: 'ASC' },
    });
    if (lines.length === 0) {
      return { run, items: [] };
    }
    const components = await this.lineComponents.find({
      where: lines.map((line) => ({ lineId: line.id })) as FindOptionsWhere<PayrollRunLineComponent>[],
      order: { sortOrder: 'ASC' },
    });
    const ladder = await this.taxSlabs.getActiveLadder();
    const items: RunLineDetail[] = [];
    for (const line of lines) {
      const lineComponents = components.filter((component) => component.lineId === line.id);
      const employee = await this.employeeDirectory.getById(line.employeeId);
      items.push({
        line,
        components: lineComponents,
        displayName: employee ? `${employee.firstName} ${employee.lastName}` : null,
        roleTitle: employee?.roleTitle ?? null,
        hireDate: employee?.hireDate ?? null,
        employmentStatus: employee?.employmentStatus ?? null,
        derived: this.deriveLine(line, lineComponents, ladder),
      });
    }
    return { run, items };
  }

  // Phase 1 readiness spine: who can be paid this period and what's missing.
  // Composes only published reads (directory, compensation, employee-records,
  // tax config). Eligibility comes from the same basis draft generation uses, so
  // the banner can never disagree with the run (finding 4).
  async getReadiness(periodYear: number, periodMonth: number): Promise<PayrollReadiness> {
    return this.buildReadiness(periodYear, periodMonth, null);
  }

  // Employee-scoped variant for the record's Pay tab, so opening one record does
  // not compute the whole tenant (finding 6).
  async getEmployeeReadiness(
    employeeId: EmployeeId,
    periodYear: number,
    periodMonth: number,
  ): Promise<EmployeeReadiness | null> {
    const readiness = await this.buildReadiness(periodYear, periodMonth, employeeId);
    return readiness.employees.find((entry) => entry.employeeId === employeeId) ?? null;
  }

  private async buildReadiness(
    periodYear: number,
    periodMonth: number,
    onlyEmployeeId: EmployeeId | null,
  ): Promise<PayrollReadiness> {
    this.assertPeriod(periodYear, periodMonth);
    const { start, endExclusive } = isoMonthRange(periodYear, periodMonth);
    const endInclusive = addIsoDays(endExclusive, -1);
    const ladder = await this.taxSlabs.getActiveLadder();
    const bases = await this.computePayrollBasis(
      periodYear,
      periodMonth,
      start,
      endInclusive,
      countWorkingDays(start, endInclusive, new Set<IsoDate>()),
      new Set<IsoDate>(),
      onlyEmployeeId,
    );
    const results = await Promise.all(
      bases.map(async (basis): Promise<EmployeeReadiness> => {
        const blockers: ReadinessBlocker[] = [...basis.blockers];
        const hrRecord = await this.employeeRecords.getHrRecord(basis.employeeId);
        const hasBankDetails = Boolean(
          hrRecord && (hrRecord.bankAccountNumber || hrRecord.bankIban),
        );
        if (!hasBankDetails) {
          blockers.push({
            code: 'missingBankDetails',
            severity: 'warning',
            message: 'Bank details missing',
          });
        }
        if (!ladder) {
          blockers.push({
            code: 'noActiveTaxLadder',
            severity: 'warning',
            message: 'No active tax slab group',
          });
        }
        return { employeeId: basis.employeeId, displayName: basis.displayName, blockers };
      }),
    );
    const withBlockers = results.filter((entry) => entry.blockers.length > 0);
    return {
      periodYear,
      periodMonth,
      hardBlockerCount: withBlockers.filter((entry) =>
        entry.blockers.some((blocker) => blocker.severity === 'hard'),
      ).length,
      warningCount: withBlockers.reduce(
        (sum, entry) =>
          sum + entry.blockers.filter((blocker) => blocker.severity === 'warning').length,
        0,
      ),
      employees: withBlockers,
    };
  }

  listPayslipsForRun(runId: PayrollRunId): Promise<Payslip[]> {
    return this.payslips.find({
      where: { runId } as FindOptionsWhere<Payslip>,
      order: { payslipNumber: 'ASC' },
    });
  }

  async getPayslipWithLines(
    payslipId: string,
  ): Promise<{ payslip: Payslip; lines: PayslipLine[] }> {
    const payslip = await this.payslips.findById(payslipId);
    if (!payslip) {
      throw new NotFoundError('Payslip not found', { id: payslipId });
    }
    const lines = await this.payslipLines.find({
      where: { payslipId } as FindOptionsWhere<PayslipLine>,
      order: { sortOrder: 'ASC' },
    });
    return { payslip, lines };
  }

  listPayslipsForEmployee(employeeId: EmployeeId): Promise<Payslip[]> {
    return this.payslips.find({
      where: { employeeId } as FindOptionsWhere<Payslip>,
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
    });
  }

  // Bank advice for a finalized run: one CSV row per payslip with payout account
  // facts read through the employee-records published interface. Missing bank
  // details leave columns empty so finance can spot and fix them.
  async buildBankAdviceCsv(runId: PayrollRunId): Promise<string> {
    const run = await this.getRun(runId);
    if (run.status !== 'finalized') {
      throw new ConflictError('Bank advice is available only for finalized runs');
    }
    const rows = await this.listPayslipsForRun(runId);
    const header = [
      'Payslip Number',
      'Employee Number',
      'Employee Name',
      'Bank',
      'Account Title',
      'Account Number',
      'IBAN',
      'Currency',
      'Net Pay',
      'Period',
    ];
    const lines: string[] = [header.join(',')];
    for (const payslip of rows) {
      const record = await this.employeeRecords.getHrRecord(payslip.employeeId);
      lines.push(
        [
          payslip.payslipNumber,
          payslip.employeeNumber,
          payslip.employeeName,
          record?.bankName ?? '',
          record?.bankAccountTitle ?? '',
          record?.bankAccountNumber ?? '',
          record?.bankIban ?? '',
          payslip.currency,
          payslip.netPayAmount,
          `${payslip.periodYear}-${String(payslip.periodMonth).padStart(2, '0')}`,
        ]
          .map((field) => escapeCsvField(String(field)))
          .join(','),
      );
    }
    return lines.join('\n');
  }

  // --- internals ---

  // Re-pro-rate a draft line's stored components against a new payable-days
  // value and refresh its gross. Uses the stored `defaultAmount` (the
  // full-period amount), so repeated edits never compound rounding and a
  // day-independent component is left untouched.
  private async recomputeDayDependentAmounts(
    manager: EntityManager,
    line: PayrollRunLine,
    standardWorkingDays: number,
  ): Promise<void> {
    const components = await manager.find(PayrollRunLineComponent, {
      where: {
        organizationId: line.organizationId,
        lineId: line.id,
      } as FindOptionsWhere<PayrollRunLineComponent>,
      order: { sortOrder: 'ASC' },
    });
    const amounts: { category: string; amount: number }[] = [];
    for (const component of components) {
      const fullAmount =
        component.defaultAmount !== null ? Number(component.defaultAmount) : Number(component.amount);
      const resolved = prorateComponent(
        fullAmount,
        component.dependsOnPaymentDays,
        Number(line.payableDays),
        standardWorkingDays,
      );
      component.amount = toMoneyString(resolved.amount);
      await manager.save(component);
      amounts.push({ category: component.category, amount: resolved.amount });
    }
    line.grossAmount = toMoneyString(sumEarnings(amounts));
  }

  private deriveLine(
    line: PayrollRunLine,
    components: readonly PayrollRunLineComponent[],
    ladder: Awaited<ReturnType<TaxSlabService['getActiveLadder']>>,
  ): RunLineDetail['derived'] {
    const categorized = components.map((component) => ({
      category: component.category,
      taxable: component.taxable,
      amount: Number(component.amount),
    }));
    const taxableAmount = categorized
      .filter((component) => component.category === 'earning' && component.taxable)
      .reduce((sum, component) => sum + component.amount, 0);
    const incomeTax =
      line.taxOverrideAmount !== null
        ? Number(line.taxOverrideAmount)
        : calculateMonthlyWithholding(taxableAmount, ladder ?? []);
    return {
      ...deriveLineTotals(categorized, incomeTax),
      incomeTax,
    };
  }

  private assertPeriod(periodYear: number, periodMonth: number): void {
    if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
      throw new ValidationFailedError('periodYear must be a four-digit year');
    }
    if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      throw new ValidationFailedError('periodMonth must be between 1 and 12');
    }
  }

  private async getDraftRun(runId: PayrollRunId): Promise<PayrollRun> {
    const run = await this.runs.findById(runId);
    if (!run) {
      throw new NotFoundError('Payroll run not found', { id: runId });
    }
    if (run.status !== 'draft') {
      throw new ConflictError('Payroll run is already finalized');
    }
    return run;
  }

  private async getRun(runId: PayrollRunId): Promise<PayrollRun> {
    const run = await this.runs.findById(runId);
    if (!run) {
      throw new NotFoundError('Payroll run not found', { id: runId });
    }
    return run;
  }

  // Shared draft computation: pro-rata payable days from the working-day calendar
  // (weekends + tenant holidays), reduced by approved unpaid leave, plus the
  // salary breakdown snapshotted from the effective revision. Employees without a
  // current revision are excluded from the run (readiness reports them).
  private async computePayrollBasis(
    periodYear: number,
    periodMonth: number,
    start: IsoDate,
    endInclusive: IsoDate,
    standardWorkingDays: number,
    holidayDates: Set<IsoDate>,
    onlyEmployeeId: EmployeeId | null = null,
  ): Promise<EmployeePayBasis[]> {
    const employees = onlyEmployeeId
      ? [await this.employeeDirectory.getById(onlyEmployeeId)].filter(
          (employee): employee is DirectoryEmployee => employee !== null,
        )
      : await this.employeeDirectory.listActive();
    const holidayCache = new Map<string, Set<IsoDate>>();
    const holidayDatesFor = async (calendarId: HolidayCalendarId): Promise<Set<IsoDate>> => {
      const cached = holidayCache.get(calendarId);
      if (cached) {
        return cached;
      }
      const dates = await this.holidays.getHolidayDates(calendarId, start, endInclusive);
      holidayCache.set(calendarId, dates);
      return dates;
    };
    const bases = await Promise.all(
      employees.map((employee) =>
        this.computeEmployeeBasis(employee, {
          periodYear,
          periodMonth,
          start,
          endInclusive,
          standardWorkingDays,
          holidayDates,
          holidayDatesFor,
        }),
      ),
    );
    return bases.filter((basis): basis is EmployeePayBasis => basis !== null);
  }

  private async computeEmployeeBasis(
    employee: DirectoryEmployee,
    context: {
      readonly periodYear: number;
      readonly periodMonth: number;
      readonly start: IsoDate;
      readonly endInclusive: IsoDate;
      readonly standardWorkingDays: number;
      readonly holidayDates: Set<IsoDate>;
      readonly holidayDatesFor: (calendarId: HolidayCalendarId) => Promise<Set<IsoDate>>;
    },
  ): Promise<EmployeePayBasis | null> {
    if (compareIsoDate(employee.hireDate, context.endInclusive) > 0) {
      return null; // hired after the period — not part of it
    }
    const employeeId = toId<EmployeeId>(employee.id);
    const displayName = `${employee.firstName} ${employee.lastName}`;
    const employeeHolidays = employee.holidayCalendarId
      ? await context.holidayDatesFor(employee.holidayCalendarId)
      : context.holidayDates;
    const employeeStandardWorkingDays = employee.holidayCalendarId
      ? countWorkingDays(context.start, context.endInclusive, employeeHolidays)
      : context.standardWorkingDays;
    const windowStart =
      compareIsoDate(employee.hireDate, context.start) > 0 ? employee.hireDate : context.start;
    const workedDays = countWorkingDays(windowStart, context.endInclusive, employeeHolidays);
    const unpaidDays = await this.leaveRequests.getApprovedUnpaidWorkDays(
      employeeId,
      context.start,
      context.endInclusive,
      employeeHolidays,
    );
    const payableDays = Math.max(
      0,
      Math.min(workedDays - unpaidDays, employeeStandardWorkingDays),
    );

    const revision = await this.compensation.getCurrentSalaryRevision(
      employeeId,
      context.endInclusive,
    );
    if (!revision) {
      return {
        employeeId,
        displayName,
        eligible: false,
        blockers: [
          {
            code: 'noPayAssignment',
            severity: 'hard',
            message: 'No active salary assignment as of period end',
          },
        ],
        payableDays,
        lopDays: unpaidDays,
        standardWorkingDays: employeeStandardWorkingDays,
        components: [],
        grossAmount: 0,
      };
    }

    const monthlyGross = Math.round((Number(revision.annualAmount) / 12) * 100) / 100;
    const breakdown = await this.compensation.getStructureComponentBreakdown(
      revision.salaryStructureId,
      monthlyGross,
    );
    const blockers: ReadinessBlocker[] = [];
    if (!breakdown.some((line) => line.category === 'earning')) {
      blockers.push({
        code: 'structureHasNoComponents',
        severity: 'hard',
        message: 'Salary structure has no earning components',
      });
    }
    const adjustments = await this.compensation.getAdjustmentsForPeriod(
      employeeId,
      context.periodYear,
      context.periodMonth,
    );
    let earnings = [...breakdown];
    for (const adjustment of adjustments) {
      if (adjustment.overwritesStructureAmount) {
        earnings = earnings.filter(
          (component) => component.componentCode !== adjustment.componentCode,
        );
      }
    }
    const components: DraftComponent[] = [
      ...earnings.map((component) => ({
        componentCode: component.componentCode,
        componentName: component.componentName,
        category: component.category,
        taxable: component.taxable,
        dependsOnPaymentDays: component.dependsOnPaymentDays,
        defaultAmount: component.amount,
        amount: component.amount,
        sourceType: null,
        sourceId: null,
      })),
      ...adjustments.map((adjustment) => ({
        componentCode: adjustment.componentCode,
        componentName: adjustment.componentName,
        category: adjustment.category,
        taxable: adjustment.taxable,
        dependsOnPaymentDays: adjustment.dependsOnPaymentDays,
        defaultAmount: adjustment.amount,
        amount: adjustment.amount,
        sourceType: adjustment.sourceType ?? adjustment.kind,
        sourceId: adjustment.sourceId,
      })),
    ].map((component) => {
      const resolved = prorateComponent(
        component.defaultAmount,
        component.dependsOnPaymentDays,
        payableDays,
        employeeStandardWorkingDays,
      );
      return {
        ...component,
        defaultAmount: resolved.defaultAmount,
        amount: resolved.amount,
      };
    });

    return {
      employeeId,
      displayName,
      eligible: true,
      blockers,
      payableDays,
      lopDays: unpaidDays,
      standardWorkingDays: employeeStandardWorkingDays,
      components,
      grossAmount: sumEarnings(components),
    };
  }

  // Shared draft computation: pro-rata payable days from the working-day calendar
  // (weekends + tenant holidays), reduced by approved unpaid leave, plus the
  // salary breakdown snapshotted from the effective revision. Employees without a
  // current revision still appear as a flagged zero line — finance fixes the gap
  // or removes the line rather than the run silently under-covering.
  private async persistDraft(
    runId: PayrollRunId | null,
    periodYear: number,
    periodMonth: number,
    holidayCalendarId: HolidayCalendarId | null,
  ): Promise<PayrollRun> {
    this.assertPeriod(periodYear, periodMonth);
    const { start, endExclusive } = isoMonthRange(periodYear, periodMonth);
    const endInclusive = addIsoDays(endExclusive, -1);
    const holidayDates = holidayCalendarId
      ? await this.holidays.getHolidayDates(holidayCalendarId, start, endInclusive)
      : new Set<IsoDate>();
    const standardWorkingDays = countWorkingDays(start, endInclusive, holidayDates);

    // One shared basis computation, parallelized across employees. Eligibility
    // here is exactly what the readiness banner reports (finding 4 / 6).
    const bases = await this.computePayrollBasis(
      periodYear,
      periodMonth,
      start,
      endInclusive,
      standardWorkingDays,
      holidayDates,
    );
    const drafts: LineDraft[] = bases
      .filter((basis) => basis.eligible)
      .map((basis) => ({
        employeeId: basis.employeeId,
        payableDays: basis.payableDays,
        lopDays: basis.lopDays,
        standardWorkingDays: basis.standardWorkingDays,
        grossAmount: basis.grossAmount,
        components: basis.components,
        note: null,
      }));

    const organizationId = this.tenantContext.getOrganizationId();
    const saved = await this.dataSource.transaction(async (manager) => {
      let run: PayrollRun;
      if (runId === null) {
        run = manager.create(PayrollRun, {
          organizationId,
          periodYear,
          periodMonth,
          status: 'draft',
          currency: 'PKR',
          standardWorkingDays,
          holidayCalendarId: holidayCalendarId ?? null,
          finalizedAt: null,
          finalizedByUserId: null,
        });
        run = await manager.save(run);
      } else {
        const existing = await manager.findOne(PayrollRun, {
          where: { id: runId, organizationId },
        });
        if (!existing) {
          throw new NotFoundError('Payroll run not found', { id: runId });
        }
        existing.standardWorkingDays = standardWorkingDays;
        existing.holidayCalendarId = holidayCalendarId ?? null;
        existing.isStale = false;
        existing.staleReason = null;
        run = await manager.save(existing);

        const staleLines = await manager.find(PayrollRunLine, {
          where: { organizationId, runId: existing.id } as FindOptionsWhere<PayrollRunLine>,
        });
        for (const line of staleLines) {
          const staleComponents = await manager.find(PayrollRunLineComponent, {
            where: { organizationId, lineId: line.id } as FindOptionsWhere<PayrollRunLineComponent>,
          });
          for (const component of staleComponents) {
            await manager.remove(component);
          }
          await manager.remove(line);
        }
      }

      for (const draft of drafts) {
        const line = await manager.save(
          manager.create(PayrollRunLine, {
            organizationId,
            runId: run.id,
            employeeId: draft.employeeId,
            payableDays: toDaysString(draft.payableDays),
            lopDays: toDaysString(draft.lopDays),
            standardWorkingDays: draft.standardWorkingDays,
            grossAmount: toMoneyString(draft.grossAmount),
            taxOverrideAmount: null,
            note: draft.note,
          }),
        );
        for (let index = 0; index < draft.components.length; index += 1) {
          const component = draft.components[index];
          await manager.save(
            manager.create(PayrollRunLineComponent, {
              organizationId,
              lineId: line.id,
              componentCode: component.componentCode,
              componentName: component.componentName,
              category: component.category,
              taxable: component.taxable,
              dependsOnPaymentDays: component.dependsOnPaymentDays,
              defaultAmount: toMoneyString(component.defaultAmount),
              amount: toMoneyString(component.amount),
              sourceType: component.sourceType,
              sourceId: component.sourceId,
              sortOrder: index,
            }),
          );
        }
      }
      return run;
    });

    await this.audit.record({
      action: runId === null ? 'create' : 'regenerate',
      resourceType: 'payroll_run',
      resourceId: saved.id,
      after: {
        periodYear,
        periodMonth,
        standardWorkingDays,
        lineCount: drafts.length,
      },
    });
    return saved;
  }
}
