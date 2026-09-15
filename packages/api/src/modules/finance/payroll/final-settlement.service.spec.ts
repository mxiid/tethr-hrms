import { toId, type EmployeeId, type OrganizationId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import { AuditService } from '../../../core/audit/audit.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';
import { HolidayService, LeaveBalanceService } from '../../leave';
import { CompensationService } from '../compensation';

import type { FinalSettlement } from './entities/final-settlement.entity';
import { FinalSettlementService } from './final-settlement.service';
import { TaxSlabService } from './tax-slab.service';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');

const buildService = () => {
  const settlements = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ id: 'fs-1', ...value })),
    find: jest.fn(async () => [] as unknown[]),
  } as unknown as TenantScopedRepository<FinalSettlement>;
  const compensation = {
    getCurrentSalaryRevision: jest.fn(async () => ({
      id: 'rev-1',
      employeeId: EMPLOYEE,
      salaryStructureId: 'structure-1',
      annualAmount: '1200000.00',
      currency: 'PKR',
    })),
    getStructureComponentBreakdown: jest.fn(async () => [
      {
        componentCode: 'basic',
        componentName: 'Basic',
        category: 'earning',
        taxable: true,
        dependsOnPaymentDays: true,
        amount: 100000,
      },
    ]),
    getAdjustmentsForPeriod: jest.fn(async () => [
      {
        componentId: 'comp-adv',
        componentCode: 'advance',
        componentName: 'Advance',
        category: 'deduction',
        taxable: false,
        dependsOnPaymentDays: false,
        amount: 5000,
        kind: 'advanceRecovery',
        sourceType: null,
        sourceId: null,
        overwritesStructureAmount: false,
        note: null,
      },
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
    ]),
  };
  const employeeDirectory = {
    getById: jest.fn(async () => ({
      id: EMPLOYEE,
      hireDate: '2026-08-12',
      holidayCalendarId: null,
    })),
  };
  const leaveBalances = {
    listForEmployee: jest.fn(async () => [
      { entitledDays: '10.00', usedDays: '2.00', pendingDays: '0.00' },
    ]),
  };
  const holidays = { getHolidayDates: jest.fn(async () => new Set()) };
  // One open 10% band, so withholding is 10% of the taxable base.
  const taxSlabs = {
    getActiveLadder: jest.fn(async () => [
      { upperBound: null, ratePercent: 10, flatAdditive: 0 },
    ]),
  };
  const tenantContext = { getOrganizationId: jest.fn(() => ORG) };
  const audit = { record: jest.fn(async () => undefined) };

  const service = new FinalSettlementService(
    settlements,
    {
      transaction: jest.fn(async (work: (manager: unknown) => Promise<unknown>) =>
        work({
          findOne: jest.fn(async () => null),
          save: jest.fn(async (value: unknown) => value),
        }),
      ),
    } as unknown as DataSource,
    compensation as unknown as CompensationService,
    employeeDirectory as unknown as EmployeeDirectoryService,
    leaveBalances as unknown as LeaveBalanceService,
    holidays as unknown as HolidayService,
    taxSlabs as unknown as TaxSlabService,
    tenantContext as unknown as TenantContextService,
    audit as unknown as AuditService,
  );
  return { service, mocks: { settlements } };
};

describe('FinalSettlementService.compute', () => {
  it('pro-rates the final month, includes all adjustments, encashes leave, and withholds tax', async () => {
    const { service, mocks } = buildService();
    await service.compute(EMPLOYEE, '2026-08-20');

    const attrs = (mocks.settlements.create as jest.Mock).mock.calls[0][0] as Record<string, string>;
    // Aug 2026: 21 working days; hired 12th, terminated 20th → 7 worked days.
    expect(attrs.standardWorkingDays).toBe(21);
    expect(attrs.workedDays).toBe('7.00');
    expect(attrs.proRatedEarnings).toBe('33333.33');
    // A bonus in the final month is included, not dropped (finding 1).
    expect(attrs.adjustmentEarnings).toBe('10000.00');
    // 8 remaining leave days × (100000 / 21) = 38095.24
    expect(attrs.leaveEncashmentAmount).toBe('38095.24');
    expect(attrs.recoveryAmount).toBe('5000.00');
    // 33333.33 + 10000 + 38095.24 − 5000
    expect(attrs.payableTotal).toBe('76428.57');
    // Taxable base: 33333.33 + 10000 + 38095.24; 10% withheld (finding 2).
    expect(attrs.taxableAmount).toBe('81428.57');
    expect(attrs.incomeTaxAmount).toBe('8142.86');
    expect(attrs.netPayableAmount).toBe('68285.71');
  });
});

describe('FinalSettlementService.markPaid', () => {
  it('rejects a regex-shaped but impossible settlement date before any read', async () => {
    const { service } = buildService();
    await expect(
      service.markPaid({ employeeId: EMPLOYEE, settlementDate: '2026-02-31' }),
    ).rejects.toThrow(/real calendar date/);
  });
});
