import {
  toId,
  type HiringRequestId,
  type HiringRequestPriority,
  type HiringRequestStatus,
  type OrganizationId,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(RecruitmentService.name);

  constructor(
    @Inject(HIRING_REQUEST_REPOSITORY)
    private readonly hiringRequests: TenantScopedRepository<HiringRequest>,
    @Inject(HIRING_REQUEST_UPDATE_REPOSITORY)
    private readonly hiringRequestUpdates: TenantScopedRepository<HiringRequestUpdate>,
    @InjectDataSource() private readonly dataSource: DataSource,
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
      // here at home — the switch has unwound, the tenant is Tethr again. It is
      // best-effort: the event published with the request drives the durable
      // consumer retry, so a failure here cannot leave a live posting behind.
      if (
        updated.status === 'cancelled' ||
        updated.status === 'filled' ||
        updated.status === 'onHold'
      ) {
        await this.unpublishPostingBestEffort(updated.id);
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
      // The status audit commits with the request, its trail and its event:
      // a failed audit rolls the whole transition back instead of leaving a
      // changed request that the API reports as an error.
      await this.audit.record(
        {
          action: 'update',
          resourceType: 'hiring_request',
          resourceId: saved.id,
          before: { status: previousStatus },
          after: { status: saved.status, positionId: saved.positionId },
        },
        manager,
      );
      return { saved, previousStatus };
    };
    // A caller-owned transaction (offer acceptance) skips the position sync —
    // it performs the position closure itself within the same transaction.
    const { saved } = input.manager
      ? await run(input.manager)
      : await this.dataSource.transaction((manager) => run(manager));

    // State-based and idempotent: run on every call, not only on a status
    // change, so replaying the same status repairs a position that a previous
    // attempt failed to synchronize. Reconciles the request's *current* state
    // (not this call's snapshot) with a convergence re-check, so a slow
    // reconciliation can never reopen a position after a newer transition —
    // and the result below reports that freshest state (the link an `open`
    // reconciliation just made included). Best-effort — the updated event's
    // consumer reconciles again durably. The status audit already committed
    // with the transaction; a link this make adds its own audit.
    let current = saved;
    if (!input.manager) {
      try {
        current = (await this.reconcilePositionForRequest(saved.id)) ?? saved;
      } catch (cause) {
        this.logger.error(
          `Position reconciliation failed for request ${saved.id}: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
      }
    }

    // A closed (or held) request takes its posting off the air — decided from
    // the freshest state, so a stale transition (this call's snapshot) cannot
    // unpublish a posting whose request has since moved on. Postings live in
    // the caller's workspace (Tethr's, for client requests): on the board path
    // the platform switch has already unwound, so this queries at home and is a
    // no-op for a client workspace. Best-effort here; the durable consumer
    // retries until the posting is down.
    //
    // Skipped when the caller owns the transaction (offer acceptance): it has
    // already unpublished the posting inside its own unit of work, and opening
    // a sibling transaction here would block on the row lock the caller holds.
    if (
      !input.manager &&
      (current.status === 'cancelled' ||
        current.status === 'filled' ||
        current.status === 'onHold')
    ) {
      await this.unpublishPostingBestEffort(current.id);
    }
    return current;
  }

  // The sync attempt in front of the durable consumer: failures are logged, not
  // surfaced, so a committed request update never looks like a failed call.
  private async unpublishPostingBestEffort(hiringRequestId: string): Promise<void> {
    try {
      await this.unpublishPostingsForRequest(hiringRequestId);
    } catch (cause) {
      this.logger.error(
        `Posting unpublish failed for request ${hiringRequestId} (the consumer will retry): ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  }

  // Durable cleanup entry point (the hiringRequest.updated consumer calls this
  // under the operator workspace's tenant). All rows for the request and their
  // audit records commit together, and the operation is idempotent, so a retry
  // can never leave a partial set or an unaudited unpublish. It reconciles
  // every row for the request, not just the first, in case legacy duplicates
  // exist.
  //
  // The raw manager query carries the active organization explicitly: the
  // system principal runs this in the operator workspace, and
  // `sourceHiringRequestId` has no uniqueness guarantee, so without the
  // predicate a posting owned by another workspace could be matched and
  // unpublished.
  async unpublishPostingsForRequest(hiringRequestId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const postings = await manager.find(JobPosting, {
        where: {
          sourceHiringRequestId: hiringRequestId,
          organizationId: this.tenantContext.getOrganizationId(),
        } as FindOptionsWhere<JobPosting>,
        order: { createdAt: 'ASC' },
      });
      for (const posting of postings) {
        if (!posting.isPublished) {
          continue;
        }
        posting.isPublished = false;
        const saved = await manager.save(posting);
        await this.audit.record(
          {
            action: 'unpublish',
            resourceType: 'job_posting',
            resourceId: saved.id,
            after: { reason: 'hiring request closed', hiringRequestId },
          },
          manager,
        );
      }
    });
  }

  // Fresh-state entry point for position reconciliation: loads the request,
  // applies the reconciliation for its *current* status, then re-reads. If the
  // status changed while the position was being written (a concurrent
  // transition's reconciliation, or this call's own later state), it applies
  // the newer state too, so the position converges on the latest request
  // instead of a stale snapshot. Bounded: the next event or update reconciles
  // again if the status keeps moving.
  //
  // Returns the latest request (or null when it no longer exists). Decisions
  // that must reflect reality — the cleanup consumer's publication gate — read
  // this value, never an event payload's status.
  async reconcilePositionForRequest(hiringRequestId: string): Promise<HiringRequest | null> {
    const maxAttempts = 3;
    let request = await this.hiringRequests.findById(hiringRequestId);
    for (let attempt = 0; attempt < maxAttempts && request; attempt += 1) {
      await this.reconcilePosition(request);
      const latest = await this.hiringRequests.findById(hiringRequestId);
      if (!latest || latest.status === request.status) {
        return latest;
      }
      request = latest;
    }
    return request;
  }

  // Reconcile with Position, whose status and headcount shadow the request's:
  // opening links the requisition to a position; held freezes it; terminal
  // closes it. State-based, so replaying the same status repairs divergence and
  // a retry after a partial failure converges. Kept outside the request
  // transaction on purpose — positions are a different aggregate.
  async reconcilePosition(request: HiringRequest): Promise<HiringRequest> {
    if (request.status === 'open') {
      // Once a position is linked, follow it by id: titles are not unique and
      // may have been renamed, so re-resolving by title here could relink the
      // request to a different row and reopen the wrong position. Title lookup
      // is only for the first open that has no link yet.
      if (request.positionId) {
        const position = await this.positions.getById(request.positionId);
        if (position.status !== 'open') {
          await this.positions.setStatus(position.id, 'open');
        }
        return request;
      }
      const position = await this.positions.ensureByTitle(request.positionTitle);
      request.positionId = position.id;
      // The link and its audit are their own atomic change: reconciliation runs
      // outside the request transaction, and a half-written link (row saved,
      // audit failed) would hide the position ownership from the trail.
      await this.dataSource.transaction(async (manager) => {
        const linked = await manager.save(request);
        await this.audit.record(
          {
            action: 'linkPosition',
            resourceType: 'hiring_request',
            resourceId: linked.id,
            after: { positionId: linked.positionId },
          },
          manager,
        );
      });
      if (position.status !== 'open') {
        await this.positions.setStatus(position.id, 'open');
      }
      return request;
    }

    if (!request.positionId) {
      return request;
    }
    // Every non-open transition targets the linked position by id — never by
    // title, which is not unique and may have been renamed.
    const position = await this.positions.getById(request.positionId);
    if (request.status === 'onHold' && position.status === 'open') {
      await this.positions.setStatus(position.id, 'frozen');
    }
    if (request.status === 'filled' && position.status !== 'filled') {
      await this.positions.setStatus(position.id, 'filled');
    }
    if (request.status === 'cancelled' && position.status !== 'closed') {
      await this.positions.setStatus(position.id, 'closed');
    }
    return request;
  }
}
