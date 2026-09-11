import {
  rangesOverlap,
  toId,
  type AssignmentId,
  type AssignmentType,
  type DateRange,
  type EmployeeId,
  type IsoDate,
  type PositionId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { EffectiveDatingError, NotFoundError } from '../../common/errors';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { ASSIGNMENT_REPOSITORY } from './assignment.tokens';
import { Assignment } from './entities/assignment.entity';


type CreateAssignmentInput = {
  readonly employeeId: EmployeeId;
  readonly positionId: PositionId;
  readonly validFrom: IsoDate;
  readonly validTo?: IsoDate | null;
  readonly assignmentType?: AssignmentType;
  readonly reportsToEmployeeId?: EmployeeId | null;
  readonly isPrimary?: boolean;
};

type SetReportingLineInput = {
  readonly employeeId: EmployeeId;
  readonly reportsToEmployeeId: EmployeeId | null;
  readonly effectiveDate: IsoDate;
  /** Only needed when the employee holds no assignment yet. */
  readonly positionId?: PositionId | null;
};

@Injectable()
export class AssignmentService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: TenantScopedRepository<Assignment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(input: CreateAssignmentInput): Promise<Assignment> {
    const isPrimary = input.isPrimary ?? true;
    if (isPrimary) {
      await this.assertNoPrimaryOverlap(input.employeeId, {
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
      });
    }

    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const entity = manager.create(Assignment, {
        organizationId,
        employeeId: input.employeeId,
        positionId: input.positionId,
        assignmentType: input.assignmentType ?? 'primary',
        reportsToEmployeeId: input.reportsToEmployeeId ?? null,
        isPrimary,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
      });
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'assignment.created',
        payload: {
          assignmentId: toId<AssignmentId>(saved.id),
          employeeId: input.employeeId,
          positionId: input.positionId,
          effectiveDate: input.validFrom,
        },
      });
      return saved;
    });
  }

  async end(id: string, effectiveDate: IsoDate): Promise<Assignment> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const entity = await manager.findOne(Assignment, { where: { id, organizationId } });
      if (!entity) {
        throw new NotFoundError('Assignment not found', { id });
      }
      entity.validTo = effectiveDate;
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'assignment.ended',
        payload: { assignmentId: toId<AssignmentId>(saved.id), employeeId: entity.employeeId, effectiveDate },
      });
      return saved;
    });
  }

  listForEmployee(employeeId: EmployeeId): Promise<Assignment[]> {
    return this.assignments.find({ where: { employeeId } as FindOptionsWhere<Assignment> });
  }

  /** The primary assignment in force on a date, if any. */
  async currentPrimary(employeeId: EmployeeId, asOf: IsoDate): Promise<Assignment | null> {
    const all = await this.assignments.find({
      where: { employeeId, isPrimary: true } as FindOptionsWhere<Assignment>,
    });
    return (
      all.find(
        (assignment) =>
          assignment.validFrom <= asOf && (assignment.validTo === null || assignment.validTo > asOf),
      ) ?? null
    );
  }

  /**
   * Changes who someone reports to, effective from a date. Reporting lines are
   * effective-dated like every other backbone fact (plan.md §1), so this closes
   * the assignment in force and opens a new one rather than editing history.
   */
  async setReportingLine(input: SetReportingLineInput): Promise<Assignment> {
    if (input.reportsToEmployeeId === input.employeeId) {
      throw new EffectiveDatingError('An employee cannot report to themselves', {
        employeeId: input.employeeId,
      });
    }
    if (input.reportsToEmployeeId) {
      await this.assertNoReportingCycle(
        input.employeeId,
        input.reportsToEmployeeId,
        input.effectiveDate,
      );
    }

    const current = await this.currentPrimary(input.employeeId, input.effectiveDate);

    // A change on the day the assignment starts is a correction, not a new dated
    // fact: nothing was ever true under the old line. Edit the row in place so
    // history does not fill with zero-length ranges.
    if (current && current.validFrom === input.effectiveDate) {
      return this.correctReportingLine(current, input.reportsToEmployeeId);
    }

    if (current) {
      // Ranges are half-open, so closing at the effective date leaves no gap and
      // no overlap with one starting the same day.
      await this.end(current.id, input.effectiveDate);
    }

    const positionId = input.positionId ?? (current ? toId<PositionId>(current.positionId) : null);
    if (!positionId) {
      throw new NotFoundError('No position to assign this employee to', {
        employeeId: input.employeeId,
      });
    }

    return this.create({
      employeeId: input.employeeId,
      positionId,
      validFrom: input.effectiveDate,
      assignmentType: current?.assignmentType ?? 'primary',
      isPrimary: true,
      reportsToEmployeeId: input.reportsToEmployeeId,
    });
  }

  private async correctReportingLine(
    assignment: Assignment,
    reportsToEmployeeId: EmployeeId | null,
  ): Promise<Assignment> {
    return this.dataSource.transaction(async (manager) => {
      assignment.reportsToEmployeeId = reportsToEmployeeId;
      const saved = await manager.save(assignment);
      await this.publisher.publishWithin(manager, {
        name: 'assignment.updated',
        payload: {
          assignmentId: toId<AssignmentId>(saved.id),
          employeeId: toId<EmployeeId>(saved.employeeId),
          reportsToEmployeeId,
          effectiveDate: saved.validFrom,
        },
      });
      return saved;
    });
  }

  // Walks up from the proposed manager. If the employee appears anywhere on that
  // chain, the change would close a loop and the org chart would never terminate.
  private async assertNoReportingCycle(
    employeeId: EmployeeId,
    managerId: EmployeeId,
    asOf: IsoDate,
  ): Promise<void> {
    const seen = new Set<string>([employeeId]);
    let cursor: EmployeeId | null = managerId;

    while (cursor) {
      if (seen.has(cursor)) {
        throw new EffectiveDatingError('That manager reports to this employee', {
          employeeId,
          managerId,
        });
      }
      seen.add(cursor);
      const assignment: Assignment | null = await this.currentPrimary(cursor, asOf);
      cursor = assignment?.reportsToEmployeeId
        ? toId<EmployeeId>(assignment.reportsToEmployeeId)
        : null;
    }
  }

  // A person holds at most one primary assignment at any moment. Reuses the
  // shared half-open range math so the overlap rule is identical everywhere.
  private async assertNoPrimaryOverlap(employeeId: EmployeeId, range: DateRange): Promise<void> {
    const existing = await this.assignments.find({
      where: { employeeId, isPrimary: true } as FindOptionsWhere<Assignment>,
    });
    const conflict = existing.find((assignment) =>
      rangesOverlap({ validFrom: assignment.validFrom, validTo: assignment.validTo }, range),
    );
    if (conflict) {
      throw new EffectiveDatingError('A primary assignment already exists for this period', {
        employeeId,
        conflictingAssignmentId: conflict.id,
      });
    }
  }
}
