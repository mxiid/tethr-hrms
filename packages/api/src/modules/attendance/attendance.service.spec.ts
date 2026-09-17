import { toId, type EmployeeId, type OrganizationId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';


import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { AttendanceService } from './attendance.service';
import type { ClockEvent } from './entities/clock-event.entity';
import type { TimeEntry } from './entities/time-entry.entity';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');

const buildService = (
  lastEvent: Partial<ClockEvent> | null,
  options: { lockedTimesheet?: unknown } = {},
) => {
  const manager = {
    findOne: jest.fn((entity: unknown) =>
      (entity as { name?: string }).name === 'Timesheet'
        ? Promise.resolve(options.lockedTimesheet ?? null)
        : Promise.resolve(lastEvent),
    ),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'generated', ...value }),
    ),
    query: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;
  const service = new AttendanceService(
    {} as unknown as TenantScopedRepository<TimeEntry>,
    dataSource,
    tenantContext,
  );
  return { service, manager };
};

describe('AttendanceService.clockIn', () => {
  it('rejects a second clock-in while one is open', async () => {
    const openIn = { type: 'in', occurredAt: new Date('2026-06-15T09:00:00Z') } as ClockEvent;
    const { service } = buildService(openIn);

    await expect(service.clockIn(EMPLOYEE, '2026-06-15T10:00:00Z')).rejects.toThrow(
      /Already clocked in/,
    );
  });

  it('serializes punches with an advisory lock', async () => {
    const { service, manager } = buildService(null);

    await service.clockIn(EMPLOYEE, '2026-06-15T09:00:00Z');

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [expect.stringContaining('clock:')],
    );
  });
});

describe('AttendanceService.clockOut', () => {
  it('pairs with the open clock-in and computes worked hours', async () => {
    const openIn = { type: 'in', occurredAt: new Date('2026-06-15T09:00:00Z') } as ClockEvent;
    const { service } = buildService(openIn);

    const entry = await service.clockOut(EMPLOYEE, '2026-06-15T17:30:00Z');

    expect(entry.hours).toBe('8.50');
    expect(entry.date).toBe('2026-06-15');
  });

  it('throws when there is no open clock-in to close', async () => {
    const alreadyClosed = {
      type: 'out',
      occurredAt: new Date('2026-06-15T17:00:00Z'),
    } as ClockEvent;
    const { service } = buildService(alreadyClosed);

    await expect(service.clockOut(EMPLOYEE, '2026-06-15T18:00:00Z')).rejects.toThrow(
      /No open clock-in/,
    );
  });

  it('rejects an out-of-order clock-out that would produce negative hours', async () => {
    const openIn = { type: 'in', occurredAt: new Date('2026-06-15T09:00:00Z') } as ClockEvent;
    const { service } = buildService(openIn);

    await expect(service.clockOut(EMPLOYEE, '2026-06-15T08:00:00Z')).rejects.toThrow(
      /after the open clock-in/,
    );
  });
});

describe('AttendanceService.recordEntry', () => {
  it('rejects a manual entry inside a locked timesheet period', async () => {
    const { service } = buildService(null, {
      lockedTimesheet: { id: 'timesheet-locked', status: 'locked' },
    });

    await expect(
      service.recordEntry({ employeeId: EMPLOYEE, date: '2026-06-15', hours: 8 }),
    ).rejects.toThrow(/locked/);
  });

  it('records a manual entry when the period is not locked', async () => {
    const { service } = buildService(null);

    const entry = await service.recordEntry({ employeeId: EMPLOYEE, date: '2026-06-15', hours: 8 });

    expect(entry.hours).toBe('8.00');
    expect(entry.source).toBe('manual');
  });
});