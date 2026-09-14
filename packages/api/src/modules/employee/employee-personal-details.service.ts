import type { BloodGroup, EmployeeId, MaritalStatus, UserId } from '@hrms/shared';
import { toId, type EmployeePersonalDetailsId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from './employee-directory.service';
import { EMPLOYEE_PERSONAL_DETAILS_REPOSITORY } from './employee.tokens';
import { EmployeePersonalDetails } from './entities/employee-personal-details.entity';
import { NotFoundError } from '../../common/errors';

type UpdateEmployeePersonalDetailsData = {
  readonly passportNumber?: string | null;
  readonly passportIssueDate?: string | null;
  readonly passportIssuePlace?: string | null;
  readonly passportValidUpto?: string | null;
  readonly maritalStatus?: MaritalStatus | null;
  readonly bloodGroup?: BloodGroup | null;
  readonly familyBackground?: string | null;
  readonly healthDetails?: string | null;
  readonly bio?: string | null;
};

@Injectable()
export class EmployeePersonalDetailsService {
  constructor(
    @Inject(EMPLOYEE_PERSONAL_DETAILS_REPOSITORY)
    private readonly details: TenantScopedRepository<EmployeePersonalDetails>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  getForEmployee(employeeId: EmployeeId): Promise<EmployeePersonalDetails | null> {
    return this.details.findOne({ where: { employeeId } as FindOptionsWhere<EmployeePersonalDetails> });
  }

  async updateForEmployee(
    employeeId: EmployeeId,
    updatedByUserId: UserId,
    input: UpdateEmployeePersonalDetailsData,
  ): Promise<EmployeePersonalDetails> {
    if (!(await this.employeeDirectory.exists(employeeId))) {
      throw new NotFoundError('Employee not found', { id: employeeId });
    }
    const existing = await this.getForEmployee(employeeId);
    const record =
      existing ??
      this.details.create({
        employeeId,
        passportNumber: null,
        passportIssueDate: null,
        passportIssuePlace: null,
        passportValidUpto: null,
        maritalStatus: null,
        bloodGroup: null,
        familyBackground: null,
        healthDetails: null,
        bio: null,
        updatedByUserId,
      });

    for (const [key, value] of Object.entries(input) as [keyof UpdateEmployeePersonalDetailsData, unknown][]) {
      if (value !== undefined) {
        (record as unknown as Record<string, unknown>)[key] = value;
      }
    }
    record.updatedByUserId = updatedByUserId;
    const saved = await this.dataSource.transaction(async (manager) => {
      const persisted = await manager.save(record);
      await this.publisher.publishWithin(manager, {
        name: 'employee.personalDetailsUpdated',
        payload: {
          employeePersonalDetailsId: toId<EmployeePersonalDetailsId>(persisted.id),
          employeeId,
        },
      });
      return persisted;
    });

    await this.audit.record({
      action: existing ? 'update' : 'create',
      resourceType: 'employee_personal_details',
      resourceId: saved.id,
      after: { employeeId },
    });
    return saved;
  }
}
