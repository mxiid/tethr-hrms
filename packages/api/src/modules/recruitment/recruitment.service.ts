import {
  toId,
  type HiringRequestId,
  type HiringRequestPriority,
  type HiringRequestStatus,
  type OrganizationId,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere, In } from 'typeorm';

import { ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { OrganizationService } from '../organization/organization.service';
import { PositionService } from '../position/position.service';

import { JOB_POSTING_REPOSITORY } from './ats.tokens';
import { HiringRequestUpdate, type HiringRequestUpdateActor } from './entities/hiring-request-update.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import { JobPosting } from './entities/job-posting.entity';
import { HIRING_REQUEST_REPOSITORY, HIRING_REQUEST_UPDATE_REPOSITORY } from './recruitment.tokens';

// The request's own lifecycle. Everything pipeline-shaped (`sourcing`,
// `interviewing`, `offer`) will be derived from applications, not set here.
export const ALLOWED_TRANSITIONS: Readonly<
  Record<HiringRequestStatus, readonly HiringRequestStatus[]>
> = {
  submitted: ['open', 'cancelled'],
  open: ['onHold', 'filled', 'cancelled'],
  onHold: ['open', 'cancelled'],
  filled: [],
  cancelled: [],
};

type CreateHiringRequestData = {
  readonly positionTitle: string;
  readonly jobDescription?: string | null;
  readonly headcount?: number;
  readonly employmentType?: string;
  readonly location?: string | null;
  readonly preferredStartDate?: string | null;
  readonly targetFillDate?: string | null;
  readonly salaryMin?: number | null;
  readonly salaryMax?: number | null;
  readonly salaryCurrency?: string | null;
  readonly hiringManagerEmployeeId?: string | null;
  readonly reportsToEmployeeId?: string | null;
  readonly priority?: HiringRequestPriority;
  readonly clientNote?: string | null;
  readonly requestedByUserId: UserId;
  // Who raised it: clients submit against their workspace, Tethr can raise one
  // on their behalf. Drives the first entry of the update trail.
  readonly actor: HiringRequestUpdateActor;
};

type UpdateHiringRequestData = {
  readonly hiringRequestId: HiringRequestId;
  readonly status: HiringRequestStatus;
  readonly tethrNote?: string | null;
  readonly updatedByUserId: UserId;
  readonly actor: HiringRequestUpdateActor;
  // Set by the Tethr board when the row belongs to a client workspace. The
  // caller must be a platform operator; the update then runs in that workspace.
  readonly sourceOrganizationId?: OrganizationId | null;
  // A caller-owned transaction (offer acceptance) to join instead of opening
  // one; the caller then owns the position sync too.
  readonly manager?: EntityManager;
};

export type HiringRequestRecord = {
  readonly request: HiringRequest;
  readonly updates: readonly HiringRequestUpdate[];
};

export type ClientHiringRequestRecord = HiringRequestRecord & {
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
};

const money = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toFixed(2);

@Injectable()
export class RecruitmentService {
  constructor(
    @Inject(HIRING_REQUEST_REPOSITORY)
    private readonly hiringRequests: TenantScopedRepository<HiringRequest>,
    @Inject(HIRING_REQUEST_UPDATE_REPOSITORY)
    private readonly hiringRequestUpdates: TenantScopedRepository<HiringRequestUpdate>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(JOB_POSTING_REPOSITORY)
    private readonly postings: TenantScopedRepository<JobPosting>,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly platformScope: PlatformScopeService,
    private readonly organizations: OrganizationService,
    private readonly positions: PositionService,
  ) {}

  async createHiringRequest(input: CreateHiringRequestData): Promise<HiringRequest> {
    const organizationId = this.tenantContext.getOrganizationId();
    const request = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(HiringRequest, {
        organizationId,
        positionTitle: input.positionTitle,
        jobDescription: input.jobDescription ?? null,
        headcount: input.headcount ?? 1,
        employmentType: input.employmentType ?? 'permanent',
        location: input.location ?? null,
        preferredStartDate: input.preferredStartDate ?? null,
        targetFillDate: input.targetFillDate ?? null,
        salaryMin: money(input.salaryMin),
        salaryMax: money(input.salaryMax),
        salaryCurrency: input.salaryCurrency?.toUpperCase() ?? null,
        hiringManagerEmployeeId: input.hiringManagerEmployeeId ?? null,
        reportsToEmployeeId: input.reportsToEmployeeId ?? null,
        priority: input.priority ?? 'normal',
        positionId: null,
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
          actor: input.actor,
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

  // The cross-client board: one read across every client workspace plus the
  // operator's own, so Tethr sees a single list. Guarded by PlatformScopeService
  // (organization kind + platform:read-all) and audited per workspace switched.
  async listClientHiringRequests(): Promise<ClientHiringRequestRecord[]> {
    const operator = await this.platformScope.assertOperator(PERMISSIONS.platformReadAll);
    const clientOrganizationIds = await this.platformScope.listClientOrganizationIds();
    const organizationIds = [
      operator.organizationId,
      ...clientOrganizationIds.filter((id) => id !== operator.organizationId),
    ];

    const records: ClientHiringRequestRecord[] = [];
    for (const organizationId of organizationIds) {
      const organization = await this.organizations.getById(organizationId);
      const tenantRecords = await this.platformScope.switchTo(
        {
          organizationId,
          purpose: 'hiring-request board read',
          resourceType: 'hiring_request',
          resourceId: organizationId,
        },
        () => this.listHiringRequests(),
      );
      for (const record of tenantRecords) {
        records.push({
          ...record,
          organizationId,
          organizationName: organization?.displayName ?? 'Unknown workspace',
        });
      }
    }
    return records.sort(
      (left, right) => right.request.updatedAt.getTime() - left.request.updatedAt.getTime(),
    );
  }

  async updateHiringRequest(input: UpdateHiringRequestData): Promise<HiringRequest> {
    const organizationId = this.tenantContext.getOrganizationId();
    // The board acts on rows from other workspaces; reading and writing them
    // requires platform scope, so switch into the request's tenant (audited)
    // before touching it. A client caller can never pass another workspace.
    if (input.sourceOrganizationId && input.sourceOrganizationId !== organizationId) {
      await this.platformScope.assertOperator(PERMISSIONS.hiringRequestManage);
      const updated = await this.platformScope.switchTo(
        {
          organizationId: input.sourceOrganizationId,
          purpose: 'hiring request update',
          resourceType: 'hiring_request',
          resourceId: input.hiringRequestId,
        },
        () => this.updateHiringRequest({ ...input, sourceOrganizationId: null }),
      );
      // Postings live in the operator's workspace, so the unpublish must run
      // here at home — the switch has unwound, the tenant is Tethr again.
      if (updated.status === 'cancelled' || updated.status === 'filled') {
        await this.unpublishPostingsForRequest(updated.id);
      }
      return updated;
    }
    const run = async (
      manager: EntityManager,
    ): Promise<{ saved: HiringRequest; previousStatus: HiringRequestStatus }> => {
      const current = await manager.findOne(HiringRequest, {
        where: {
          id: input.hiringRequestId,
          organizationId,
        } as FindOptionsWhere<HiringRequest>,
      });
      if (!current) {
        throw new NotFoundError('Hiring request not found', { id: input.hiringRequestId });
      }
      if (current.status !== input.status) {
        const allowed = ALLOWED_TRANSITIONS[current.status];
        if (!allowed.includes(input.status)) {
          throw new ConflictError(
            `A ${current.status} request cannot become ${input.status}`,
            { from: current.status, to: input.status },
          );
        }
      }
      const previousStatus = current.status;
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
          actor: input.actor,
          note: input.tethrNote ?? null,
          createdByUserId: input.updatedByUserId,
        }),
      );
      // A note-only save is not a status change: the event drives the Slack
      // status notice, so publishing it for every call would repeat the last
      // status. The update trail above still records every note.
      if (saved.status !== previousStatus) {
        await this.publisher.publishWithin(manager, {
          name: 'hiringRequest.updated',
          payload: {
            hiringRequestId: toId<HiringRequestId>(saved.id),
            status: saved.status,
            positionTitle: saved.positionTitle,
          },
        });
      }
      return { saved, previousStatus };
    };
    // A caller-owned transaction (offer acceptance) skips the position sync —
    // it performs the position closure itself within the same transaction.
    const { saved, previousStatus } = input.manager
      ? await run(input.manager)
      : await this.dataSource.transaction((manager) => run(manager));

    const withPosition = input.manager
      ? saved
      : await this.applyPositionTransition(saved, previousStatus);

    await this.audit.record(
      {
        action: 'update',
        resourceType: 'hiring_request',
        resourceId: withPosition.id,
        before: { status: previousStatus },
        after: { status: withPosition.status, positionId: withPosition.positionId },
      },
      // Join the caller's transaction when one is supplied (offer acceptance).
      input.manager,
    );

    // A closed request takes its posting off the air. Postings live in the
    // caller's workspace (Tethr's, for client requests): on the board path the
    // platform switch has already unwound, so this queries at home and is a
    // no-op for a client workspace — a client cancellation is unpublishable by
    // an operator through the unpublishJobPosting mutation.
    if (withPosition.status === 'cancelled' || withPosition.status === 'filled') {
      await this.unpublishPostingsForRequest(withPosition.id);
    }
    return withPosition;
  }

  private async unpublishPostingsForRequest(hiringRequestId: string): Promise<void> {
    const live = await this.postings.find({
      where: {
        sourceHiringRequestId: hiringRequestId,
        isPublished: true,
      } as FindOptionsWhere<JobPosting>,
    });
    for (const posting of live) {
      posting.isPublished = false;
      const saved = await this.postings.save(posting);
      await this.audit.record({
        action: 'unpublish',
        resourceType: 'job_posting',
        resourceId: saved.id,
        after: { reason: 'hiring request closed', hiringRequestId },
      });
    }
  }

  // Reconcile with Position, whose status and headcount shadow the request's:
  // opening links the requisition to a position; a terminal request closes it.
  // Kept outside the request transaction on purpose — positions are a different
  // aggregate, and a failed reconciliation is visible rather than silent.
  private async applyPositionTransition(
    request: HiringRequest,
    previousStatus: HiringRequestStatus,
  ): Promise<HiringRequest> {
    if (request.status === previousStatus) return request;

    if (request.status === 'open') {
      const position = await this.positions.ensureByTitle(request.positionTitle);
      if (request.positionId !== position.id) {
        request.positionId = position.id;
        await this.hiringRequests.save(request);
      }
      if (position.status !== 'open') {
        await this.positions.setStatus(position.id, 'open');
      }
      return request;
    }

    if (request.positionId && (request.status === 'filled' || request.status === 'cancelled')) {
      await this.positions.setStatus(
        request.positionId,
        request.status === 'filled' ? 'filled' : 'closed',
      );
    }

    // A held request freezes its position (no sourcing against it), and resuming
    // reopens it through the `open` branch above. Never freeze a filled/closed
    // position — only an open one.
    if (request.positionId && request.status === 'onHold') {
      const position = await this.positions.ensureByTitle(request.positionTitle);
      if (position.status === 'open') {
        await this.positions.setStatus(position.id, 'frozen');
      }
    }
    return request;
  }
}
