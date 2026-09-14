import { compareIsoDate, rangeContains, type EmployeeId, type IsoDate, type LeaveTypeId, type UserId } from '@hrms/shared';
import { toId, type EmployeeLeaveEntitlementId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EMPLOYEE_LEAVE_ENTITLEMENT_REPOSITORY, LEAVE_TYPE_REPOSITORY } from './leave.tokens';
import { EmployeeLeaveEntitlement } from './entities/employee-leave-entitlement.entity';
import { LeaveType } from './entities/leave-type.entity';

type UpsertEntitlementData = {
  readonly employeeId: EmployeeId;
  readonly leaveTypeId: LeaveTypeId;
  readonly annualEntitlement: number;
  readonly validFrom: string;
  readonly validTo?: string | null;
  readonly updatedByUserId?: UserId | null;
};

@Injectable()
export class EmployeeLeaveEntitlementService {
  constructor(
    @Inject(EMPLOYEE_LEAVE_ENTITLEMENT_REPOSITORY)
    private readonly entitlements: TenantScopedRepository<EmployeeLeaveEntitlement>,
    @Inject(LEAVE_TYPE_REPOSITORY)
    private readonly leaveTypes: TenantScopedRepository<LeaveType>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  listForEmployee(employeeId: EmployeeId): Promise<EmployeeLeaveEntitlement[]> {
    return this.entitlements.find({ where: { employeeId } as FindOptionsWhere<EmployeeLeaveEntitlement>, order: { validFrom: 'ASC' } });
  }

  getForEmployeeAndType(employeeId: EmployeeId, leaveTypeId: LeaveTypeId): Promise<EmployeeLeaveEntitlement | null> {
    return this.entitlements.findOne({ where: { employeeId, leaveTypeId } as FindOptionsWhere<EmployeeLeaveEntitlement>, order: { validFrom: 'DESC' } });
  }

  async upsert(input: UpsertEntitlementData): Promise<EmployeeLeaveEntitlement> {
    const leaveType = await this.leaveTypes.findById(input.leaveTypeId);
    if (!leaveType) throw new NotFoundError('Leave type not found', { id: input.leaveTypeId });
    const existing = await this.entitlements.find({
      where: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId } as FindOptionsWhere<EmployeeLeaveEntitlement>,
      order: { validFrom: 'ASC' },
    });

    const sameDay = existing.find((row) => row.validFrom === input.validFrom);
    if (sameDay) {
      throw new ConflictError('Leave entitlement already exists for effective date', { effectiveDate: input.validFrom });
    }
    const future = existing.find((row) => compareIsoDate(row.validFrom, input.validFrom as IsoDate) > 0);
    if (future) {
      throw new ConflictError('Cannot insert entitlement before a future entitlement', { futureEffectiveDate: future.validFrom });
    }
    const active = existing.find((row) => rangeContains({ validFrom: row.validFrom as IsoDate, validTo: row.validTo as IsoDate | null }, input.validFrom as IsoDate));
    if (active && active.validTo !== null) {
      throw new ConflictError('Cannot revise a closed historical entitlement range', { validFrom: active.validFrom, validTo: active.validTo });
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      if (active) {
        active.validTo = input.validFrom as IsoDate;
        await manager.save(active);
      }
      const record = this.entitlements.create({
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        annualEntitlement: input.annualEntitlement.toFixed(2),
        validFrom: input.validFrom as IsoDate,
        validTo: (input.validTo as IsoDate | null) ?? null,
        updatedByUserId: input.updatedByUserId ?? null,
      });
      const persisted = await manager.save(record);
      await this.publisher.publishWithin(manager, {
        name: 'leave.entitlementUpdated',
        payload: {
          employeeLeaveEntitlementId: toId<EmployeeLeaveEntitlementId>(persisted.id),
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
        },
      });
      return persisted;
    });
    await this.audit.record({ action: existing.length ? 'update' : 'create', resourceType: 'employee_leave_entitlement', resourceId: saved.id, after: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId } });
    return saved;
  }

  async resolveEntitlement(employeeId: EmployeeId, leaveTypeId: LeaveTypeId, fallback: number, asOf?: IsoDate): Promise<number> {
    const rows = await this.entitlements.find({ where: { employeeId, leaveTypeId } as FindOptionsWhere<EmployeeLeaveEntitlement>, order: { validFrom: 'DESC' } });
    if (rows.length === 0) return fallback;
    const targetDate = asOf ?? (new Date().toISOString().slice(0, 10) as IsoDate);
    const active = rows.find((row) => rangeContains({ validFrom: row.validFrom as IsoDate, validTo: row.validTo as IsoDate | null }, targetDate));
    if (active) return Number(active.annualEntitlement);
    const prior = rows.filter((row) => compareIsoDate(row.validFrom as IsoDate, targetDate) <= 0).sort((a, b) => compareIsoDate(b.validFrom as IsoDate, a.validFrom as IsoDate))[0];
    if (prior) return Number(prior.annualEntitlement);
    return fallback;
  }

  async getEntitlementAsOf(employeeId: EmployeeId, leaveTypeId: LeaveTypeId, asOf: IsoDate): Promise<EmployeeLeaveEntitlement | null> {
    const rows = await this.entitlements.find({ where: { employeeId, leaveTypeId } as FindOptionsWhere<EmployeeLeaveEntitlement> });
    return rows.find((row) => rangeContains({ validFrom: row.validFrom as IsoDate, validTo: row.validTo as IsoDate | null }, asOf)) ?? null;
  }
}
