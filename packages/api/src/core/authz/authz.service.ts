import {
  toId,
  type OrganizationId,
  type PortalKind,
  type RoleId,
  type SystemRoleKey,
  type UserId,
} from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';

import { ForbiddenError, UnauthenticatedError } from '../../common/errors';
import { User } from '../auth/user.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { type Permission } from './permissions';
import { Role } from './role.entity';
import { portalForRoleKeys, SYSTEM_ROLES } from './system-roles';
import { UserRoleAssignment } from './user-role-assignment.entity';

export type EffectiveAccess = {
  readonly roleKeys: readonly string[];
  readonly permissions: readonly Permission[];
  readonly portal: PortalKind;
};

// Resolves role assignments into the effective access used by both GraphQL
// guards and the frontend portal selector. Reads are explicitly organization
// scoped because this is the core authorization ownership boundary.
@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(UserRoleAssignment)
    private readonly assignments: Repository<UserRoleAssignment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getCurrentAccess(): Promise<EffectiveAccess> {
    const userId = this.tenantContext.getUserId();
    if (!userId) {
      throw new UnauthenticatedError();
    }
    if (!(await this.activeUser(userId))) {
      throw new UnauthenticatedError('Your session is no longer valid. Please sign in again.');
    }
    return this.getAccessForUserInOrganization(userId, this.tenantContext.getOrganizationId());
  }

  // Resolves access for one user in one organization. A user that is missing or
  // no longer active resolves to empty access — the session path rejects it as
  // unauthenticated (SessionGuard/getCurrentAccess), while admin listings can
  // still render disabled accounts without breaking.
  async getAccessForUserInOrganization(
    userId: UserId | string,
    organizationId: OrganizationId | string,
  ): Promise<EffectiveAccess> {
    const scopedUserId = toId<UserId>(userId);
    const scopedOrganizationId = toId<OrganizationId>(organizationId);
    if (!(await this.activeUser(scopedUserId))) {
      return { roleKeys: [], permissions: [], portal: 'none' };
    }
    const assignments = await this.assignments.find({
      where: { userId: scopedUserId, organizationId: scopedOrganizationId },
    });
    if (assignments.length === 0) {
      return { roleKeys: [], permissions: [], portal: 'none' };
    }

    const roles = await this.roles.find({
      where: {
        organizationId: scopedOrganizationId,
        id: In(assignments.map((assignment) => assignment.roleId)),
      },
    });
    const roleKeys = roles.flatMap((role) => (role.key ? [role.key] : []));
    const permissions = [...new Set(roles.flatMap((role) => role.permissions))] as Permission[];
    return { roleKeys, permissions, portal: portalForRoleKeys(roleKeys) };
  }

  // A caller that owns a wider transaction (signUp) passes its manager so the
  // role assignment commits with the organization and user.
  async assignSystemRole(
    userId: UserId,
    roleKey: SystemRoleKey,
    manager?: EntityManager,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const role = await this.ensureSystemRole(organizationId, roleKey, manager);
    const repository = manager ? manager.getRepository(UserRoleAssignment) : this.assignments;
    const existing = await repository.findOne({
      where: { organizationId, userId, roleId: toId<RoleId>(role.id) },
    });
    if (existing) return;

    await repository.save(
      repository.create({ organizationId, userId, roleId: toId<RoleId>(role.id) }),
    );
  }

  async replaceSystemRole(userId: UserId, roleKey: SystemRoleKey): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const role = await this.ensureSystemRole(organizationId, roleKey);
    const systemRoles = await this.roles.find({
      where: { organizationId, key: In(Object.keys(SYSTEM_ROLES)) },
    });
    const systemRoleIds = systemRoles.map((systemRole) => toId<RoleId>(systemRole.id));
    if (systemRoleIds.length > 0) {
      await this.assignments.delete({
        organizationId,
        userId,
        roleId: In(systemRoleIds),
      });
    }
    await this.assignments.save(
      this.assignments.create({ organizationId, userId, roleId: toId<RoleId>(role.id) }),
    );
  }

  // Revoke every role assignment a user holds in the current tenant. Used when
  // a login is disabled (termination), in the same transaction as the status
  // change, so no role row can outlive the account.
  async removeAllRolesForUser(userId: UserId, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repository = manager ? manager.getRepository(UserRoleAssignment) : this.assignments;
    await repository.delete({ organizationId, userId });
  }

  async assertCurrentUserCanAssign(roleKey: SystemRoleKey): Promise<void> {
    if ((await this.listAssignableSystemRoleKeys()).includes(roleKey)) return;
    throw new ForbiddenError('Your role cannot assign that workspace role');
  }

  async listAssignableSystemRoleKeys(): Promise<readonly SystemRoleKey[]> {
    const access = await this.getCurrentAccess();
    if (access.roleKeys.includes('tethrAdmin')) {
      return Object.keys(SYSTEM_ROLES) as SystemRoleKey[];
    }
    if (access.roleKeys.includes('clientAdmin')) {
      return ['clientMember', 'employee'];
    }
    return [];
  }

  // One user read per request (memoized): the SessionGuard warms this key, so
  // authorization reuses the same row instead of querying again per call.
  private async activeUser(userId: UserId): Promise<User | null> {
    const user = await this.tenantContext.memo(`session-user:${userId}`, () =>
      this.users.findOne({ where: { id: userId } }),
    );
    if (!user || user.status !== 'active') {
      return null;
    }
    return user;
  }

  private async ensureSystemRole(
    organizationId: OrganizationId,
    roleKey: SystemRoleKey,
    manager?: EntityManager,
  ): Promise<Role> {
    const repository = manager ? manager.getRepository(Role) : this.roles;
    const existing = await repository.findOne({ where: { organizationId, key: roleKey } });
    if (existing) return existing;

    const definition = SYSTEM_ROLES[roleKey];
    return repository.save(
      repository.create({
        organizationId,
        key: definition.key,
        name: definition.name,
        permissions: [...definition.permissions],
        dataScope: definition.dataScope,
      }),
    );
  }
}
