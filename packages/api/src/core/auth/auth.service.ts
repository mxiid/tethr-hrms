import { toId, type EmployeeId, type UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { NotFoundError, UnauthenticatedError } from '../../common/errors';
import { AuthorizationService } from '../authz/authz.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantScopedRepository } from '../tenancy/tenant-scoped.repository';

import { USER_REPOSITORY } from './auth.tokens';
import type { JwtClaims, WorkspaceSelectionClaims } from './jwt-claims';
import { PasswordService } from './password.service';
import { User } from './user.entity';

// Short enough that a stale "pick a workspace" screen can't be used as a
// lingering credential; long enough for a human to actually pick one.
const WORKSPACE_SELECTION_TOKEN_TTL = '5m';

type CreateUserData = {
  readonly email: string;
  readonly password: string;
  readonly employeeId?: EmployeeId | null;
  readonly isWorkspaceCreator?: boolean;
};

export type AuthResult = { readonly user: User; readonly token: string };

// Authentication boundary (User ≠ Employee, non-negotiable #6). Issues stateless
// JWTs; the middleware turns a token back into tenant + principal context.
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: TenantScopedRepository<User>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly jwtService: JwtService,
    private readonly tenantContext: TenantContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  // Create a user in the CURRENT tenant context (the caller establishes it).
  // A caller that owns a wider transaction (signUp) passes its manager so the
  // user commits with the organization and role assignment.
  async createUser(input: CreateUserData, manager?: EntityManager): Promise<User> {
    const passwordHash = await this.passwords.hash(input.password);
    const user = this.users.create({
      email: input.email.toLowerCase(),
      passwordHash,
      status: 'active',
      mfaEnabled: false,
      employeeId: input.employeeId ?? null,
      isWorkspaceCreator: input.isWorkspaceCreator ?? false,
    });
    if (manager) {
      return manager.save(user);
    }
    return this.users.save(user);
  }

  listUsers(): Promise<User[]> {
    return this.users.find({ order: { email: 'ASC' } });
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundError('User not found', { id });
    }
    return user;
  }

  async updateUserEmployeeLink(userId: UserId, employeeId: EmployeeId | null): Promise<User> {
    const user = await this.getUserById(userId);
    user.employeeId = employeeId;
    return this.users.save(user);
  }

  // Email is unique per organization, not globally — the same person can hold
  // a distinct account (and password) in every workspace they belong to. This
  // lookup is intentionally NOT tenant-scoped: at login no tenant is known
  // yet, and finding every candidate is the whole point. It's the one
  // legitimate cross-tenant read (the auth boundary); nothing past it ever
  // spans organizations. Zero, one, or many rows may verify.
  async findVerifiedUsers(email: string, password: string): Promise<User[]> {
    const candidates = await this.userRepository.find({
      where: { email: email.toLowerCase() } as FindOptionsWhere<User>,
    });
    const verified: User[] = [];
    for (const candidate of candidates) {
      if (candidate.status === 'disabled') continue;
      if (await this.passwords.verify(password, candidate.passwordHash)) {
        verified.push(candidate);
      }
    }
    return verified;
  }

  // Every account for an email, across every workspace. Same cross-tenant
  // trust boundary as findVerifiedUsers / hasOtherWorkspaces — this one backs
  // the in-app workspace switcher, which trusts the caller's current valid
  // session instead of re-checking a password (each account can hold its own
  // password, but they're the same person, so a live session for one is taken
  // as authority to enter another).
  async findAccountsForEmail(email: string): Promise<User[]> {
    return this.userRepository.find({
      where: { email: email.toLowerCase() } as FindOptionsWhere<User>,
    });
  }

  // Public-facing precheck for signup: does any workspace already have an
  // account for this email? Deliberately returns only a boolean — never org
  // names or a count — so an unauthenticated caller can't enumerate which
  // companies exist or who's registered where.
  async emailIsAlreadyRegistered(email: string): Promise<boolean> {
    const count = await this.userRepository.count({
      where: { email: email.toLowerCase() } as FindOptionsWhere<User>,
    });
    return count > 0;
  }

  // Same cross-tenant lookup, same trust boundary (boolean-only, no org
  // names) as emailIsAlreadyRegistered — but a narrower question: has this
  // email specifically FOUNDED a workspace before, not just joined one as an
  // invited member. Backs the one-self-serve-workspace-per-person cap.
  // A caller inside its own transaction (signUp, behind the email advisory
  // lock) passes the manager so the count sees the same snapshot as its writes.
  async hasCreatedWorkspace(email: string, manager?: EntityManager): Promise<boolean> {
    const where = {
      email: email.toLowerCase(),
      isWorkspaceCreator: true,
    } as FindOptionsWhere<User>;
    const count = manager
      ? await manager.count(User, { where })
      : await this.userRepository.count({ where });
    return count > 0;
  }

  issueToken(user: User): string {
    const claims: JwtClaims = {
      sub: user.id,
      org: user.organizationId,
      email: user.email,
      ver: user.tokenVersion ?? 0,
    };
    return this.jwtService.sign(claims);
  }

  // Resolves the user behind a session token, enforcing existence, tenant
  // match, active status, and the session epoch in one read. Memoized on the
  // request, so the session guard and the authorization path share it. Returns
  // null (never throws) so the caller decides how the rejection surfaces.
  async resolveActiveSession(
    userId: UserId,
    organizationId: string,
    tokenVersion: number | undefined,
  ): Promise<User | null> {
    const user = await this.tenantContext.memo(`session-user:${userId}`, () =>
      this.userRepository.findOne({ where: { id: userId } as FindOptionsWhere<User> }),
    );
    if (
      !user ||
      user.organizationId !== organizationId ||
      user.status !== 'active' ||
      (user.tokenVersion ?? 0) !== (tokenVersion ?? 0)
    ) {
      return null;
    }
    return user;
  }

  // Stands in for a session token while the caller picks which of several
  // verified workspaces to enter. Binds the exact org ids that already passed
  // a password check at login, so redeeming it never re-touches credentials.
  issueWorkspaceSelectionToken(email: string, organizationIds: readonly string[]): string {
    const claims: WorkspaceSelectionClaims = {
      type: 'workspace-selection',
      email: email.toLowerCase(),
      organizationIds,
    };
    return this.jwtService.sign(claims, { expiresIn: WORKSPACE_SELECTION_TOKEN_TTL });
  }

  async resolveWorkspaceSelection(selectionToken: string, organizationId: string): Promise<User> {
    let claims: WorkspaceSelectionClaims;
    try {
      claims = this.jwtService.verify<WorkspaceSelectionClaims>(selectionToken);
    } catch {
      throw new UnauthenticatedError('This workspace selection has expired');
    }
    if (claims.type !== 'workspace-selection' || !claims.organizationIds.includes(organizationId)) {
      throw new UnauthenticatedError('That workspace was not part of this sign-in');
    }
    const user = await this.userRepository.findOne({
      where: { email: claims.email, organizationId } as FindOptionsWhere<User>,
    });
    if (!user || user.status === 'disabled') {
      throw new UnauthenticatedError('That workspace was not part of this sign-in');
    }
    return user;
  }

  // The authenticated user, from the principal the middleware set from the JWT.
  async getCurrentUser(): Promise<User> {
    const userId = this.tenantContext.getUserId();
    if (!userId) {
      throw new UnauthenticatedError();
    }
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthenticatedError();
    }
    return user;
  }

  // Powers the header's workspace switcher: is it worth showing at all? Unlike
  // emailIsAlreadyRegistered (unauthenticated, boolean-only, never org names —
  // see that method) this is scoped to the CALLER'S OWN email, so confirming
  // "yes, you have other accounts" leaks nothing beyond what they already
  // know. It still never reveals which orgs or their names — that only ever
  // comes from re-verifying a password via login (findVerifiedUsers), so an
  // org with a different password is never confirmed to exist either way.
  async hasOtherWorkspaces(): Promise<boolean> {
    const current = await this.getCurrentUser();
    const count = await this.userRepository.count({
      where: { email: current.email } as FindOptionsWhere<User>,
    });
    return count > 1;
  }

  // Disable any login linked to an employee, revoke its role assignments, and
  // bump the session epoch so every outstanding token is rejected on its next
  // use. Naturally idempotent (re-running is harmless), which makes it safe as
  // an event-driven side effect (plan.md §5.2).
  // The `employee.terminated` consumer passes its transaction manager so the
  // disable commits with the idempotency ledger row; without one this opens its
  // own transaction so the three writes can never half-apply.
  async disableUsersForEmployee(employeeId: EmployeeId, manager?: EntityManager): Promise<number> {
    if (manager) {
      return this.disableUsersWithin(manager, employeeId);
    }
    return this.dataSource.transaction((transactionManager) =>
      this.disableUsersWithin(transactionManager, employeeId),
    );
  }

  private async disableUsersWithin(
    manager: EntityManager,
    employeeId: EmployeeId,
  ): Promise<number> {
    const organizationId = this.tenantContext.getOrganizationId();
    const users = await manager.find(User, {
      where: { organizationId, employeeId } as FindOptionsWhere<User>,
    });
    let disabledCount = 0;
    for (const user of users) {
      if (user.status === 'disabled') continue;
      user.status = 'disabled';
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      await manager.save(user);
      await this.authorization.removeAllRolesForUser(toId<UserId>(user.id), manager);
      disabledCount += 1;
    }
    return disabledCount;
  }
}
