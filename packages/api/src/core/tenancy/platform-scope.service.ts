import { toId, type OrganizationId, type OrganizationKind, type UserId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ForbiddenError, UnauthenticatedError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService, type EffectiveAccess } from '../authz/authz.service';
import { type Permission } from '../authz/permissions';

import { TenantContextService } from './tenant-context.service';

export type PlatformOperator = {
  readonly userId: UserId;
  readonly organizationId: OrganizationId;
  readonly access: EffectiveAccess;
};

export type PlatformSwitch = {
  readonly organizationId: OrganizationId;
  readonly purpose: string;
  readonly resourceType: string;
  readonly resourceId: string;
};

const isOrganizationKind = (value: unknown): value is OrganizationKind =>
  value === 'tethr' || value === 'client';

// The one deliberate cross-tenant mechanism (plan: recruitment-ats-plan.md
// "Tenancy"). Two directions use it: Tethr staff reading/writing across client
// workspaces (the board), and a client reading the narrow projection of Tethr's
// workspace that belongs to them (a presented shortlist). Both callers must
// pass their own guard first — assertOperator for the board; the projection
// guard lives with the query it protects — and every switch is audited.
//
// This service lives in core but reads the tenant root (`organizations`) with
// explicit SQL rather than importing the Organization entity: core/ must never
// import from modules/ (two-bucket rule), and the tenant root is core's concern
// anyway.
@Injectable()
export class PlatformScopeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  // Two conditions, both server-side: the caller's own organization is the
  // Tethr workspace, AND the caller holds the permission. Either alone is not
  // enough — a client tenant could theoretically acquire a permission string
  // in its own role data, but it can never become `kind = 'tethr'`.
  async assertOperator(permission: Permission): Promise<PlatformOperator> {
    const userId = this.tenantContext.getUserId();
    if (!userId) {
      throw new UnauthenticatedError();
    }
    const organizationId = this.tenantContext.getOrganizationId();
    const kind = await this.findKind(organizationId);
    if (kind !== 'tethr') {
      throw new ForbiddenError('Platform scope is restricted to the Tethr workspace');
    }
    const access = await this.authorization.getAccessForUserInOrganization(userId, organizationId);
    if (!access.permissions.includes(permission)) {
      throw new ForbiddenError('Missing platform permission');
    }
    return { userId, organizationId, access };
  }

  // The single Tethr workspace (enforced by a partial unique index). Read
  // primitive for the client→Tethr projection; callers guard their own query.
  async resolveTethrOrganizationId(): Promise<OrganizationId> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `select id from organizations where kind = 'tethr' limit 2`,
    );
    if (rows.length === 0) {
      throw new ValidationFailedError('No Tethr workspace is configured');
    }
    if (rows.length > 1) {
      throw new ValidationFailedError('More than one Tethr workspace is configured');
    }
    return toId<OrganizationId>(rows[0].id);
  }

  // Every client workspace on the platform. Read primitive for the operator
  // guard path; never exposed to a client caller.
  async listClientOrganizationIds(): Promise<readonly OrganizationId[]> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `select id from organizations where kind = 'client' order by "createdAt" asc`,
    );
    return rows.map((row) => toId<OrganizationId>(row.id));
  }

  // Runs `work` with the tenant scope pointed at `organizationId` while keeping
  // the caller as the principal. Writes inside work are ordinary tenant-scoped
  // operations in the target workspace — this is how Tethr acts on a client's
  // hiring request without weakening TenantScopedRepository for everyone.
  //
  // The audit record is written BEFORE switching, so it lands in the actor's
  // home workspace with the target named in metadata.
  async switchTo<TResult>(input: PlatformSwitch, work: () => Promise<TResult>): Promise<TResult> {
    const userId = this.tenantContext.getUserId();
    if (!userId) {
      throw new UnauthenticatedError();
    }
    await this.audit.record({
      action: 'platform.switch',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: {
        purpose: input.purpose,
        targetOrganizationId: input.organizationId,
      },
    });
    return this.tenantContext.run({ organizationId: input.organizationId, userId }, work);
  }

  private async findKind(organizationId: OrganizationId): Promise<OrganizationKind | null> {
    const rows = await this.dataSource.query<{ kind: unknown }[]>(
      `select kind from organizations where id = $1`,
      [organizationId],
    );
    const kind = rows[0]?.kind;
    return isOrganizationKind(kind) ? kind : null;
  }
}
