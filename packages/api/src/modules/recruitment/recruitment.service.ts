import { toId, type HiringRequestId, type HiringRequestStatus, type UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type FindOptionsWhere, In } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { HiringRequestUpdate } from './entities/hiring-request-update.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import { HIRING_REQUEST_REPOSITORY, HIRING_REQUEST_UPDATE_REPOSITORY } from './recruitment.tokens';

type CreateHiringRequestData = {
  readonly positionTitle: string;
  readonly headcount?: number;
  readonly employmentType?: string;
  readonly location?: string | null;
  readonly preferredStartDate?: string | null;
  readonly clientNote?: string | null;
  readonly requestedByUserId: UserId;
};

type UpdateHiringRequestData = {
  readonly hiringRequestId: HiringRequestId;
  readonly status: HiringRequestStatus;
  readonly tethrNote?: string | null;
  readonly updatedByUserId: UserId;
};

export type HiringRequestRecord = {
  readonly request: HiringRequest;
  readonly updates: readonly HiringRequestUpdate[];
};

@Injectable()
export class RecruitmentService {
  constructor(
    @Inject(HIRING_REQUEST_REPOSITORY)
    private readonly hiringRequests: TenantScopedRepository<HiringRequest>,
    @Inject(HIRING_REQUEST_UPDATE_REPOSITORY)
    private readonly hiringRequestUpdates: TenantScopedRepository<HiringRequestUpdate>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async createHiringRequest(input: CreateHiringRequestData): Promise<HiringRequest> {
    const organizationId = this.tenantContext.getOrganizationId();
    const request = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(HiringRequest, {
        organizationId,
        positionTitle: input.positionTitle,
        headcount: input.headcount ?? 1,
        employmentType: input.employmentType ?? 'permanent',
        location: input.location ?? null,
        preferredStartDate: input.preferredStartDate ?? null,
        clientNote: input.clientNote ?? null,
        tethrNote: null,
        status: 'submitted',
        requestedByUserId: input.requestedByUserId,
        updatedByUserId: input.requestedByUserId,
      });
      const saved = await manager.save(entity);
      await manager.save(
        manager.create(HiringRequestUpdate, {
          organizationId,
          hiringRequestId: toId<HiringRequestId>(saved.id),
          status: saved.status,
          actor: 'client',
          note: input.clientNote ?? null,
          createdByUserId: input.requestedByUserId,
        }),
      );
      await this.publisher.publishWithin(manager, {
        name: 'hiringRequest.submitted',
        payload: {
          hiringRequestId: toId<HiringRequestId>(saved.id),
          positionTitle: saved.positionTitle,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'create',
      resourceType: 'hiring_request',
      resourceId: request.id,
      after: { positionTitle: request.positionTitle, status: request.status },
    });
    return request;
  }

  async listHiringRequests(): Promise<HiringRequestRecord[]> {
    const requests = await this.hiringRequests.find({ order: { updatedAt: 'DESC' } });
    if (requests.length === 0) return [];
    const requestIds = requests.map((request) => toId<HiringRequestId>(request.id));
    const updates = await this.hiringRequestUpdates.find({
      where: { hiringRequestId: In(requestIds) } as FindOptionsWhere<HiringRequestUpdate>,
      order: { createdAt: 'ASC' },
    });
    const updatesByRequestId = new Map<string, HiringRequestUpdate[]>();
    for (const update of updates) {
      updatesByRequestId.set(update.hiringRequestId, [
        ...(updatesByRequestId.get(update.hiringRequestId) ?? []),
        update,
      ]);
    }
    return requests.map((request) => ({
      request,
      updates: updatesByRequestId.get(request.id) ?? [],
    }));
  }

  async updateHiringRequest(input: UpdateHiringRequestData): Promise<HiringRequest> {
    const organizationId = this.tenantContext.getOrganizationId();
    const request = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(HiringRequest, {
        where: {
          id: input.hiringRequestId,
          organizationId,
        } as FindOptionsWhere<HiringRequest>,
      });
      if (!current) {
        throw new NotFoundError('Hiring request not found', { id: input.hiringRequestId });
      }
      current.status = input.status;
      if (input.tethrNote !== undefined) {
        current.tethrNote = input.tethrNote;
      }
      current.updatedByUserId = input.updatedByUserId;
      const saved = await manager.save(current);
      await manager.save(
        manager.create(HiringRequestUpdate, {
          organizationId,
          hiringRequestId: input.hiringRequestId,
          status: saved.status,
          actor: 'tethr',
          note: input.tethrNote ?? null,
          createdByUserId: input.updatedByUserId,
        }),
      );
      await this.publisher.publishWithin(manager, {
        name: 'hiringRequest.updated',
        payload: { hiringRequestId: toId<HiringRequestId>(saved.id), status: saved.status },
      });
      return saved;
    });

    await this.audit.record({
      action: 'update',
      resourceType: 'hiring_request',
      resourceId: request.id,
      after: { status: request.status },
    });
    return request;
  }
}
