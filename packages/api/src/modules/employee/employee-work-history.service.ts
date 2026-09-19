import type { EmployeeId, UserId } from '@hrms/shared';
import { toId, type EmployeeWorkHistoryId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { EmployeeDirectoryService } from './employee-directory.service';
import { EMPLOYEE_WORK_HISTORY_REPOSITORY } from './employee.tokens';
import { EmployeeWorkHistory } from './entities/employee-work-history.entity';

type CreateEmployeeWorkHistoryData = {
  readonly employeeId: EmployeeId;
  readonly companyName: string;
  readonly designation?: string | null;
  readonly salary?: string | null;
  readonly address?: string | null;
  readonly contact?: string | null;
  readonly totalExperience?: string | null;
  readonly createdByUserId?: UserId | null;
};

type UpdateEmployeeWorkHistoryData = {
  readonly companyName?: string | null;
  readonly designation?: string | null;
  readonly salary?: string | null;
  readonly address?: string | null;
  readonly contact?: string | null;
  readonly totalExperience?: string | null;
};

@Injectable()
export class EmployeeWorkHistoryService {
  constructor(
    @Inject(EMPLOYEE_WORK_HISTORY_REPOSITORY)
    private readonly histories: TenantScopedRepository<EmployeeWorkHistory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  listForEmployee(employeeId: EmployeeId): Promise<EmployeeWorkHistory[]> {
    return this.histories.find({
      where: { employeeId } as FindOptionsWhere<EmployeeWorkHistory>,
      order: { createdAt: 'DESC' },
    });
  }

  getById(id: string): Promise<EmployeeWorkHistory | null> {
    return this.histories.findById(id);
  }

  async create(input: CreateEmployeeWorkHistoryData): Promise<EmployeeWorkHistory> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const record = this.histories.create({
      employeeId: input.employeeId,
      companyName: input.companyName,
      designation: input.designation ?? null,
      salary: input.salary ?? null,
      address: input.address ?? null,
      contact: input.contact ?? null,
      totalExperience: input.totalExperience ?? null,
      createdByUserId: input.createdByUserId ?? null,
      updatedByUserId: input.createdByUserId ?? null,
    });
    const entity = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(record);
      await this.publisher.publishWithin(manager, {
        name: 'employee.workHistoryRecorded',
        payload: {
          employeeWorkHistoryId: toId<EmployeeWorkHistoryId>(saved.id),
          employeeId: input.employeeId,
        },
      });
      return saved;
    });
    await this.audit.record({ action: 'create', resourceType: 'employee_work_history', resourceId: entity.id, after: { employeeId: input.employeeId } });
    return entity;
  }

  async update(id: string, input: UpdateEmployeeWorkHistoryData, updatedByUserId: UserId): Promise<EmployeeWorkHistory> {
    const existing = await this.histories.findById(id);
    if (!existing) throw new NotFoundError('Employee work history not found', { id });
    if (input.companyName !== undefined && input.companyName !== null) existing.companyName = input.companyName;
    if (input.designation !== undefined) existing.designation = input.designation;
    if (input.salary !== undefined) existing.salary = input.salary;
    if (input.address !== undefined) existing.address = input.address;
    if (input.contact !== undefined) existing.contact = input.contact;
    if (input.totalExperience !== undefined) existing.totalExperience = input.totalExperience;
    existing.updatedByUserId = updatedByUserId;
    const saved = await this.histories.save(existing);
    await this.audit.record({ action: 'update', resourceType: 'employee_work_history', resourceId: saved.id, after: { employeeId: saved.employeeId } });
    return saved;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.histories.findById(id);
    if (!existing) throw new NotFoundError('Employee work history not found', { id });
    await this.histories.deleteById(id);
    await this.audit.record({ action: 'delete', resourceType: 'employee_work_history', resourceId: id, after: {} });
  }
}
