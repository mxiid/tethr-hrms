import { toId, type OrganizationId, type PayrollRunId, type SalaryStructureId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import { ConflictError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import type { BenefitService } from '../../benefits';
import { EmployeeDirectoryService } from '../../employee';
import { EmployeeRecordsService } from '../../employee-records';
import { HolidayService, LeaveRequestService } from '../../leave';
import { CompensationService } from '../compensation';

import { PayrollRunLineComponent } from './entities/payroll-run-line-component.entity';
import { PayrollRunLine } from './entities/payroll-run-line.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayslipLine } from './entities/payslip-line.entity';
import { Payslip } from './entities/payslip.entity';
import { PayrollRunService } from './payroll-run.service';
import { TaxSlabService } from './tax-slab.service';

const ORG = toId<OrganizationId>('org-1');
const RUN_ID = toId<PayrollRunId>('run-1');
const STRUCTURE = toId<SalaryStructureId>('structure-1');

const employeeFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'emp-1',
  employeeNumber: 'EMP-001',
  firstName: 'Saboor',
  lastName: 'Ahmed',
  roleTitle: 'Engineer',
  hireDate: '2026-08-20',
  employmentStatus: 'active',
  ...overrides,
});

const revisionFixture = () => ({
  id: 'rev-1',
  employeeId: 'emp-1',
  salaryStructureId: STRUCTURE,
  annualAmount: '1200000.00',
  currency: 'PKR',
  validFrom: '2026-08-20',
  validTo: null,
});

const breakdownFixture = [
  {
    componentCode: 'basic',
    componentName: 'Basic salary',
    category: 'earning' as const,
    taxable: true,
    dependsOnPaymentDays: true,
    amount: 60000,
  },
  {
    componentCode: 'fuel',
    componentName: 'Fuel reimbursement',
    category: 'earning' as const,
    taxable: false,
    dependsOnPaymentDays: false,
    amount: 5000,
  },
];

type Options = {
  readonly employees?: ReturnType<typeof employeeFixture>[];
  readonly revision?: Record<string, unknown> | null;
  readonly unpaidDays?: number;
  readonly existingPeriodRun?: Record<string, unknown> | null;
};

const buildService = (options: Options = {}) => {
  let generatedId = 0;

  const manager = {
    create: jest.fn((_target: unknown, attrs: Record<string, unknown>) => ({ ...attrs })),
    save: jest.fn(async (entity: Record<string, unknown>) =>
      entity.id !== undefined ? entity : { ...entity, id: `gen-${(generatedId += 1)}` },
    ),
    find: jest.fn(async () => [] as unknown[]),
    findOne: jest.fn(async (_target: unknown, _where: unknown) => null),
    remove: jest.fn(async (entity: unknown) => entity),
    count: jest.fn(async () => 0),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (mgr: typeof manager) => Promise<unknown>) =>
      callback(manager),
    ),
  };

  const runs = {
    findOne: jest
      .fn()
      .mockResolvedValue(options.existingPeriodRun ?? null) as jest.Mock,
    findById: jest.fn(async (id: string) =>
      id === RUN_ID
        ? {
            id: RUN_ID,
            organizationId: ORG,
            periodYear: 2026,
            periodMonth: 8,
            status: options.existingPeriodRun ? 'finalized' : 'draft',
            currency: 'PKR',
            standardWorkingDays: 21,
            holidayCalendarId: null,
            finalizedAt: null,
            finalizedByUserId: null,
          }
        : null,
    ) as jest.Mock,
    find: jest.fn().mockResolvedValue([]) as jest.Mock,
  };
  const lines = {
    find: jest.fn().mockResolvedValue(
      options.existingPeriodRun
        ? []
        : [
            {
              id: 'line-1',
              organizationId: ORG,
              runId: RUN_ID,
              employeeId: 'emp-1',
              payableDays: '8.00',
              lopDays: '0.00',
              standardWorkingDays: 21,
              grossAmount: '100000.00',
              taxOverrideAmount: null,
              note: null,
            },
          ],
    ) as jest.Mock,
    findOne: jest.fn().mockResolvedValue(null) as jest.Mock,
  };
  const lineComponents = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'comp-1',
        lineId: 'line-1',
        componentCode: 'basic',
        componentName: 'Basic salary',
        category: 'earning',
        taxable: true,
        amount: '60000.00',
        sortOrder: 0,
      },
      {
        id: 'comp-2',
        lineId: 'line-1',
        componentCode: 'fuel',
        componentName: 'Fuel reimbursement',
        category: 'earning',
        taxable: false,
        amount: '5000.00',
        sortOrder: 1,
      },
    ]) as jest.Mock,
  };
  const payslips = {
    count: jest.fn(async () => 0) as jest.Mock,
    find: jest.fn(async () => []) as jest.Mock,
    findById: jest.fn(async () => null) as jest.Mock,
    findOne: jest.fn(async () => null) as jest.Mock,
  };
  const payslipLines = { find: jest.fn(async () => []) as jest.Mock };

  const employeeDirectory = {
    listActive: jest
      .fn()
      .mockResolvedValue(options.employees ?? [employeeFixture()]) as jest.Mock,
    getById: jest.fn(async (id: string) => (id === 'emp-1' ? employeeFixture() : null)) as jest.Mock,
    getDisplayName: jest.fn(async () => 'Saboor Ahmed') as jest.Mock,
  };
  const compensation = {
    getCurrentSalaryRevision: jest
      .fn()
      .mockResolvedValue(options.revision === undefined ? revisionFixture() : options.revision) as jest.Mock,
    getStructureComponentBreakdown: jest
      .fn()
      .mockResolvedValue(breakdownFixture) as jest.Mock,
    getAdjustmentsForPeriod: jest.fn().mockResolvedValue([]) as jest.Mock,
    getTaxProfile: jest.fn().mockResolvedValue(null) as jest.Mock,
  };
  const benefits = { getEnrollmentCharges: jest.fn(async () => []) as jest.Mock };
  const leaveRequests = {
    getApprovedUnpaidWorkDays: jest.fn(async () => options.unpaidDays ?? 0) as jest.Mock,
  };
  const holidays = { getHolidayDates: jest.fn(async () => new Set()) as jest.Mock };
  const taxSlabs = { getActiveLadder: jest.fn(async () => null) as jest.Mock };
  const employeeRecords = { getHrRecord: jest.fn(async () => null) as jest.Mock };
  const publisher = { publishWithin: jest.fn(async () => undefined) as jest.Mock };
  const tenantContext = { getOrganizationId: jest.fn(() => ORG) as jest.Mock };
  const audit = { record: jest.fn(async () => undefined) as jest.Mock };

  const service = new PayrollRunService(
    runs as unknown as TenantScopedRepository<PayrollRun>,
    lines as unknown as TenantScopedRepository<PayrollRunLine>,
    lineComponents as unknown as TenantScopedRepository<PayrollRunLineComponent>,
    payslips as unknown as TenantScopedRepository<Payslip>,
    payslipLines as unknown as TenantScopedRepository<PayslipLine>,
    dataSource as unknown as DataSource,
    tenantContext as unknown as TenantContextService,
    publisher as unknown as DomainEventPublisher,
    audit as unknown as AuditService,
    employeeDirectory as unknown as EmployeeDirectoryService,
    compensation as unknown as CompensationService,
    benefits as unknown as BenefitService,
    leaveRequests as unknown as LeaveRequestService,
    holidays as unknown as HolidayService,
    taxSlabs as unknown as TaxSlabService,
    employeeRecords as unknown as EmployeeRecordsService,
  );

  return {
    service,
    mocks: {
      manager,
      runs,
      lines,
      lineComponents,
      payslips,
      employeeDirectory,
      compensation,
      leaveRequests,
      publisher,
      audit,
    },
  };
};

describe('PayrollRunService.createRun', () => {
  it('pro-rates day-dependent components for a mid-month joiner and snapshots the full amount', async () => {
    const { service, mocks } = buildService();
    await service.createRun({ periodYear: 2026, periodMonth: 8 });

    // August 2026 has 21 working days; joined on the 20th → 8 worked days.
    const lineCall = mocks.manager.create.mock.calls.find(
      ([target]) => target === PayrollRunLine,
    );
    expect(lineCall).toBeDefined();
    const attrs = lineCall![1] as Record<string, string>;
    expect(attrs.payableDays).toBe('8.00');
    expect(attrs.standardWorkingDays).toBe(21);
    // Basic (day-dependent) scales 60000 × 8/21; fuel (day-independent) is full.
    expect(attrs.grossAmount).toBe('27857.14');

    const componentTargets = mocks.manager.create.mock.calls.filter(
      ([target]) => target === PayrollRunLineComponent,
    );
    expect(componentTargets).toHaveLength(breakdownFixture.length);
    const basic = componentTargets[0][1] as Record<string, string | boolean>;
    expect(basic.amount).toBe('22857.14');
    expect(basic.defaultAmount).toBe('60000.00');
    expect(basic.dependsOnPaymentDays).toBe(true);
    const fuel = componentTargets[1][1] as Record<string, string | boolean>;
    expect(fuel.amount).toBe('5000.00');
    expect(fuel.defaultAmount).toBe('5000.00');
    expect(fuel.dependsOnPaymentDays).toBe(false);
  });

  it('reduces payable days by approved unpaid leave', async () => {
    const { service, mocks } = buildService({ unpaidDays: 3 });
    await service.createRun({ periodYear: 2026, periodMonth: 8 });

    const lineCall = mocks.manager.create.mock.calls.find(
      ([target]) => target === PayrollRunLine,
    );
    expect((lineCall![1] as Record<string, string>).payableDays).toBe('5.00');
  });

  it('leaves a full clean month unchanged (payable days = standard, full amounts)', async () => {
    const { service, mocks } = buildService({
      employees: [employeeFixture({ hireDate: '2026-01-05' })],
    });
    await service.createRun({ periodYear: 2026, periodMonth: 8 });

    const attrs = mocks.manager.create.mock.calls.find(
      ([target]) => target === PayrollRunLine,
    )![1] as Record<string, string>;
    expect(attrs.payableDays).toBe('21.00');
    expect(attrs.grossAmount).toBe('65000.00');
    const basic = mocks.manager.create.mock.calls.filter(
      ([target]) => target === PayrollRunLineComponent,
    )[0][1] as Record<string, string>;
    expect(basic.amount).toBe('60000.00');
  });

  it('emits a period adjustment as a component with provenance and no pro-rata', async () => {
    const { service, mocks } = buildService();
    mocks.compensation.getAdjustmentsForPeriod.mockResolvedValue([
      {
        componentId: 'comp-bonus',
        componentCode: 'bonus',
        componentName: 'Bonus',
        category: 'earning',
        taxable: true,
        dependsOnPaymentDays: false,
        amount: 10000,
        kind: 'bonus',
        sourceType: 'bonusAward',
        sourceId: 'award-1',
        overwritesStructureAmount: false,
        note: null,
      },
    ]);
    await service.createRun({ periodYear: 2026, periodMonth: 8 });

    const line = mocks.manager.create.mock.calls.find(
      ([target]) => target === PayrollRunLine,
    )![1] as Record<string, string>;
    // Basic 22857.14 + fuel 5000 + full bonus 10000.
    expect(line.grossAmount).toBe('37857.14');
    const bonus = mocks.manager.create.mock.calls
      .filter(([target]) => target === PayrollRunLineComponent)
      .map(([, attrs]) => attrs as Record<string, string>)
      .find((attrs) => attrs.componentCode === 'bonus');
    expect(bonus).toBeDefined();
    expect(bonus!.amount).toBe('10000.00');
    expect(bonus!.sourceType).toBe('bonusAward');
    expect(bonus!.sourceId).toBe('award-1');
  });

  it('excludes employees without an active salary assignment from the run', async () => {
    const { service, mocks } = buildService({
      revision: null,
      employees: [employeeFixture({ hireDate: '2026-01-05' })],
    });
    await service.createRun({ periodYear: 2026, periodMonth: 8 });

    const lineCall = mocks.manager.create.mock.calls.find(
      ([target]) => target === PayrollRunLine,
    );
    expect(lineCall).toBeUndefined();
  });

  it('rejects a second run for the same period', async () => {
    const { service } = buildService({ existingPeriodRun: { id: 'other' } });
    await expect(service.createRun({ periodYear: 2026, periodMonth: 8 })).rejects.toThrow(
      ConflictError,
    );
  });

  it('validates the month range', async () => {
    const { service } = buildService();
    await expect(service.createRun({ periodYear: 2026, periodMonth: 13 })).rejects.toThrow(
      ValidationFailedError,
    );
  });
});

describe('PayrollRunService.finalizeRun', () => {
  const draftRun = {
    id: RUN_ID,
    organizationId: ORG,
    periodYear: 2026,
    periodMonth: 8,
    status: 'draft',
    currency: 'PKR',
    standardWorkingDays: 21,
    holidayCalendarId: null,
    finalizedAt: null,
    finalizedByUserId: null,
  };

  it('snapshots a payslip per line and emits payroll.finalized with the real total', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun ? draftRun : null,
    );
    mocks.runs.findById = jest.fn().mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
      ...draftRun,
      status: 'finalized',
      finalizedAt: new Date(),
      finalizedByUserId: 'user-1',
    });

    const run = await service.finalizeRun({
      runId: RUN_ID,
      finalizedByUserId: toId('user-1'),
    });

    expect(run.status).toBe('finalized');
    const payslipCall = mocks.manager.create.mock.calls.find(([target]) => target === Payslip);
    expect(payslipCall).toBeDefined();
    const attrs = payslipCall![1] as Record<string, unknown>;
    // Taxable excludes the non-taxable fuel line; no ladder active → zero tax.
    expect(attrs.taxableAmount).toBe('60000.00');
    expect(attrs.incomeTaxAmount).toBe('0.00');
    expect(attrs.netPayAmount).toBe('65000.00');
    expect(attrs.payslipNumber).toBe('PS-202608-0001');
    expect(mocks.publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'payroll.finalized',
        payload: expect.objectContaining({ payslipCount: 1, totalNetPay: 65000 }),
      }),
    );
  });

  it('refuses to finalize a run that is already finalized', async () => {
    const { service } = buildService({ existingPeriodRun: {} });
    await expect(
      service.finalizeRun({ runId: RUN_ID, finalizedByUserId: toId('user-1') }),
    ).rejects.toThrow(/already finalized/);
  });

  it('refuses to finalize a line with no earning components (silent zero guard)', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun ? draftRun : null,
    );
    (mocks.lineComponents.find as jest.Mock).mockResolvedValue([
      {
        id: 'comp-1',
        lineId: 'line-1',
        componentCode: 'loan',
        componentName: 'Loan repayment',
        category: 'deduction',
        taxable: false,
        amount: '500.00',
        sortOrder: 0,
      },
    ]);

    await expect(
      service.finalizeRun({ runId: RUN_ID, finalizedByUserId: toId('user-1') }),
    ).rejects.toThrow(/no earning components/);
  });

  it('refuses to finalize a line with payable days but zero earnings (finding 10)', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun ? draftRun : null,
    );
    (mocks.lineComponents.find as jest.Mock).mockResolvedValue([
      {
        id: 'comp-1',
        lineId: 'line-1',
        componentCode: 'basic',
        componentName: 'Basic',
        category: 'earning',
        taxable: true,
        amount: '0.00',
        sortOrder: 0,
      },
    ]);

    await expect(
      service.finalizeRun({ runId: RUN_ID, finalizedByUserId: toId('user-1') }),
    ).rejects.toThrow(/zero earnings/);
  });
});

describe('PayrollRunService.updateRunLine', () => {
  it('clamps manual day edits against the run ceiling', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun
        ? { id: RUN_ID, status: 'draft', standardWorkingDays: 21 }
        : { id: 'line-1', runId: RUN_ID, payableDays: '8.00' },
    );

    await expect(
      service.updateRunLine({ lineId: 'line-1', payableDays: 25 }),
    ).rejects.toThrow(/between 0 and 21/);
  });

  it('stores a tax override while the run is draft', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun
        ? { id: RUN_ID, status: 'draft', standardWorkingDays: 21 }
        : { id: 'line-1', runId: RUN_ID, payableDays: '8.00', taxOverrideAmount: null },
    );

    await service.updateRunLine({ lineId: 'line-1', taxOverrideAmount: 1500 });
    expect(mocks.manager.save).toHaveBeenCalled();
    const savedLine = (mocks.manager.save as jest.Mock).mock.calls.at(-1)![0] as Record<
      string,
      string | null
    >;
    expect(savedLine.taxOverrideAmount).toBe('1500.00');
  });

  it('re-pro-rates components and gross when payable days change', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun
        ? { id: RUN_ID, status: 'draft', standardWorkingDays: 21 }
        : {
            id: 'line-1',
            runId: RUN_ID,
            organizationId: ORG,
            payableDays: '8.00',
            lopDays: '0.00',
            standardWorkingDays: 21,
            grossAmount: '27857.14',
          },
    );
    (mocks.manager.find as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRunLineComponent
        ? [
            {
              id: 'comp-1',
              lineId: 'line-1',
              category: 'earning',
              amount: '22857.14',
              defaultAmount: '60000.00',
              dependsOnPaymentDays: true,
              sortOrder: 0,
            },
            {
              id: 'comp-2',
              lineId: 'line-1',
              category: 'earning',
              amount: '5000.00',
              defaultAmount: '5000.00',
              dependsOnPaymentDays: false,
              sortOrder: 1,
            },
          ]
        : [],
    );

    await service.updateRunLine({ lineId: 'line-1', payableDays: 21 });

    const savedLine = (mocks.manager.save as jest.Mock).mock.calls.at(-1)![0] as Record<
      string,
      string
    >;
    expect(savedLine.grossAmount).toBe('65000.00');
    expect(savedLine.payableDays).toBe('21.00');
  });

  it('shifts payable days by the delta when unpaid days are edited', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun
        ? { id: RUN_ID, status: 'draft', standardWorkingDays: 21 }
        : {
            id: 'line-1',
            runId: RUN_ID,
            organizationId: ORG,
            payableDays: '21.00',
            lopDays: '0.00',
            standardWorkingDays: 21,
            grossAmount: '65000.00',
          },
    );
    (mocks.manager.find as jest.Mock).mockResolvedValue([]);

    await service.updateRunLine({ lineId: 'line-1', lopDays: 3 });

    const savedLine = (mocks.manager.save as jest.Mock).mock.calls.at(-1)![0] as Record<
      string,
      string
    >;
    expect(savedLine.lopDays).toBe('3.00');
    expect(savedLine.payableDays).toBe('18.00');
  });

  it('does not double-apply the delta when payableDays and lopDays are edited together', async () => {
    const { service, mocks } = buildService();
    (mocks.manager.findOne as jest.Mock).mockImplementation(async (target: unknown) =>
      target === PayrollRun
        ? { id: RUN_ID, status: 'draft', standardWorkingDays: 21 }
        : {
            id: 'line-1',
            runId: RUN_ID,
            organizationId: ORG,
            payableDays: '21.00',
            lopDays: '0.00',
            standardWorkingDays: 21,
            grossAmount: '65000.00',
          },
    );
    (mocks.manager.find as jest.Mock).mockResolvedValue([]);

    await service.updateRunLine({ lineId: 'line-1', payableDays: 18, lopDays: 3 });

    const savedLine = (mocks.manager.save as jest.Mock).mock.calls.at(-1)![0] as Record<
      string,
      string
    >;
    // payableDays is authoritative; without the fix it would become 18 − 3 = 15.
    expect(savedLine.payableDays).toBe('18.00');
    expect(savedLine.lopDays).toBe('3.00');
  });
});

describe('PayrollRunService.getReadiness', () => {
  it('lists warnings for missing bank details and no tax ladder', async () => {
    const { service } = buildService();
    const readiness = await service.getReadiness(2026, 8);
    expect(readiness.hardBlockerCount).toBe(0);
    expect(readiness.warningCount).toBe(2);
    const codes = readiness.employees[0].blockers.map((blocker) => blocker.code).sort();
    expect(codes).toEqual(['missingBankDetails', 'noActiveTaxLadder']);
  });

  it('flags a missing pay assignment as a hard blocker', async () => {
    const { service } = buildService({ revision: null });
    const readiness = await service.getReadiness(2026, 8);
    expect(readiness.hardBlockerCount).toBe(1);
    expect(readiness.employees[0].blockers[0].code).toBe('noPayAssignment');
  });

  it('flags a structure with no earning components as a hard blocker', async () => {
    const { service, mocks } = buildService();
    mocks.compensation.getStructureComponentBreakdown.mockResolvedValue([
      {
        componentCode: 'loan',
        componentName: 'Loan repayment',
        category: 'deduction',
        taxable: false,
        dependsOnPaymentDays: false,
        amount: 500,
      },
    ]);
    const readiness = await service.getReadiness(2026, 8);
    expect(
      readiness.employees[0].blockers.some((blocker) => blocker.code === 'structureHasNoComponents'),
    ).toBe(true);
  });
});
