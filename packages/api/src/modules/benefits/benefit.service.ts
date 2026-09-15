import {
  addIsoDays,
  compareIsoDate,
  isoMonthRange,
  rangesOverlap,
  type EmployeeId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../employee';

import { BENEFIT_ENROLLMENT_REPOSITORY, BENEFIT_PLAN_REPOSITORY } from './benefits.tokens';
import { BenefitEnrollment } from './entities/benefit-enrollment.entity';
import { BenefitPlan } from './entities/benefit-plan.entity';

export type CreateBenefitPlanData = {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly employeeContributionAmount: number;
  readonly employerContributionAmount: number;
  readonly reducesTaxable?: boolean;
};

export type UpdateBenefitPlanData = {
  readonly planId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly employeeContributionAmount?: number;
  readonly employerContributionAmount?: number;
  readonly reducesTaxable?: boolean;
  readonly isActive?: boolean;
};

export type SetBenefitEnrollmentData = {
  readonly employeeId: EmployeeId;
  readonly planId: string;
  readonly effectiveDate?: string;
  readonly note?: string | null;
};

// What payroll consumes for one employee and period: the plan's shares, already
// prorated for any partial coverage of the month (a mid-month join pays the
// covered fraction; the shares never prorate with LOP).
export type EnrollmentCharge = {
  readonly enrollmentId: string;
  readonly planId: string;
  readonly planCode: string;
  readonly planName: string;
  readonly employeeShare: number;
  readonly employerShare: number;
  readonly reducesTaxable: boolean;
};

export type BenefitEnrollmentDetail = {
  readonly enrollment: BenefitEnrollment;
  readonly plan: BenefitPlan | null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const toAmount = (value: number): string => round2(value).toFixed(2);
const todayIso = (): string => new Date().toISOString().slice(0, 10);

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// The fraction of `year-month` an enrollment interval covers (calendar days).
const coverageShare = (
  validFrom: string,
  validTo: string | null,
  year: number,
  month: number,
): number => {
  const { start, endExclusive } = isoMonthRange(year, month);
  const lastDay = addIsoDays(endExclusive, -1);
  const windowStart = compareIsoDate(validFrom, start) > 0 ? validFrom : start;
  const windowEnd =
    validTo !== null && compareIsoDate(addIsoDays(validTo, -1), lastDay) < 0
      ? addIsoDays(validTo, -1)
      : lastDay;
  if (compareIsoDate(windowStart, windowEnd) > 0) {
    return 0;
  }
  let days = 0;
  for (let cursor = windowStart; compareIsoDate(cursor, windowEnd) <= 0; cursor = addIsoDays(cursor, 1)) {
    days += 1;
  }
  return days / daysInMonth(year, month);
};

// Benefit plans and effective-dated enrollments. Payroll reads the active
// charges through this published surface and materializes them as a pre-tax/
// post-tax deduction plus an employer-contribution line.
@Injectable()
export class BenefitService {
  constructor(
    @Inject(BENEFIT_PLAN_REPOSITORY)
    private readonly plans: TenantScopedRepository<BenefitPlan>,
    @Inject(BENEFIT_ENROLLMENT_REPOSITORY)
    private readonly enrollments: TenantScopedRepository<BenefitEnrollment>,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  // --- Plans ---

  listPlans(): Promise<BenefitPlan[]> {
    return this.plans.find({ order: { name: 'ASC' } });
  }

  async createPlan(input: CreateBenefitPlanData): Promise<BenefitPlan> {
    const code = input.code.trim().toUpperCase().slice(0, 32);
    if (code.length === 0) {
      throw new ValidationFailedError('code is required');
    }
    if (input.employeeContributionAmount < 0 || input.employerContributionAmount < 0) {
      throw new ValidationFailedError('Contribution amounts must be zero or greater');
    }
    const existing = await this.plans.findOne({
      where: { code } as FindOptionsWhere<BenefitPlan>,
    });
    if (existing) {
      throw new ConflictError('A benefit plan with this code already exists', { code });
    }
    const saved = await this.plans.save(
      this.plans.create({
        code,
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 300) ?? null,
        employeeContributionAmount: toAmount(input.employeeContributionAmount),
        employerContributionAmount: toAmount(input.employerContributionAmount),
        reducesTaxable: input.reducesTaxable ?? false,
        isActive: true,
      }),
    );
    await this.audit.record({
      action: 'create',
      resourceType: 'benefit_plan',
      resourceId: saved.id,
      after: { code: saved.code, name: saved.name },
    });
    return saved;
  }

  async updatePlan(input: UpdateBenefitPlanData): Promise<BenefitPlan> {
    const plan = await this.plans.findById(input.planId);
    if (!plan) {
      throw new NotFoundError('Benefit plan not found', { id: input.planId });
    }
    if (input.name !== undefined) plan.name = input.name.trim().slice(0, 120);
    if (input.description !== undefined) {
      plan.description = input.description?.trim().slice(0, 300) ?? null;
    }
    if (input.employeeContributionAmount !== undefined) {
      if (input.employeeContributionAmount < 0) {
        throw new ValidationFailedError('employeeContributionAmount must be zero or greater');
      }
      plan.employeeContributionAmount = toAmount(input.employeeContributionAmount);
    }
    if (input.employerContributionAmount !== undefined) {
      if (input.employerContributionAmount < 0) {
        throw new ValidationFailedError('employerContributionAmount must be zero or greater');
      }
      plan.employerContributionAmount = toAmount(input.employerContributionAmount);
    }
    if (input.reducesTaxable !== undefined) plan.reducesTaxable = input.reducesTaxable;
    if (input.isActive !== undefined) plan.isActive = input.isActive;
    const saved = await this.plans.save(plan);
    await this.audit.record({
      action: 'update',
      resourceType: 'benefit_plan',
      resourceId: saved.id,
      after: {
        name: saved.name,
        employeeContributionAmount: Number(saved.employeeContributionAmount),
        employerContributionAmount: Number(saved.employerContributionAmount),
        reducesTaxable: saved.reducesTaxable,
        isActive: saved.isActive,
      },
    });
    return saved;
  }

  // --- Enrollments ---

  async listEnrollments(employeeId: EmployeeId): Promise<BenefitEnrollmentDetail[]> {
    const enrollments = await this.enrollments.find({
      where: { employeeId } as FindOptionsWhere<BenefitEnrollment>,
      order: { validFrom: 'DESC' },
    });
    const plans = await this.plans.find();
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    return enrollments.map((enrollment) => ({
      enrollment,
      plan: planById.get(enrollment.planId) ?? null,
    }));
  }

  // Enrolling closes the employee's open interval for that plan at the new
  // effective date and opens a fresh one. Unlike tax facts, benefits never
  // backdate: an enrollment bills from the date finance chose (default today).
  async setEnrollment(input: SetBenefitEnrollmentData): Promise<BenefitEnrollment> {
    const employee = await this.employeeDirectory.getById(input.employeeId);
    if (!employee) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const plan = await this.plans.findById(input.planId);
    if (!plan || !plan.isActive) {
      throw new NotFoundError('Benefit plan not found', { id: input.planId });
    }
    const validFrom = input.effectiveDate ?? todayIso();
    const open = await this.enrollments.findOne({
      where: {
        employeeId: input.employeeId,
        planId: input.planId,
        validTo: IsNull(),
      } as FindOptionsWhere<BenefitEnrollment>,
      order: { validFrom: 'DESC' },
    });
    if (open && open.validFrom === validFrom) {
      return open;
    }
    // validTo is exclusive and intervals must stay well-formed: a new
    // enrollment cannot start before the open one does, because closing that
    // one at the new date would create an inverted range. Benefits never
    // backdate.
    if (open && compareIsoDate(validFrom, open.validFrom) < 0) {
      throw new ValidationFailedError(
        `This plan is already enrolled from ${open.validFrom}; an enrollment cannot start earlier`,
        { employeeId: input.employeeId, planId: input.planId, openFrom: open.validFrom },
      );
    }
    const history = await this.enrollments.find({
      where: { employeeId: input.employeeId } as FindOptionsWhere<BenefitEnrollment>,
    });
    const conflict = history.find(
      (enrollment) =>
        enrollment.planId === input.planId &&
        enrollment.id !== open?.id &&
        rangesOverlap(
          { validFrom: enrollment.validFrom, validTo: enrollment.validTo },
          { validFrom, validTo: null },
        ),
    );
    if (conflict) {
      throw new ConflictError('This plan is already enrolled for the period', {
        employeeId: input.employeeId,
        planId: input.planId,
        conflictingEnrollmentId: conflict.id,
      });
    }
    const organizationId = this.tenantContext.getOrganizationId();
    const saved = await this.dataSource.transaction(async (manager) => {
      if (open) {
        open.validTo = validFrom;
        await manager.save(open);
      }
      const persisted = await manager.save(
        manager.create(BenefitEnrollment, {
          organizationId,
          employeeId: input.employeeId,
          planId: input.planId,
          validFrom,
          validTo: null,
          note: input.note?.slice(0, 300) ?? null,
          // Snapshot the plan's facts: later plan edits are templates for new
          // enrollments and never rewrite what this enrollment bills.
          employeeContributionAmount: plan.employeeContributionAmount,
          employerContributionAmount: plan.employerContributionAmount,
          reducesTaxable: plan.reducesTaxable,
        }),
      );
      await this.publisher.publishWithin(manager, {
        name: 'benefits.enrollmentChanged',
        payload: {
          enrollmentId: persisted.id,
          employeeId: input.employeeId,
          effectiveDate: validFrom,
        },
      });
      return persisted;
    });
    await this.audit.record({
      action: 'enroll',
      resourceType: 'benefit_enrollment',
      resourceId: saved.id,
      after: { employeeId: saved.employeeId, planId: saved.planId, validFrom: saved.validFrom },
    });
    return saved;
  }

  async endEnrollment(
    employeeId: EmployeeId,
    planId: string,
    endDate?: string | null,
  ): Promise<void> {
    const open = await this.enrollments.findOne({
      where: { employeeId, planId, validTo: IsNull() } as FindOptionsWhere<BenefitEnrollment>,
    });
    if (!open) {
      throw new NotFoundError('Open enrollment not found', { employeeId, planId });
    }
    const exclusiveEnd = endDate ?? todayIso();
    open.validTo = compareIsoDate(exclusiveEnd, open.validFrom) < 0 ? open.validFrom : exclusiveEnd;
    await this.enrollments.save(open);
    await this.publisher.publish({
      name: 'benefits.enrollmentChanged',
      payload: { enrollmentId: open.id, employeeId, effectiveDate: open.validTo },
    });
    await this.audit.record({
      action: 'endEnrollment',
      resourceType: 'benefit_enrollment',
      resourceId: open.id,
      after: { employeeId, validTo: open.validTo },
    });
  }

  // Published write for the `employee.terminated` consumer: stop billing the
  // leaver after their last covered day (validTo is exclusive).
  async closeOpenEnrollmentsAt(employeeId: EmployeeId, lastCoveredDate: string): Promise<void> {
    const open = await this.enrollments.find({
      where: { employeeId, validTo: IsNull() } as FindOptionsWhere<BenefitEnrollment>,
    });
    if (open.length === 0) {
      return;
    }
    const exclusiveEnd = addIsoDays(lastCoveredDate, 1);
    for (const enrollment of open) {
      enrollment.validTo =
        compareIsoDate(exclusiveEnd, enrollment.validFrom) < 0
          ? enrollment.validFrom
          : exclusiveEnd;
      await this.enrollments.save(enrollment);
      // Same event as any other enrollment change so open payroll drafts stop
      // billing a leaver's benefits.
      await this.publisher.publish({
        name: 'benefits.enrollmentChanged',
        payload: {
          enrollmentId: enrollment.id,
          employeeId,
          effectiveDate: enrollment.validTo,
        },
      });
    }
    await this.audit.record({
      action: 'closeEnrollments',
      resourceType: 'benefit_enrollment',
      resourceId: employeeId,
      after: { count: open.length, validTo: open[0]?.validTo ?? null },
    });
  }

  // --- Published read for payroll ---

  // Every enrollment covering the period, with shares prorated for partial
  // month coverage. Empty when there are none — payroll then adds no lines.
  async getEnrollmentCharges(
    employeeId: EmployeeId,
    periodYear: number,
    periodMonth: number,
  ): Promise<EnrollmentCharge[]> {
    const enrollments = await this.enrollments.find({
      where: { employeeId } as FindOptionsWhere<BenefitEnrollment>,
    });
    const covering = enrollments.filter(
      (enrollment) =>
        coverageShare(enrollment.validFrom, enrollment.validTo, periodYear, periodMonth) > 0,
    );
    if (covering.length === 0) {
      return [];
    }
    const planIds = [...new Set(covering.map((enrollment) => enrollment.planId))];
    const plans = await this.plans.find({
      where: { id: In(planIds) } as FindOptionsWhere<BenefitPlan>,
    });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const charges: EnrollmentCharge[] = [];
    for (const enrollment of covering) {
      const plan = planById.get(enrollment.planId);
      if (!plan) {
        continue;
      }
      // Deliberately independent of `plan.isActive`: an existing enrollment
      // bills what it was sold (the snapshot below). Deactivating a plan blocks
      // new enrollments; stopping charges for enrolled people is an explicit
      // effective-dated `endEnrollment`.
      const share = coverageShare(
        enrollment.validFrom,
        enrollment.validTo,
        periodYear,
        periodMonth,
      );
      // The enrollment snapshot wins; legacy rows without one read the live plan.
      const employeeAmount = Number(
        enrollment.employeeContributionAmount ?? plan.employeeContributionAmount,
      );
      const employerAmount = Number(
        enrollment.employerContributionAmount ?? plan.employerContributionAmount,
      );
      const employeeShare = round2(employeeAmount * share);
      const employerShare = round2(employerAmount * share);
      if (employeeShare <= 0 && employerShare <= 0) {
        continue;
      }
      charges.push({
        enrollmentId: enrollment.id,
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        employeeShare,
        employerShare,
        reducesTaxable: enrollment.reducesTaxable ?? plan.reducesTaxable,
      });
    }
    return charges;
  }
}
