import { toId, type DepartmentId, type GradeId, type JobId, type LocationId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { Job } from './entities/job.entity';
import { Position, type PositionStatus } from './entities/position.entity';
import { POSITION_REPOSITORY } from './position.tokens';


type CreatePositionInput = {
  readonly title: string;
  readonly jobId: JobId;
  readonly departmentId?: DepartmentId | null;
  readonly locationId?: LocationId | null;
  readonly gradeId?: GradeId | null;
  readonly headcount?: number;
};

@Injectable()
export class PositionService {
  constructor(
    @Inject(POSITION_REPOSITORY) private readonly positions: TenantScopedRepository<Position>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * A position matching this title, creating one (and the job behind it) if the
   * workspace has none. Reporting lines hang off an assignment, an assignment
   * needs a position, and there is no position-management screen yet — without
   * this, nobody could set a manager on an employee who has never been assigned.
   *
   * An optional `manager` joins a caller-owned transaction (offer acceptance);
   * the tenant still comes from the active context, so the caller switches
   * workspaces before calling.
   */
  async ensureByTitle(title: string, manager?: EntityManager): Promise<Position> {
    const run = async (transactionManager: EntityManager): Promise<Position> => {
      const organizationId = this.tenantContext.getOrganizationId();
      const positions = transactionManager.getRepository(Position);
      const jobs = transactionManager.getRepository(Job);
      const trimmed = title.trim() || 'Unassigned';
      // Serialize per (workspace, title): find-then-insert without a unique
      // index lets two concurrent calls each create a position for the same
      // title. The advisory lock is released with the transaction.
      await transactionManager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `position:${organizationId}:${trimmed}`,
      ]);
      const existing = await positions.findOne({
        where: { title: trimmed, organizationId } as FindOptionsWhere<Position>,
      });
      if (existing) return existing;

      const jobTitle = 'General';
      // The position lock above is per title, so calls for different titles can
      // still race the shared 'General' job: lock that key separately.
      await transactionManager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `job:${organizationId}:${jobTitle}`,
      ]);
      const job =
        (await jobs.findOne({
          where: { title: jobTitle, organizationId } as FindOptionsWhere<Job>,
        })) ??
        (await jobs.save(jobs.create({ organizationId, title: jobTitle, jobFamilyId: null })));

      return positions.save(
        positions.create({
          organizationId,
          title: trimmed,
          jobId: toId<JobId>(job.id),
          departmentId: null,
          locationId: null,
          gradeId: null,
          status: 'open',
          headcount: 1,
        }),
      );
    };
    return manager
      ? run(manager)
      : this.dataSource.transaction((transactionManager) => run(transactionManager));
  }

  create(input: CreatePositionInput): Promise<Position> {
    const position = this.positions.create({
      title: input.title,
      jobId: input.jobId,
      departmentId: input.departmentId ?? null,
      locationId: input.locationId ?? null,
      gradeId: input.gradeId ?? null,
      status: 'open',
      headcount: input.headcount ?? 1,
    });
    return this.positions.save(position);
  }

  list(): Promise<Position[]> {
    return this.positions.find();
  }

  async setStatus(id: string, status: PositionStatus, manager?: EntityManager): Promise<Position> {
    const run = async (transactionManager: EntityManager): Promise<Position> => {
      const organizationId = this.tenantContext.getOrganizationId();
      const positions = transactionManager.getRepository(Position);
      const position = await positions.findOne({
        where: { id, organizationId } as FindOptionsWhere<Position>,
      });
      if (!position) {
        throw new NotFoundError('Position not found', { id });
      }
      position.status = status;
      return positions.save(position);
    };
    return manager
      ? run(manager)
      : this.dataSource.transaction((transactionManager) => run(transactionManager));
  }

  async getById(id: string, manager?: EntityManager): Promise<Position> {
    const organizationId = this.tenantContext.getOrganizationId();
    // Callers inside a unit of work pass their manager so a position created
    // earlier in that same transaction is visible (offer acceptance).
    const position = manager
      ? await manager.getRepository(Position).findOne({
          where: { id, organizationId } as FindOptionsWhere<Position>,
        })
      : await this.positions.findById(id);
    if (!position) {
      throw new NotFoundError('Position not found', { id });
    }
    return position;
  }
}
