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
import type { EntityManager } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { ConflictError, EffectiveDatingError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../employee/employee-directory.service';
import { PositionService } from '../position/position.service';

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
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly positions: PositionService,
  ) {}

  // The caller can pass a transaction manager (offer acceptance, reporting-line
  // change) so the close+open pair commits or rolls back as one unit; without
  // one the create opens its own transaction.
  async create(input: CreateAssignmentInput, manager?: EntityManager): Promise<Assignment> {
    const validTo = input.validTo ?? null;
    if (validTo !== null && input.validFrom > validTo) {
      throw new ValidationFailedError('validFrom must be on or before validTo', {
        validFrom: input.validFrom,
        validTo,
      });
    }
    const isPrimary = input.isPrimary ?? true;
    const organizationId = this.tenantContext.getOrganizationId();
    const run = async (target: EntityManager): Promise<Assignment> => {
      if (!(await this.employeeDirectory.exists(input.employeeId, target))) {
        throw new NotFoundError('Employee not found', { id: input.employeeId });
      }
      // Throws NotFoundError when the position does not exist.
      await this.positions.getById(input.positionId);
      if (isPrimary) {
        await this.assertNoPrimaryOverlap(target, input.employeeId, {
          validFrom: input.validFrom,
          validTo,
        });
      }
      const entity = target.create(Assignment, {
        organizationId,
        employeeId: input.employeeId,
        positionId: input.positionId,
        assignmentType: input.assignmentType ?? 'primary',
        reportsToEmployeeId: input.reportsToEmployeeId ?? null,
        isPrimary,
        validFrom: input.validFrom,
        validTo,
      });
      const saved = await target.save(entity);
      await this.publisher.publishWithin(target, {
        name: 'assignment.created',
        payload: {
          assignmentId: toId<AssignmentId>(saved.id),
          employeeId: input.employeeId,
          positionId: input.positionId,
          effectiveDate: input.validFrom,
        },
      });
      return saved;
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  async end(id: string, effectiveDate: IsoDate, manager?: EntityManager): Promise<Assignment> {
    const organizationId = this.tenantContext.getOrganizationId();
    const run = async (target: EntityManager): Promise<Assignment> => {
      const entity = await target.findOne(Assignment, { where: { id, organizationId } });
      if (!entity) {
        throw new NotFoundError('Assignment not found', { id });
      }
      if (entity.validTo !== null) {
        throw new ConflictError('Assignment has already ended', {
          id,
          validTo: entity.validTo,
        });
      }
      if (effectiveDate < entity.validFrom) {
        throw new ValidationFailedError('effectiveDate cannot precede the assignment start', {
          id,
          effectiveDate,
          validFrom: entity.validFrom,
        });
      }
      entity.validTo = effectiveDate;
      const saved = await target.save(entity);
      await this.publisher.publishWithin(target, {
        name: 'assignment.ended',
        payload: {
          assignmentId: toId<AssignmentId>(saved.id),
          employeeId: entity.employeeId,
          effectiveDate,
        },
      });
      return saved;
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  listForEmployee(employeeId: EmployeeId): Promise<Assignment[]> {
    return this.assignments.find({ where: { employeeId } as FindOptionsWhere<Assignment> });
  }

  /** The primary assignment in force on a date, if any. */
  async currentPrimary(
    employeeId: EmployeeId,
    asOf: IsoDate,
    manager?: EntityManager,
  ): Promise<Assignment | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const all = manager
      ? await manager.find(Assignment, {
          where: {
            organizationId,
            employeeId,
            isPrimary: true,
          } as FindOptionsWhere<Assignment>,
        })
      : await this.assignments.find({
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
   * Close and open share one transaction: a failure between them can never leave
   * the employee unassigned.
   */
  async setReportingLine(input: SetReportingLineInput): Promise<Assignment> {
    if (input.reportsToEmployeeId === input.employeeId) {
      throw new EffectiveDatingError('An employee cannot report to themselves', {
        employeeId: input.employeeId,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      if (input.reportsToEmployeeId) {
        await this.assertNoReportingCycle(
          input.employeeId,
          input.reportsToEmployeeId,
          input.effectiveDate,
          manager,
        );
      }

      const current = await this.currentPrimary(
        input.employeeId,
        input.effectiveDate,
        manager,
      );

      // A change on the day the assignment starts is a correction, not a new dated
      // fact: nothing was ever true under the old line. Edit the row in place so
      // history does not fill with zero-length ranges.
      if (current && current.validFrom === input.effectiveDate) {
        return this.correctReportingLine(current, input.reportsToEmployeeId, manager);
      }

      if (current) {
        // Ranges are half-open, so closing at the effective date leaves no gap and
        // no overlap with one starting the same day.
        await this.end(current.id, input.effectiveDate, manager);
      }

      const positionId = input.positionId ?? (current ? toId<PositionId>(current.positionId) : null);
      if (!positionId) {
        throw new NotFoundError('No position to assign this employee to', {
          employeeId: input.employeeId,
        });
      }

      return this.create(
        {
          employeeId: input.employeeId,
          positionId,
          validFrom: input.effectiveDate,
          assignmentType: current?.assignmentType ?? 'primary',
          isPrimary: true,
          reportsToEmployeeId: input.reportsToEmployeeId,
        },
        manager,
      );
    });
  }

  private async correctReportingLine(
    assignment: Assignment,
    reportsToEmployeeId: EmployeeId | null,
    manager?: EntityManager,
  ): Promise<Assignment> {
    const run = async (target: EntityManager): Promise<Assignment> => {
      assignment.reportsToEmployeeId = reportsToEmployeeId;
      const saved = await target.save(assignment);
      await this.publisher.publishWithin(target, {
        name: 'assignment.updated',
        payload: {
          assignmentId: toId<AssignmentId>(saved.id),
          employeeId: toId<EmployeeId>(saved.employeeId),
          reportsToEmployeeId,
          effectiveDate: saved.validFrom,
        },
      });
      return saved;
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  // Walks up from the proposed manager. If the employee appears anywhere on that
  // chain, the change would close a loop and the org chart would never terminate.
  private async assertNoReportingCycle(
    employeeId: EmployeeId,
    managerId: EmployeeId,
    asOf: IsoDate,
    manager?: EntityManager,
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
      const assignment: Assignment | null = await this.currentPrimary(cursor, asOf, manager);
      cursor = assignment?.reportsToEmployeeId
        ? toId<EmployeeId>(assignment.reportsToEmployeeId)
        : null;
    }
  }

  // A person holds at most one primary assignment at any moment. Reuses the
  // shared half-open range math so the overlap rule is identical everywhere.
  private async assertNoPrimaryOverlap(
    manager: EntityManager,
    employeeId: EmployeeId,
    range: DateRange,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const existing = await manager.find(Assignment, {
      where: {
        organizationId,
        employeeId,
        isPrimary: true,
      } as FindOptionsWhere<Assignment>,
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