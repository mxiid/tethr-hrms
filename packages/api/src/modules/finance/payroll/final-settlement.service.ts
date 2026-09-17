import {
  addIsoDays,
  compareIsoDate,
  countWorkingDays,
  isIsoDate,
  isoMonthRange,
  type EmployeeId,
  type IsoDate,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';
import { HolidayService, LeaveBalanceService } from '../../leave';
import { CompensationService } from '../compensation';

import { FinalSettlement } from './entities/final-settlement.entity';
import { prorateComponent, sumEarnings } from './line-math';
import { FINAL_SETTLEMENT_REPOSITORY } from './payroll.tokens';
import { calculateMonthlyWithholding } from './tax/calculator';
import { TaxSlabService } from './tax-slab.service';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const toMoney = (value: number): string => round2(value).toFixed(2);
const toDays = (value: number): string => round2(value).toFixed(2);

// Composes the full-and-final money for a leaver (plan Phase 2 #16): the
// pro-rated final partial month, leave encashment priced from the leave balance,
// and recoveries — giving a payable total instead of a manual checklist flag.
@Injectable()
export class FinalSettlementService {
  constructor(
    @Inject(FINAL_SETTLEMENT_REPOSITORY)
    private readonly settlements: TenantScopedRepository<FinalSettlement>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly compensation: CompensationService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly leaveBalances: LeaveBalanceService,
    private readonly holidays: HolidayService,
    private readonly taxSlabs: TaxSlabService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  // Compute (and store) a settlement. Idempotent per employee: re-running
  // replaces the outstanding settlement. The `employee.terminated` consumer
  // passes its transaction manager so the settlement and its audit commit with
  // the idempotency ledger row.
  async compute(
    employeeId: EmployeeId,
    terminationDate: IsoDate,
    manager?: EntityManager,
  ): Promise<FinalSettlement> {
    const employee = await this.employeeDirectory.getById(employeeId);
    if (!employee) {
      throw new NotFoundError('Employee not found', { id: employeeId });
    }
    const year = Number(terminationDate.slice(0, 4));
    const month = Number(terminationDate.slice(5, 7));
    const { start, endExclusive } = isoMonthRange(year, month);
    const monthEnd = addIsoDays(endExclusive, -1);
    const holidayDates = employee.holidayCalendarId
      ? await this.holidays.getHolidayDates(employee.holidayCalendarId, start, monthEnd)
      : new Set<IsoDate>();
    const standardWorkingDays = countWorkingDays(start, monthEnd, holidayDates);
    const effectiveStart =
      compareIsoDate(employee.hireDate, start) > 0 ? employee.hireDate : start;
    const effectiveEnd =
      compareIsoDate(terminationDate, monthEnd) < 0 ? terminationDate : monthEnd;
    const workedDays =
      compareIsoDate(effectiveStart, effectiveEnd) > 0
        ? 0
        : countWorkingDays(effectiveStart, effectiveEnd, holidayDates);

    const revision = await this.compensation.getCurrentSalaryRevision(employeeId, terminationDate);
    let currency = 'PKR';
    let monthlyGross = 0;
    let proRatedEarnings = 0;
    let taxableEarnings = 0;
    if (revision) {
      currency = revision.currency;
      monthlyGross = round2(Number(revision.annualAmount) / 12);
      const breakdown = await this.compensation.getStructureComponentBreakdown(
        revision.salaryStructureId,
        monthlyGross,
      );
      const components = breakdown.map((component) => {
        const resolved = prorateComponent(
          component.amount,
          component.dependsOnPaymentDays,
          workedDays,
          standardWorkingDays,
        );
        return {
          category: component.category,
          taxable: component.taxable,
          amount: resolved.amount,
        };
      });
      proRatedEarnings = sumEarnings(components);
      taxableEarnings = round2(
        components
          .filter((component) => component.category === 'earning' && component.taxable)
          .reduce((sum, component) => sum + component.amount, 0),
      );
    }

    // Every PayAdjustment for the final period counts — earning kinds add,
    // deduction kinds (including advance recovery) subtract. Previously only
    // advanceRecovery was read, dropping bonuses/arrears owed in the last month.
    const adjustments = await this.compensation.getAdjustmentsForPeriod(employeeId, year, month);
    let adjustmentEarnings = 0;
    let adjustmentDeductions = 0;
    let taxableAdjustmentEarnings = 0;
    for (const adjustment of adjustments) {
      const resolved = prorateComponent(
        adjustment.amount,
        adjustment.dependsOnPaymentDays,
        workedDays,
        standardWorkingDays,
      );
      if (adjustment.category === 'earning') {
        adjustmentEarnings += resolved.amount;
        if (adjustment.taxable) {
          taxableAdjustmentEarnings += resolved.amount;
        }
      } else if (adjustment.category === 'deduction') {
        adjustmentDeductions += resolved.amount;
      }
    }
    adjustmentEarnings = round2(adjustmentEarnings);
    const recoveryAmount = round2(adjustmentDeductions);

    const balances = await this.leaveBalances.listForEmployee(employeeId);
    const leaveBalanceDays = balances.reduce(
      (sum, balance) =>
        sum +
        Math.max(
          0,
          Number(balance.entitledDays) - Number(balance.usedDays) - Number(balance.pendingDays),
        ),
      0,
    );
    const leaveEncashmentAmount =
      standardWorkingDays > 0 && monthlyGross > 0
        ? round2((monthlyGross / standardWorkingDays) * leaveBalanceDays)
        : 0;

    const payableTotal = round2(
      proRatedEarnings + adjustmentEarnings + leaveEncashmentAmount - recoveryAmount,
    );

    // Withholding, same engine as a normal payslip. Encashment is treated as
    // taxable cash compensation.
    const ladder = await this.taxSlabs.getActiveLadder();
    const taxableAmount = round2(
      taxableEarnings + taxableAdjustmentEarnings + leaveEncashmentAmount,
    );
    const incomeTaxAmount = calculateMonthlyWithholding(taxableAmount, ladder ?? []);
    const netPayableAmount = round2(payableTotal - incomeTaxAmount);

    const notes: string[] = [];
    if (!revision) {
      notes.push('No salary assignment as of the termination date');
    }
    if (standardWorkingDays === 0) {
      notes.push('No working days in the final period');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const run = async (target: EntityManager): Promise<FinalSettlement> => {
      const settlement = await target.save(
        target.create(FinalSettlement, {
          organizationId,
          employeeId,
          terminationDate,
          periodYear: year,
          periodMonth: month,
          currency,
          standardWorkingDays,
          workedDays: toDays(workedDays),
          proRatedEarnings: toMoney(proRatedEarnings),
          adjustmentEarnings: toMoney(adjustmentEarnings),
          leaveBalanceDays: toDays(leaveBalanceDays),
          leaveEncashmentAmount: toMoney(leaveEncashmentAmount),
          recoveryAmount: toMoney(recoveryAmount),
          payableTotal: toMoney(payableTotal),
          taxableAmount: toMoney(taxableAmount),
          incomeTaxAmount: toMoney(incomeTaxAmount),
          netPayableAmount: toMoney(netPayableAmount),
          status: 'computed',
          computedAt: new Date(),
          note: notes.length > 0 ? notes.join('; ') : null,
        }),
      );
      await this.audit.record(
        {
          action: 'compute',
          resourceType: 'final_settlement',
          resourceId: settlement.id,
          after: { employeeId, payableTotal, netPayableAmount, terminationDate },
        },
        target,
      );
      return settlement;
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  async getForEmployee(employeeId: EmployeeId): Promise<FinalSettlement | null> {
    const rows = await this.settlements.find({
      where: { employeeId } as FindOptionsWhere<FinalSettlement>,
      order: { computedAt: 'DESC' },
    });
    return rows[0] ?? null;
  }

  // A computed settlement is outstanding until finance confirms the payout; the
  // record keeps the value date and bank reference for the audit trail.
  async markPaid(input: {
    readonly employeeId: EmployeeId;
    readonly paymentReference?: string | null;
    readonly settlementDate?: IsoDate | null;
  }): Promise<FinalSettlement> {
    if (input.paymentReference != null && input.paymentReference.length > 120) {
      throw new ValidationFailedError('paymentReference must be 120 characters or fewer');
    }
    if (input.settlementDate != null && !isIsoDate(input.settlementDate)) {
      throw new ValidationFailedError(
        'settlementDate must be a real calendar date (YYYY-MM-DD)',
        { settlementDate: input.settlementDate },
      );
    }
    // Lock the settlement row so two concurrent confirmations cannot both read
    // `computed`, and keep the audit record in the same transaction: a failed
    // audit rolls the transition back instead of leaving a paid row without one.
    const saved = await this.dataSource.transaction(async (manager) => {
      const organizationId = this.tenantContext.getOrganizationId();
      const settlement = await manager.findOne(FinalSettlement, {
        where: {
          employeeId: input.employeeId,
          organizationId,
        } as FindOptionsWhere<FinalSettlement>,
        order: { computedAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) {
        throw new NotFoundError('Final settlement not found', { employeeId: input.employeeId });
      }
      if (settlement.status !== 'computed') {
        throw new ConflictError(`Settlement is already ${settlement.status}`, {
          employeeId: input.employeeId,
        });
      }
      settlement.status = 'paid';
      settlement.paidAt = input.settlementDate
        ? new Date(`${input.settlementDate}T00:00:00.000Z`)
        : new Date();
      settlement.paymentReference = input.paymentReference ?? null;
      const persisted = await manager.save(settlement);
      await this.audit.record(
        {
          action: 'markPaid',
          resourceType: 'final_settlement',
          resourceId: persisted.id,
          after: {
            employeeId: input.employeeId,
            netPayableAmount: Number(persisted.netPayableAmount),
            paymentReference: persisted.paymentReference,
          },
        },
        manager,
      );
      return persisted;
    });
    return saved;
  }
}
