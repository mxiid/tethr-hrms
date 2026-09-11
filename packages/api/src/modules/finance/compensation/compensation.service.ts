import {
  compareIsoDate,
  isIsoDate,
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
import { DataSource, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';

import {
  PAY_COMPONENT_REPOSITORY,
  BONUS_AWARD_REPOSITORY,
  SALARY_REVISION_REPOSITORY,
  SALARY_STRUCTURE_COMPONENT_REPOSITORY,
  SALARY_STRUCTURE_REPOSITORY,
} from './compensation.tokens';
import { BonusAward } from './entities/bonus-award.entity';
import { PayComponent } from './entities/pay-component.entity';
import { SalaryRevision } from './entities/salary-revision.entity';
import { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import { SalaryStructure } from './entities/salary-structure.entity';

export type CreatePayComponentData = {
  readonly name: string;
  readonly code: string;
  readonly category: PayComponentCategory;
  readonly taxable?: boolean;
  readonly recurring?: boolean;
};

export type CreateSalaryStructureData = {
  readonly name: string;
  readonly code: string;
  readonly gradeId?: GradeId | null;
  readonly currency: string;
  readonly payFrequency?: PayFrequency;
};

// One line of a structure's gross-split composition. Replaces the whole
// composition on write (simple, auditable, no partial-state drift).
export type StructureComponentData = {
  readonly componentId: PayComponentId;
  readonly calcType: StructureComponentCalcType;
  readonly value: number;
  readonly sortOrder?: number;
};

// The resolved breakdown payroll consumes: display facts snapshotted from the
// tenant's own component config, amounts derived from the period gross.
export type StructureBreakdownLine = {
  readonly componentCode: string;
  readonly componentName: string;
  readonly category: PayComponentCategory;
  readonly taxable: boolean;
  readonly amount: number;
};

export type ReviseSalaryData = {
  readonly employeeId: EmployeeId;
  readonly salaryStructureId: SalaryStructureId;
  readonly effectiveDate: IsoDate;
  readonly annualAmount: number;
  readonly reason?: CompensationChangeReason;
  readonly approvedByUserId?: UserId | null;
  readonly note?: string | null;
};

export type AwardBonusData = {
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
    const structure = this.salaryStructures.create({
      name: input.name,
      code: input.code,
      gradeId: input.gradeId ?? null,
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
