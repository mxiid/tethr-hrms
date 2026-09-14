import type { EducationLevel, EmployeeId, UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { toId, type EmployeeEducationId } from '@hrms/shared';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from './employee-directory.service';
import { EMPLOYEE_EDUCATION_REPOSITORY } from './employee.tokens';
import { EmployeeEducation } from './entities/employee-education.entity';

type CreateEmployeeEducationData = {
  readonly employeeId: EmployeeId;
  readonly schoolOrUniversity: string;
  readonly qualification: string;
  readonly level: EducationLevel;
  readonly yearOfPassing?: number | null;
  readonly classOrPercentage?: string | null;
  readonly majorSubjects?: string | null;
  readonly createdByUserId?: UserId | null;
};

type UpdateEmployeeEducationData = {
  readonly schoolOrUniversity?: string | null;
  readonly qualification?: string | null;
  readonly level?: EducationLevel | null;
  readonly yearOfPassing?: number | null;
  readonly classOrPercentage?: string | null;
  readonly majorSubjects?: string | null;
};

@Injectable()
export class EmployeeEducationService {
  constructor(
    @Inject(EMPLOYEE_EDUCATION_REPOSITORY)
    private readonly educations: TenantScopedRepository<EmployeeEducation>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  listForEmployee(employeeId: EmployeeId): Promise<EmployeeEducation[]> {
    return this.educations.find({
      where: { employeeId } as FindOptionsWhere<EmployeeEducation>,
      order: { yearOfPassing: 'DESC', createdAt: 'DESC' },
    });
  }

  getById(id: string): Promise<EmployeeEducation | null> {
    return this.educations.findById(id);
  }

  async create(input: CreateEmployeeEducationData): Promise<EmployeeEducation> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const record = this.educations.create({
      employeeId: input.employeeId,
      schoolOrUniversity: input.schoolOrUniversity,
      qualification: input.qualification,
      level: input.level,
      yearOfPassing: input.yearOfPassing ?? null,
      classOrPercentage: input.classOrPercentage ?? null,
      majorSubjects: input.majorSubjects ?? null,
      createdByUserId: input.createdByUserId ?? null,
      updatedByUserId: input.createdByUserId ?? null,
    });
    const entity = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(record);
      await this.publisher.publishWithin(manager, {
        name: 'employee.educationRecorded',
        payload: {
          employeeEducationId: toId<EmployeeEducationId>(saved.id),
          employeeId: input.employeeId,
        },
      });
      return saved;
    });
    await this.audit.record({ action: 'create', resourceType: 'employee_education', resourceId: entity.id, after: { employeeId: input.employeeId } });
    return entity;
  }

  async update(id: string, input: UpdateEmployeeEducationData, updatedByUserId: UserId): Promise<EmployeeEducation> {
    const existing = await this.educations.findById(id);
    if (!existing) throw new NotFoundError('Employee education not found', { id });
    if (input.schoolOrUniversity !== undefined && input.schoolOrUniversity !== null) existing.schoolOrUniversity = input.schoolOrUniversity;
    if (input.qualification !== undefined && input.qualification !== null) existing.qualification = input.qualification;
    if (input.level !== undefined && input.level !== null) existing.level = input.level;
    if (input.yearOfPassing !== undefined) existing.yearOfPassing = input.yearOfPassing;
    if (input.classOrPercentage !== undefined) existing.classOrPercentage = input.classOrPercentage;
    if (input.majorSubjects !== undefined) existing.majorSubjects = input.majorSubjects;
    existing.updatedByUserId = updatedByUserId;
    const saved = await this.educations.save(existing);
    await this.audit.record({ action: 'update', resourceType: 'employee_education', resourceId: saved.id, after: { employeeId: saved.employeeId } });
    return saved;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.educations.findById(id);
    if (!existing) throw new NotFoundError('Employee education not found', { id });
    await this.educations.unsafeRepository.delete(id);
    await this.audit.record({ action: 'delete', resourceType: 'employee_education', resourceId: id, after: {} });
  }
}
