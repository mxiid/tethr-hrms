import {
  addIsoDays,
  compareIsoDate,
  isIsoDate,
  isoMonthRange,
  rangeContains,
  toId,
  type BonusAwardId,
  type BonusReason,
  type CompensationChangeReason,
  type EmployeeId,
  type GradeId,
  type IsoDate,
  type PayComponentCategory,
  type PayComponentId,
  type PayFrequency,
  type SalaryRevisionId,
  type SalaryStructureId,
  type StructureComponentCalcType,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';

import {
  PAY_COMPONENT_REPOSITORY,
  BONUS_AWARD_REPOSITORY,
  PAY_ADJUSTMENT_REPOSITORY,
  SALARY_REVISION_REPOSITORY,
  SALARY_STRUCTURE_COMPONENT_REPOSITORY,
  SALARY_STRUCTURE_REPOSITORY,
} from './compensation.tokens';
import { BonusAward } from './entities/bonus-award.entity';
import { PayAdjustment, type PayAdjustmentKind } from './entities/pay-adjustment.entity';
import { PayComponent } from './entities/pay-component.entity';
import { SalaryRevision } from './entities/salary-revision.entity';
import { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import { SalaryStructure } from './entities/salary-structure.entity';

type CreatePayComponentData = {
  readonly name: string;
  readonly code: string;
  readonly category: PayComponentCategory;
  readonly taxable?: boolean;
  readonly recurring?: boolean;
  readonly dependsOnPaymentDays?: boolean;
};

type CreateSalaryStructureData = {
  readonly name: string;
  readonly code: string;
  readonly gradeId?: GradeId | null;
  readonly defaultAnnualAmount?: number | null;
  readonly currency: string;
  readonly payFrequency?: PayFrequency;
};

// One line of a structure's gross-split composition. Replaces the whole
// composition on write (simple, auditable, no partial-state drift).
type StructureComponentData = {
  readonly componentId: PayComponentId;
  readonly calcType: StructureComponentCalcType;
  readonly value: number;
  readonly sortOrder?: number;
};

// The resolved breakdown payroll consumes: display facts snapshotted from the
// tenant's own component config, amounts derived from the period gross. `amount`
// is the FULL-period amount — payroll pro-rates it by payable days when
// `dependsOnPaymentDays` is true, so this type stays about entitlement, not days.
export type StructureBreakdownLine = {
  readonly componentCode: string;
  readonly componentName: string;
  readonly category: PayComponentCategory;
  readonly taxable: boolean;
  readonly dependsOnPaymentDays: boolean;
  readonly amount: number;
};

type ReviseSalaryData = {
  readonly employeeId: EmployeeId;
  readonly salaryStructureId: SalaryStructureId;
  readonly effectiveDate: IsoDate;
  readonly annualAmount: number;
  readonly reason?: CompensationChangeReason;
  readonly approvedByUserId?: UserId | null;
  readonly note?: string | null;
};

type CreatePayAdjustmentData = {
  readonly employeeId: EmployeeId;
  readonly componentId: PayComponentId;
  readonly amount: number;
  readonly currency: string;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly kind: PayAdjustmentKind;
  readonly sourceType?: string | null;
  readonly sourceId?: string | null;
  readonly overwritesStructureAmount?: boolean;
  readonly isRecurring?: boolean;
  readonly recurringFrom?: IsoDate | null;
  readonly recurringTo?: IsoDate | null;
  readonly note?: string | null;
};

// A period adjustment resolved to the display facts payroll snapshots onto a run
// line component (and thus a payslip), carrying its provenance.
type ResolvedAdjustment = {
  readonly componentId: PayComponentId;
  readonly componentCode: string;
  readonly componentName: string;
  readonly category: PayComponentCategory;
  readonly taxable: boolean;
  readonly dependsOnPaymentDays: boolean;
  readonly amount: number;
  readonly kind: PayAdjustmentKind;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly overwritesStructureAmount: boolean;
  readonly note: string | null;
};

type AwardBonusData = {
  readonly employeeId: EmployeeId;
  readonly awardDate: IsoDate;
  readonly currency: string;
  readonly amount: number;
  readonly reason?: BonusReason;
  readonly awardedByUserId: UserId;
  readonly approvedByUserId?: UserId | null;
  readonly note?: string | null;
};

const toAmount = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

const normalizeCurrency = (value: string): string => {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationFailedError('currency must be a 3-letter ISO code');
  }
  return currency;
};

const toMoneyString = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

// Owns Phase 3 compensation configuration and effective-dated employee salary
// facts. Payroll will consume the current salary as-of a pay period; it should
// not reach into these tables directly.
@Injectable()
export class CompensationService {
  constructor(
    @Inject(PAY_COMPONENT_REPOSITORY)
    private readonly payComponents: TenantScopedRepository<PayComponent>,
    @Inject(SALARY_STRUCTURE_REPOSITORY)
    private readonly salaryStructures: TenantScopedRepository<SalaryStructure>,
    @Inject(SALARY_STRUCTURE_COMPONENT_REPOSITORY)
    private readonly structureComponents: TenantScopedRepository<SalaryStructureComponent>,
    @Inject(SALARY_REVISION_REPOSITORY)
    private readonly salaryRevisions: TenantScopedRepository<SalaryRevision>,
    @Inject(BONUS_AWARD_REPOSITORY)
    private readonly bonusAwards: TenantScopedRepository<BonusAward>,
    @Inject(PAY_ADJUSTMENT_REPOSITORY)
    private readonly payAdjustments: TenantScopedRepository<PayAdjustment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async createPayComponent(input: CreatePayComponentData): Promise<PayComponent> {
    const component = this.payComponents.create({
      name: input.name,
      code: input.code,
      category: input.category,
      taxable: input.taxable ?? true,
      recurring: input.recurring ?? true,
      dependsOnPaymentDays: input.dependsOnPaymentDays ?? true,
    });
    const saved = await this.payComponents.save(component);
    await this.audit.record({
      action: 'create',
      resourceType: 'pay_component',
      resourceId: saved.id,
      after: { code: saved.code, category: saved.category },
    });
    return saved;
  }

  listPayComponents(): Promise<PayComponent[]> {
    return this.payComponents.find({ order: { code: 'ASC' } });
  }

  async createSalaryStructure(input: CreateSalaryStructureData): Promise<SalaryStructure> {
    if (input.defaultAnnualAmount != null && input.defaultAnnualAmount < 0) {
      throw new ValidationFailedError('defaultAnnualAmount must be zero or greater');
    }
    // At most one active structure per grade, so grade-driven defaults are
    // unambiguous (plan Phase 1 #8).
    if (input.gradeId) {
      const conflicting = await this.salaryStructures.findOne({
        where: { gradeId: input.gradeId, isActive: true } as FindOptionsWhere<SalaryStructure>,
      });
      if (conflicting) {
        throw new ConflictError('An active salary structure already targets this grade', {
          gradeId: input.gradeId,
          structureId: conflicting.id,
        });
      }
    }
    const structure = this.salaryStructures.create({
      name: input.name,
      code: input.code,
      gradeId: input.gradeId ?? null,
      defaultAnnualAmount:
        input.defaultAnnualAmount == null ? null : toMoneyString(input.defaultAnnualAmount),
      currency: normalizeCurrency(input.currency),
      payFrequency: input.payFrequency ?? 'monthly',
      isActive: true,
    });
    const saved = await this.salaryStructures.save(structure);
    await this.audit.record({
      action: 'create',
      resourceType: 'salary_structure',
      resourceId: saved.id,
      after: { code: saved.code, currency: saved.currency, payFrequency: saved.payFrequency },
    });
    return saved;
  }

  // Grade-driven default: the active structure targeting a grade, if any. Used
  // to pre-fill new-hire pay setup.
  findActiveStructureForGrade(gradeId: GradeId): Promise<SalaryStructure | null> {
    return this.salaryStructures.findOne({
      where: { gradeId, isActive: true } as FindOptionsWhere<SalaryStructure>,
    });
  }

  listSalaryStructures(): Promise<SalaryStructure[]> {
    return this.salaryStructures.find({ order: { code: 'ASC' } });
  }

  // Replace the whole gross-split composition of a structure. Percent lines must
  // not allocate more than 100% of gross; fixed amounts must be non-negative.
  async setSalaryStructureComponents(
    structureId: SalaryStructureId,
    components: readonly StructureComponentData[],
  ): Promise<SalaryStructureComponent[]> {
    const structure = await this.salaryStructures.findById(structureId);
    if (!structure) {
      throw new NotFoundError('Salary structure not found', { id: structureId });
    }

    let percentTotal = 0;
    for (const component of components) {
      if (component.calcType === 'percentOfGross') {
        if (component.value <= 0 || component.value > 100) {
          throw new ValidationFailedError('percentOfGross value must be within (0, 100]', {
            value: component.value,
          });
        }
        percentTotal += component.value;
      } else if (component.value < 0) {
        throw new ValidationFailedError('fixedMonthly value must be zero or greater', {
          value: component.value,
        });
      }
    }
    if (percentTotal > 100 + Number.EPSILON) {
      throw new ValidationFailedError('percentOfGross values exceed 100% of gross', {
        percentTotal,
      });
    }
    const componentIds = new Set(components.map((component) => component.componentId));
    if (componentIds.size !== components.length) {
      throw new ValidationFailedError('Duplicate component in structure composition');
    }
    for (const componentId of componentIds) {
      if (!(await this.payComponents.findById(componentId))) {
        throw new NotFoundError('Pay component not found', { id: componentId });
      }
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const saved = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.find(SalaryStructureComponent, {
        where: { organizationId, structureId } as FindOptionsWhere<SalaryStructureComponent>,
      });
      for (const row of existing) {
        await manager.remove(row);
      }
      const rows = components.map((component, index) =>
        manager.create(SalaryStructureComponent, {
          organizationId,
          structureId,
          componentId: component.componentId,
          calcType: component.calcType,
          value: toAmount(component.value),
          sortOrder: component.sortOrder ?? index,
        }),
      );
      const persisted: SalaryStructureComponent[] = [];
      for (const row of rows) {
        persisted.push(await manager.save(row));
      }
      return persisted;
    });

    await this.audit.record({
      action: 'setComponents',
      resourceType: 'salary_structure',
      resourceId: structureId,
      after: { componentCount: saved.length },
    });
    return saved;
  }

  listSalaryStructureComponents(structureId: SalaryStructureId): Promise<SalaryStructureComponent[]> {
    return this.structureComponents.find({
      where: { structureId } as FindOptionsWhere<SalaryStructureComponent>,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  // The published calculation payroll consumes: resolve a structure's composition
  // into concrete amounts for a period gross. percentOfGross lines scale with the
  // gross; fixedMonthly lines pass through at face value.
  async getStructureComponentBreakdown(
    structureId: SalaryStructureId,
    monthlyGross: number,
  ): Promise<StructureBreakdownLine[]> {
    const [composition, components] = await Promise.all([
      this.listSalaryStructureComponents(structureId),
      this.payComponents.find(),
    ]);
    const byId = new Map(components.map((component) => [component.id, component]));
    return composition.flatMap((row) => {
      const component = byId.get(row.componentId);
      if (!component) {
        return [];
      }
      const amount =
        row.calcType === 'percentOfGross'
          ? (monthlyGross * Number(row.value)) / 100
          : Number(row.value);
      return [
        {
          componentCode: component.code,
          componentName: component.name,
          category: component.category,
          taxable: component.taxable,
          dependsOnPaymentDays: component.dependsOnPaymentDays,
          amount: Math.round(amount * 100) / 100,
        },
      ];
    });
  }

  async reviseSalary(input: ReviseSalaryData): Promise<SalaryRevision> {
    if (!isIsoDate(input.effectiveDate)) {
      throw new ValidationFailedError('effectiveDate must be a valid ISO date');
    }
    if (input.annualAmount <= 0) {
      throw new ValidationFailedError('annualAmount must be greater than zero');
    }
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const structure = await this.salaryStructures.findById(input.salaryStructureId);
    if (!structure) {
      throw new NotFoundError('Salary structure not found', { id: input.salaryStructureId });
    }
    if (!structure.isActive) {
      throw new ValidationFailedError('Salary structure is inactive', {
        id: input.salaryStructureId,
      });
    }

    const annualAmount = toAmount(input.annualAmount);
    const organizationId = this.tenantContext.getOrganizationId();
    const saved = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.find(SalaryRevision, {
        where: {
          organizationId,
          employeeId: input.employeeId,
        } as FindOptionsWhere<SalaryRevision>,
        order: { validFrom: 'ASC' },
      });

      const sameDay = existing.find((revision) => revision.validFrom === input.effectiveDate);
      if (sameDay) {
        throw new ConflictError('Salary revision already exists for effective date', {
          effectiveDate: input.effectiveDate,
        });
      }

      const future = existing.find(
        (revision) => compareIsoDate(revision.validFrom, input.effectiveDate) > 0,
      );
      if (future) {
        throw new ConflictError('Cannot insert salary revision before a future revision', {
          futureEffectiveDate: future.validFrom,
        });
      }

      const active = existing.find((revision) => rangeContains(revision, input.effectiveDate));
      if (active && active.validTo !== null) {
        throw new ConflictError('Cannot revise a closed historical salary range', {
          validFrom: active.validFrom,
          validTo: active.validTo,
        });
      }
      if (active) {
        active.validTo = input.effectiveDate;
        await manager.save(active);
      }

      const revision = manager.create(SalaryRevision, {
        organizationId,
        employeeId: input.employeeId,
        salaryStructureId: input.salaryStructureId,
        validFrom: input.effectiveDate,
        validTo: null,
        currency: structure.currency,
        annualAmount,
        reason: input.reason ?? (existing.length === 0 ? 'hire' : 'merit'),
        approvedByUserId: input.approvedByUserId ?? null,
        note: input.note ?? null,
      });
      const persisted = await manager.save(revision);

      await this.publisher.publishWithin(manager, {
        name: 'compensation.revised',
        payload: {
          salaryRevisionId: toId<SalaryRevisionId>(persisted.id),
          employeeId: input.employeeId,
          salaryStructureId: input.salaryStructureId,
          effectiveDate: input.effectiveDate,
          currency: persisted.currency,
          annualAmount: Number(persisted.annualAmount),
        },
      });
      return persisted;
    });

    await this.audit.record({
      action: 'revise',
      resourceType: 'salary_revision',
      resourceId: saved.id,
      after: {
        employeeId: saved.employeeId,
        validFrom: saved.validFrom,
        annualAmount: Number(saved.annualAmount),
      },
    });
    return saved;
  }

  listSalaryRevisions(employeeId: EmployeeId): Promise<SalaryRevision[]> {
    return this.salaryRevisions.find({
      where: { employeeId } as FindOptionsWhere<SalaryRevision>,
      order: { validFrom: 'DESC' },
    });
  }

  async getCurrentSalaryRevision(
    employeeId: EmployeeId,
    asOf: IsoDate,
  ): Promise<SalaryRevision | null> {
    if (!isIsoDate(asOf)) {
      throw new ValidationFailedError('asOf must be a valid ISO date');
    }
    const revisions = await this.listSalaryRevisions(employeeId);
    return revisions.find((revision) => rangeContains(revision, asOf)) ?? null;
  }

  // Published write for the `employee.terminated` consumer (plan Phase 2 #15):
  // close the open revision after the last covered day so history stops being
  // open-ended forever. validTo is exclusive, so the revision stays in force ON
  // the termination date (which the final-settlement maths needs) and ends the
  // next day. No-op when there is no open revision.
  async closeOpenRevisionAt(employeeId: EmployeeId, lastCoveredDate: IsoDate): Promise<void> {
    const open = await this.salaryRevisions.findOne({
      where: { employeeId, validTo: IsNull() } as FindOptionsWhere<SalaryRevision>,
      order: { validFrom: 'DESC' },
    });
    if (!open) {
      return;
    }
    const exclusiveEnd = addIsoDays(lastCoveredDate, 1);
    open.validTo =
      compareIsoDate(exclusiveEnd, open.validFrom) < 0 ? open.validFrom : exclusiveEnd;
    await this.salaryRevisions.save(open);
    await this.audit.record({
      action: 'closeRevision',
      resourceType: 'salary_revision',
      resourceId: open.id,
      after: { employeeId, validTo: open.validTo },
    });
  }

  // --- Pay adjustments: the one choke point for period-scoped money changes ---

  async createAdjustment(input: CreatePayAdjustmentData): Promise<PayAdjustment> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    if (!Number.isInteger(input.periodYear) || !Number.isInteger(input.periodMonth)) {
      throw new ValidationFailedError('periodYear and periodMonth are required integers');
    }
    if (input.periodMonth < 1 || input.periodMonth > 12) {
      throw new ValidationFailedError('periodMonth must be between 1 and 12');
    }
    if (input.amount <= 0) {
      throw new ValidationFailedError('amount must be greater than zero');
    }
    const component = await this.payComponents.findById(input.componentId);
    if (!component) {
      throw new NotFoundError('Pay component not found', { id: input.componentId });
    }
    // The component's category decides the money direction, so a mispaired kind
    // would silently add where it should subtract (e.g. an advance recovery on
    // an earning component). Enforce the pairing up front.
    const earningKinds: readonly PayAdjustmentKind[] = ['bonus', 'encashment', 'arrear'];
    const deductionKinds: readonly PayAdjustmentKind[] = ['advanceRecovery'];
    if (earningKinds.includes(input.kind) && component.category !== 'earning') {
      throw new ValidationFailedError(
        `A ${input.kind} adjustment must use an earning component`,
        { componentId: input.componentId, category: component.category },
      );
    }
    if (deductionKinds.includes(input.kind) && component.category !== 'deduction') {
      throw new ValidationFailedError(
        `A ${input.kind} adjustment must use a deduction component`,
        { componentId: input.componentId, category: component.category },
      );
    }
    const adjustment = this.payAdjustments.create({
      employeeId: input.employeeId,
      componentId: input.componentId,
      amount: toAmount(input.amount),
      currency: normalizeCurrency(input.currency),
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      kind: input.kind,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      overwritesStructureAmount: input.overwritesStructureAmount ?? false,
      isRecurring: input.isRecurring ?? false,
      recurringFrom: input.recurringFrom ?? null,
      recurringTo: input.recurringTo ?? null,
      note: input.note ?? null,
    });
    const saved = await this.payAdjustments.save(adjustment);
    await this.audit.record({
      action: 'create',
      resourceType: 'pay_adjustment',
      resourceId: saved.id,
      after: {
        employeeId: saved.employeeId,
        kind: saved.kind,
        amount: Number(saved.amount),
        period: `${saved.periodYear}-${String(saved.periodMonth).padStart(2, '0')}`,
      },
    });
    return saved;
  }

  listAdjustmentsFor(employeeId: EmployeeId): Promise<PayAdjustment[]> {
    return this.payAdjustments.find({
      where: { employeeId } as FindOptionsWhere<PayAdjustment>,
      order: { periodYear: 'DESC', periodMonth: 'DESC', createdAt: 'DESC' },
    });
  }

  // Published read payroll consumes: every adjustment that applies to a period,
  // resolved to component display facts. Recurring windows overlap by date;
  // one-off adjustments match the exact period.
  async getAdjustmentsForPeriod(
    employeeId: EmployeeId,
    periodYear: number,
    periodMonth: number,
  ): Promise<ResolvedAdjustment[]> {
    const [adjustments, components] = await Promise.all([
      this.listAdjustmentsFor(employeeId),
      this.payComponents.find(),
    ]);
    const byId = new Map(components.map((component) => [component.id, component]));
    const { start, endExclusive } = isoMonthRange(periodYear, periodMonth);
    const monthEnd = addIsoDays(endExclusive, -1);
    const appliesToPeriod = (adjustment: PayAdjustment): boolean => {
      if (!adjustment.isRecurring) {
        return adjustment.periodYear === periodYear && adjustment.periodMonth === periodMonth;
      }
      const from = adjustment.recurringFrom ?? start;
      const to = adjustment.recurringTo ?? monthEnd;
      return compareIsoDate(from, monthEnd) <= 0 && compareIsoDate(to, start) >= 0;
    };
    return adjustments.flatMap((adjustment) => {
      if (!appliesToPeriod(adjustment)) {
        return [];
      }
      const component = byId.get(adjustment.componentId);
      if (!component) {
        return [];
      }
      return [
        {
          componentId: adjustment.componentId,
          componentCode: component.code,
          componentName: component.name,
          category: component.category,
          taxable: component.taxable,
          dependsOnPaymentDays: component.dependsOnPaymentDays,
          amount: Number(adjustment.amount),
          kind: adjustment.kind,
          sourceType: adjustment.sourceType,
          sourceId: adjustment.sourceId,
          overwritesStructureAmount: adjustment.overwritesStructureAmount,
          note: adjustment.note,
        },
      ];
    });
  }

  // Find-or-create a configuration component (used to give a bonus a real
  // earning component to ride on).
  private async ensureComponent(
    manager: EntityManager,
    input: {
      code: string;
      name: string;
      category: PayComponentCategory;
      taxable: boolean;
      dependsOnPaymentDays: boolean;
    },
  ): Promise<PayComponent> {
    const organizationId = this.tenantContext.getOrganizationId();
    const existing = await manager.findOne(PayComponent, {
      where: { organizationId, code: input.code } as FindOptionsWhere<PayComponent>,
    });
    if (existing) {
      return existing;
    }
    return manager.save(
      manager.create(PayComponent, {
        organizationId,
        name: input.name,
        code: input.code,
        category: input.category,
        taxable: input.taxable,
        recurring: false,
        dependsOnPaymentDays: input.dependsOnPaymentDays,
      }),
    );
  }

  async awardBonus(input: AwardBonusData): Promise<BonusAward> {
    if (!isIsoDate(input.awardDate)) {
      throw new ValidationFailedError('awardDate must be a valid ISO date');
    }
    if (input.amount <= 0) {
      throw new ValidationFailedError('amount must be greater than zero');
    }
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const organizationId = this.tenantContext.getOrganizationId();
    const bonus = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(BonusAward, {
        organizationId,
        employeeId: input.employeeId,
        awardDate: input.awardDate,
        currency: normalizeCurrency(input.currency),
        amount: toAmount(input.amount),
        reason: input.reason ?? 'clientApproved',
        awardedByUserId: input.awardedByUserId,
        approvedByUserId: input.approvedByUserId ?? null,
        note: input.note ?? null,
      });
      const saved = await manager.save(entity);
      // Phase 2 #13: a bonus becomes a PayAdjustment so it is actually paid and
      // visible wherever components are, instead of being a dead-end award.
      const bonusComponent = await this.ensureComponent(manager, {
        code: 'bonus',
        name: 'Bonus',
        category: 'earning',
        taxable: true,
        dependsOnPaymentDays: false,
      });
      await manager.save(
        manager.create(PayAdjustment, {
          organizationId,
          employeeId: saved.employeeId,
          componentId: toId<PayComponentId>(bonusComponent.id),
          amount: toAmount(input.amount),
          currency: saved.currency,
          periodYear: Number(input.awardDate.slice(0, 4)),
          periodMonth: Number(input.awardDate.slice(5, 7)),
          kind: 'bonus',
          sourceType: 'bonusAward',
          sourceId: saved.id,
          overwritesStructureAmount: false,
          isRecurring: false,
          recurringFrom: null,
          recurringTo: null,
          note: input.note ?? null,
        }),
      );
      await this.publisher.publishWithin(manager, {
        name: 'bonus.awarded',
        payload: {
          bonusAwardId: toId<BonusAwardId>(saved.id),
          employeeId: saved.employeeId,
          amount: Number(saved.amount),
          currency: saved.currency,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'award',
      resourceType: 'bonus_award',
      resourceId: bonus.id,
      after: {
        employeeId: bonus.employeeId,
        amount: Number(bonus.amount),
        currency: bonus.currency,
      },
    });
    return bonus;
  }

  listBonusAwards(employeeId: EmployeeId): Promise<BonusAward[]> {
    return this.bonusAwards.find({
      where: { employeeId } as FindOptionsWhere<BonusAward>,
      order: { awardDate: 'DESC', createdAt: 'DESC' },
    });
  }
}
