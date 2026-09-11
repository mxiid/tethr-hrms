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
import { DataSource, type FindOptionsWhere } from 'typeorm';

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
import { deriveLineTotals, type DerivedLineTotals } from './line-math';
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
  readonly derived: DerivedLineTotals & { readonly incomeTax: number };
};

export type RunDetail = {
  readonly run: PayrollRun;
  readonly items: readonly RunLineDetail[];
};

// One employee's computed draft inputs before persistence.
type LineDraft = {
  readonly employeeId: EmployeeId;
  payableDays: number;
  lopDays: number;
  grossAmount: number;
  readonly breakdown: readonly StructureBreakdownLine[];
  note: string | null;
};

type PreparedFinalization = {
  readonly line: PayrollRunLine;
  readonly components: readonly PayrollRunLineComponent[];
  readonly taxableAmount: number;
  readonly incomeTax: number;
  readonly netPayAmount: number;
};

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
      if (input.payableDays != null) {
        if (input.payableDays < 0 || input.payableDays > run.standardWorkingDays) {
          throw new ValidationFailedError(
            `payableDays must be between 0 and ${run.standardWorkingDays}`,
          );
        }
        line.payableDays = toDaysString(input.payableDays);
      }
      if (input.lopDays != null) {
        if (input.lopDays < 0) {
          throw new ValidationFailedError('lopDays must be zero or greater');
        }
        line.lopDays = toDaysString(Math.min(input.lopDays, run.standardWorkingDays));
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
              amount: component.amount,
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
      items.push({
        line,
        components: lineComponents,
        displayName: await this.employeeDirectory.getDisplayName(line.employeeId),
        derived: this.deriveLine(line, lineComponents, ladder),
      });
    }
    return { run, items };
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

    const employees = await this.employeeDirectory.listActive();
    const drafts: LineDraft[] = [];
    for (const employee of employees) {
      if (compareIsoDate(employee.hireDate, endInclusive) > 0) {
        continue;
      }
      const windowStart = compareIsoDate(employee.hireDate, start) > 0 ? employee.hireDate : start;
      const workedDays = countWorkingDays(windowStart, endInclusive, holidayDates);
      const unpaidDays = await this.leaveRequests.getApprovedUnpaidWorkDays(
        toId<EmployeeId>(employee.id),
        start,
        endInclusive,
        holidayDates,
      );
      const payableDays = Math.max(0, Math.min(workedDays - unpaidDays, standardWorkingDays));

      const revision = await this.compensation.getCurrentSalaryRevision(
        toId<EmployeeId>(employee.id),
        endInclusive,
      );
      if (!revision) {
        drafts.push({
          employeeId: toId<EmployeeId>(employee.id),
          payableDays,
          lopDays: unpaidDays,
          grossAmount: 0,
          breakdown: [],
          note: `No active salary revision as of ${endInclusive}`,
        });
        continue;
      }
      const monthlyGross = Math.round((Number(revision.annualAmount) / 12) * 100) / 100;
      const breakdown = await this.compensation.getStructureComponentBreakdown(
        revision.salaryStructureId,
        monthlyGross,
      );
      drafts.push({
        employeeId: toId<EmployeeId>(employee.id),
        payableDays,
        lopDays: unpaidDays,
        grossAmount: monthlyGross,
        breakdown,
        note: null,
      });
    }

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
            grossAmount: toMoneyString(draft.grossAmount),
            taxOverrideAmount: null,
            note: draft.note,
          }),
        );
        for (let index = 0; index < draft.breakdown.length; index += 1) {
          const component = draft.breakdown[index];
          await manager.save(
            manager.create(PayrollRunLineComponent, {
              organizationId,
              lineId: line.id,
              componentCode: component.componentCode,
              componentName: component.componentName,
              category: component.category,
              taxable: component.taxable,
              amount: toMoneyString(component.amount),
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
