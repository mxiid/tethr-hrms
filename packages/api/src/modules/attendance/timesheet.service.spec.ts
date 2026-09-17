import { toId, type EmployeeId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';


import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import type { TimeEntry } from './entities/time-entry.entity';
import type { Timesheet } from './entities/timesheet.entity';
import { TimesheetService } from './timesheet.service';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');
const ACTOR = toId<UserId>('user-1');

const buildService = (options: { timesheet: Partial<Timesheet>; entries?: Partial<TimeEntry>[] }) => {
  const manager = {
    findOne: jest.fn().mockResolvedValue(options.timesheet as Timesheet),
    find: jest.fn().mockResolvedValue((options.entries ?? []) as TimeEntry[]),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve(value)),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const publisher = {
    publishWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainEventPublisher;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;
  const service = new TimesheetService(
    {} as unknown as TenantScopedRepository<Timesheet>,
    dataSource,
    publisher,
    tenantContext,
  );
  return { service, publisher };
};

const baseTimesheet = (status: Timesheet['status']): Partial<Timesheet> => ({
  id: 'ts-1',
  employeeId: EMPLOYEE,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  status,
  totalHours: '0',
});

describe('TimesheetService.submit', () => {
  it('rolls up time-entry hours and emits timesheet.submitted', async () => {
    const { service, publisher } = buildService({
      timesheet: baseTimesheet('open'),
      entries: [{ hours: '8.00' }, { hours: '7.50' }],
    });

    const result = await service.submit('ts-1', ACTOR);

    expect(result.totalHours).toBe('15.50');
    expect(result.status).toBe('submitted');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'timesheet.submitted' }),
    );
  });
});

describe('TimesheetService.lock', () => {
  it('locks an approved timesheet and emits timesheet.locked (Payroll input)', async () => {
    const { service, publisher } = buildService({
      timesheet: { ...baseTimesheet('approved'), totalHours: '15.50' },
    });

    const result = await service.lock('ts-1');

    expect(result.status).toBe('locked');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'timesheet.locked' }),
    );
  });

  it('refuses to lock a timesheet that is not approved', async () => {
    const { service } = buildService({ timesheet: baseTimesheet('open') });
    await expect(service.lock('ts-1')).rejects.toThrow(/approved before locking/);
  });

  it('stamps every in-period entry with the timesheet id when locking', async () => {
    const entry = {
      id: 'entry-1',
      hours: '8.00',
      timesheetId: null,
    } as unknown as TimeEntry;
    const { service } = buildService({
      timesheet: baseTimesheet('approved'),
      entries: [entry],
    });

    await service.lock('ts-1');

    expect(entry.timesheetId).toBe('ts-1');
  });
});
