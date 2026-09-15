import {
  toId,
  type EmployeeId,
  type OrganizationId,
  type PayComponentId,
  type SalaryStructureId,
  type UserId,
} from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import type { AuditService } from '../../../core/audit/audit.service';
import type { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import type { EmployeeDirectoryService } from '../../employee';

import { CompensationService } from './compensation.service';
import type { BonusAward } from './entities/bonus-award.entity';
import type { EmployeeTaxProfile } from './entities/employee-tax-profile.entity';
import type { PayAdjustment } from './entities/pay-adjustment.entity';
import type { PayComponent } from './entities/pay-component.entity';
import type { SalaryRevision } from './entities/salary-revision.entity';
import type { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import type { SalaryStructure } from './entities/salary-structure.entity';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');
const STRUCTURE = toId<SalaryStructureId>('structure-1');
const FIXTURE_DATE = new Date('2026-01-01T00:00:00.000Z');

const salaryStructure: SalaryStructure = {
  id: STRUCTURE,
  organizationId: ORG,
  createdAt: FIXTURE_DATE,
  updatedAt: FIXTURE_DATE,
  name: 'Default Salary Structure',
  code: 'DEFAULT',
  gradeId: null,
  defaultAnnualAmount: null,
  currency: 'USD',
  payFrequency: 'monthly',
  isActive: true,
};

const buildService = (options: {
  employeeExists?: boolean;
  structure?: SalaryStructure | null;
  existingRevisions?: SalaryRevision[];
}) => {
  const payComponents = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'component-1', ...value }),
    ),
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: 'component-1', category: 'earning' }),
  } as unknown as TenantScopedRepository<PayComponent>;
  const salaryStructures = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ id: STRUCTURE, ...value })),
    find: jest.fn().mockResolvedValue([]),
    findById: jest
      .fn()
      .mockResolvedValue(options.structure === undefined ? salaryStructure : options.structure),
  } as unknown as TenantScopedRepository<SalaryStructure>;
  const salaryRevisions = {
    find: jest.fn().mockResolvedValue(options.existingRevisions ?? []),
  } as unknown as TenantScopedRepository<SalaryRevision>;
  const salaryStructureComponents = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'structure-component-1', ...value }),
    ),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<SalaryStructureComponent>;
  const bonusAwards = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<BonusAward>;
  const payAdjustments = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve(value.id ? value : { id: 'adjustment-1', ...value }),
    ),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<PayAdjustment>;
  const manager = {
    find: jest.fn().mockResolvedValue(options.existingRevisions ?? []),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve(value.id ? value : { id: 'revision-1', ...value }),
    ),
  } as unknown as EntityManager;
  const taxProfiles = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findById: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  } as unknown as TenantScopedRepository<EmployeeTaxProfile>;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const employeeDirectory = {
    exists: jest.fn().mockResolvedValue(options.employeeExists ?? true),
  } as unknown as EmployeeDirectoryService;
  const publisher = {
    publishWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainEventPublisher;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

    const service = new CompensationService(
      payComponents,
      salaryStructures,
      salaryStructureComponents,
      salaryRevisions,
      bonusAwards,
      payAdjustments,
      taxProfiles,
      dataSource,
      employeeDirectory,
      publisher,
      tenantContext,
      audit,
    );

  return { service, publisher, payComponents };
};

const existingRevision = (overrides: Partial<SalaryRevision> = {}): SalaryRevision => ({
  id: 'revision-existing',
    employeeId: EMPLOYEE,
    salaryStructureId: STRUCTURE,
    validFrom: '2026-01-01',
    validTo: null,
    currency: 'USD',
    annualAmount: '120000.00',
    reason: 'hire',
    approvedByUserId: null,
    note: null,
    ...overrides,
  }) as SalaryRevision;

describe('CompensationService.reviseSalary', () => {
  it('creates the first salary revision and emits compensation.revised', async () => {
    const { service, publisher } = buildService({});

    const revision = await service.reviseSalary({
      employeeId: EMPLOYEE,
      salaryStructureId: STRUCTURE,
      effectiveDate: '2026-06-01',
      annualAmount: 120000,
    });

    expect(revision.annualAmount).toBe('120000.00');
    expect(revision.reason).toBe('hire');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'compensation.revised' }),
    );
  });

  it('closes the current open-ended salary revision before creating the next one', async () => {
    const current = existingRevision();
    const { service } = buildService({ existingRevisions: [current] });

    const revision = await service.reviseSalary({
      employeeId: EMPLOYEE,
      salaryStructureId: STRUCTURE,
      effectiveDate: '2026-07-01',
      annualAmount: 132000,
      reason: 'merit',
    });

    expect(current.validTo).toBe('2026-07-01');
    expect(revision.validFrom).toBe('2026-07-01');
    expect(revision.reason).toBe('merit');
  });

  it('refuses to insert before an already planned future revision', async () => {
    const { service } = buildService({
      existingRevisions: [existingRevision({ validFrom: '2026-09-01' })],
    });

    await expect(
      service.reviseSalary({
        employeeId: EMPLOYEE,
        salaryStructureId: STRUCTURE,
        effectiveDate: '2026-07-01',
        annualAmount: 132000,
      }),
    ).rejects.toThrow(/future revision/);
  });

  it('requires the employee to exist through the employee directory interface', async () => {
    const { service } = buildService({ employeeExists: false });

    await expect(
      service.reviseSalary({
        employeeId: EMPLOYEE,
        salaryStructureId: STRUCTURE,
        effectiveDate: '2026-07-01',
        annualAmount: 132000,
      }),
    ).rejects.toThrow(/Employee not found/);
  });

  it('awards a one-off bonus and emits bonus.awarded', async () => {
    const { service, publisher } = buildService({});

    const bonus = await service.awardBonus({
      employeeId: EMPLOYEE,
      awardDate: '2026-07-01',
      currency: 'usd',
      amount: 1500,
      awardedByUserId: toId<UserId>('user-1'),
      reason: 'clientApproved',
    });

    expect(bonus.amount).toBe('1500.00');
    expect(bonus.currency).toBe('USD');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'bonus.awarded' }),
    );
  });
});

describe('CompensationService.createAdjustment', () => {
  const base = {
    employeeId: EMPLOYEE,
    componentId: toId<PayComponentId>('component-1'),
    amount: 1000,
    currency: 'USD',
    periodYear: 2026,
    periodMonth: 9,
  };

  it('rejects a kind whose direction disagrees with the component category', async () => {
    const { service, payComponents } = buildService({});
    (payComponents.findById as jest.Mock).mockResolvedValueOnce({
      id: 'component-1',
      category: 'earning',
    });
    await expect(
      service.createAdjustment({ ...base, kind: 'advanceRecovery' }),
    ).rejects.toThrow(/deduction component/);
  });

  it('accepts a bonus against an earning component', async () => {
    const { service, payComponents } = buildService({});
    (payComponents.findById as jest.Mock).mockResolvedValueOnce({
      id: 'component-1',
      category: 'earning',
    });
    const adjustment = await service.createAdjustment({ ...base, kind: 'bonus' });
    expect(adjustment.kind).toBe('bonus');
  });
});
