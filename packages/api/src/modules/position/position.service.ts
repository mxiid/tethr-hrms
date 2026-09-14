import { toId, type DepartmentId, type GradeId, type JobId, type LocationId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../../common/errors';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { Job } from './entities/job.entity';
import { Position, type PositionStatus } from './entities/position.entity';
import { JOB_REPOSITORY, POSITION_REPOSITORY } from './position.tokens';


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
    @Inject(JOB_REPOSITORY) private readonly jobs: TenantScopedRepository<Job>,
  ) {}

  /**
   * A position matching this title, creating one (and the job behind it) if the
   * workspace has none. Reporting lines hang off an assignment, an assignment
   * needs a position, and there is no position-management screen yet — without
   * this, nobody could set a manager on an employee who has never been assigned.
   */
  async ensureByTitle(title: string): Promise<Position> {
    const trimmed = title.trim() || 'Unassigned';
    const existing = await this.positions.findOne({ where: { title: trimmed } });
    if (existing) return existing;

    const jobTitle = 'General';
    const job =
      (await this.jobs.findOne({ where: { title: jobTitle } })) ??
      (await this.jobs.save(this.jobs.create({ title: jobTitle, jobFamilyId: null })));

    return this.create({ title: trimmed, jobId: toId<JobId>(job.id), headcount: 1 });
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

  async setStatus(id: string, status: PositionStatus): Promise<Position> {
    const position = await this.getById(id);
    position.status = status;
    return this.positions.save(position);
  }

  async getById(id: string): Promise<Position> {
    const position = await this.positions.findById(id);
    if (!position) {
      throw new NotFoundError('Position not found', { id });
    }
    return position;
  }
}
