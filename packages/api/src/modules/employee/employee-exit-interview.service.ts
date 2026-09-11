import type { EmployeeId, EmployeeSeparationId, ExitInterviewDecision, ExitInterviewStatus, UserId } from '@hrms/shared';
import { toId, type EmployeeExitInterviewId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from './employee-directory.service';
import { EMPLOYEE_EXIT_INTERVIEW_REPOSITORY } from './employee.tokens';
import { EmployeeExitInterview } from './entities/employee-exit-interview.entity';

type UpsertExitInterviewData = {
  readonly employeeId: EmployeeId;
  readonly separationId: EmployeeSeparationId;
  readonly status?: ExitInterviewStatus | null;
  readonly scheduledDate?: string | null;
  readonly interviewerUserIds?: UserId[] | null;
  readonly summary?: string | null;
  readonly finalDecision?: ExitInterviewDecision | null;
  readonly updatedByUserId?: UserId | null;
};

@Injectable()
export class EmployeeExitInterviewService {
  constructor(
    @Inject(EMPLOYEE_EXIT_INTERVIEW_REPOSITORY)
    private readonly interviews: TenantScopedRepository<EmployeeExitInterview>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  listForEmployee(employeeId: EmployeeId): Promise<EmployeeExitInterview[]> {
    return this.interviews.find({ where: { employeeId } as FindOptionsWhere<EmployeeExitInterview>, order: { createdAt: 'DESC' } });
  }

  getBySeparation(separationId: EmployeeSeparationId): Promise<EmployeeExitInterview | null> {
    return this.interviews.findOne({ where: { separationId } as FindOptionsWhere<EmployeeExitInterview> });
  }

  async upsert(input: UpsertExitInterviewData): Promise<EmployeeExitInterview> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const existing = await this.getBySeparation(input.separationId);
    const record = existing ?? this.interviews.create({
      employeeId: input.employeeId,
      separationId: input.separationId,
      status: input.status ?? 'pending',
      scheduledDate: input.scheduledDate ?? null,
      summary: input.summary ?? null,
      finalDecision: input.finalDecision ?? null,
      updatedByUserId: input.updatedByUserId ?? null,
    });
    if (existing) {
      if (input.status !== undefined && input.status !== null) record.status = input.status;
      if (input.scheduledDate !== undefined) record.scheduledDate = input.scheduledDate;
      if (input.summary !== undefined) record.summary = input.summary;
      if (input.finalDecision !== undefined) record.finalDecision = input.finalDecision;
      record.updatedByUserId = input.updatedByUserId ?? record.updatedByUserId;
    }
    if (input.interviewerUserIds !== undefined && input.interviewerUserIds !== null) {
      record.interviewerUserIds = input.interviewerUserIds;
    } else if (!existing && input.interviewerUserIds === undefined) {
      record.interviewerUserIds = [];
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const persisted = await manager.save(record);
      await this.publisher.publishWithin(manager, {
        name: 'employee.exitInterviewRecorded',
        payload: {
          employeeExitInterviewId: toId<EmployeeExitInterviewId>(persisted.id),
          employeeId: input.employeeId,
          separationId: input.separationId,
        },
      });
      return persisted;
    });

    await this.audit.record({
      action: existing ? 'update' : 'create',
      resourceType: 'employee_exit_interview',
      resourceId: saved.id,
      after: { employeeId: input.employeeId, separationId: input.separationId },
    });
    return saved;
  }
}
