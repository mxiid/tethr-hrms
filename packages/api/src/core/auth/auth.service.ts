import type { EmployeeId, UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindOptionsWhere } from 'typeorm';

import { NotFoundError, UnauthenticatedError } from '../../common/errors';
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
    private readonly passwords: PasswordService,
    private readonly jwtService: JwtService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Create a user in the CURRENT tenant context (the caller establishes it).
  async createUser(input: CreateUserData): Promise<User> {
    const passwordHash = await this.passwords.hash(input.password);
    const user = this.users.create({
      email: input.email.toLowerCase(),
      passwordHash,
      status: 'active',
      mfaEnabled: false,
      employeeId: input.employeeId ?? null,
      isWorkspaceCreator: input.isWorkspaceCreator ?? false,
    });
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
  async hasCreatedWorkspace(email: string): Promise<boolean> {
    const count = await this.userRepository.count({
      where: { email: email.toLowerCase(), isWorkspaceCreator: true } as FindOptionsWhere<User>,
    });
    return count > 0;
  }

  issueToken(user: User): string {
    const claims: JwtClaims = { sub: user.id, org: user.organizationId, email: user.email };
    return this.jwtService.sign(claims);
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
    if (!user) {
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

  // Disable any login linked to an employee. Naturally idempotent (re-running is
  // harmless), which makes it safe as an event-driven side effect (plan.md §5.2).
  async disableUsersForEmployee(employeeId: EmployeeId): Promise<number> {
    const users = await this.users.find({ where: { employeeId } as FindOptionsWhere<User> });
    let disabledCount = 0;
    for (const user of users) {
      if (user.status !== 'disabled') {
        user.status = 'disabled';
        await this.users.save(user);
        disabledCount += 1;
      }
    }
    return disabledCount;
  }
}
