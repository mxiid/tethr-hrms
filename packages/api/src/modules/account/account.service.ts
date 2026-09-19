import { toId, type ClientId, type EmployeeId, type OrganizationId, type SystemRoleKey, type UserId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ConflictError, UnauthenticatedError, ValidationFailedError } from '../../common/errors';
import { AuthService, type AuthResult } from '../../core/auth/auth.service';
import type { User } from '../../core/auth/user.entity';
import { AuthorizationService, type EffectiveAccess } from '../../core/authz/authz.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { ClientService } from '../clients/client.service';
import type { Client } from '../clients/entities/client.entity';
import type { Organization } from '../organization/entities/organization.entity';
import { OrganizationService } from '../organization/organization.service';

type SignUpData = {
  readonly organizationName: string;
  readonly email: string;
  readonly password: string;
};

type CreateWorkspaceUserData = {
  readonly email: string;
  readonly password: string;
  readonly employeeId?: EmployeeId | null;
  readonly roleKey: SystemRoleKey;
};

type UpdateWorkspaceUserRoleData = {
  readonly userId: UserId;
  // undefined leaves the link untouched; null clears it.
  readonly employeeId?: EmployeeId | null;
  readonly roleKey: SystemRoleKey;
};

// Postgres unique-violation, as surfaced by the pg driver. The users table has
// one unique constraint that callers can hit here — (organizationId, email).
const isUniqueViolation = (cause: unknown): boolean => {
  const driverError = (cause as { readonly driverError?: { readonly code?: string } }).driverError;
  return driverError?.code === '23505';
};

type OnboardClientData = {
  // An existing Client to add this workspace to; omit to found a new Client
  // (named after legalName) alongside it — the common "new company" case.
  readonly clientId?: string | null;
  readonly legalName: string;
  readonly displayName?: string | null;
  readonly defaultLocale?: string | null;
  readonly defaultCurrency?: string | null;
  readonly adminEmail: string;
  readonly adminPassword: string;
  readonly hrAdminEmail: string;
  readonly hrAdminPassword: string;
};

type OnboardClientResult = {
  readonly client: Client;
  readonly workspace: Organization;
  readonly initialAdmin: Awaited<ReturnType<AuthService['createUser']>>;
  readonly initialHrAdmin: Awaited<ReturnType<AuthService['createUser']>>;
};

type LoginOutcome =
  | { readonly kind: 'authenticated'; readonly token: string; readonly user: User; readonly access: EffectiveAccess }
  | {
      readonly kind: 'selectWorkspace';
      readonly selectionToken: string;
      readonly workspaces: readonly { readonly organizationId: string; readonly organizationName: string }[];
    };

// Onboards a new company: create the organization (tenant), then its first admin
// user, then issue a session token. Composes the Organization (modules) and Auth
// (core) published interfaces — it never touches their tables directly, which is
// exactly the cross-bucket pattern the architecture mandates.
@Injectable()
export class AccountService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly clientService: ClientService,
    private readonly authService: AuthService,
    private readonly authorization: AuthorizationService,
    private readonly tenantContext: TenantContextService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // The cap check and the org + admin-user + role writes run in ONE transaction
  // under an advisory lock keyed by the email, so two concurrent signups with
  // the same email can never both found a workspace: the loser waits on the
  // lock, then re-runs the check and conflicts. A failure anywhere rolls back
  // the whole workspace instead of orphaning it (TET-223).
  async signUp(input: SignUpData): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        // Scoped to this transaction: released automatically at commit/rollback.
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);

        // One self-serve workspace per person: being a MEMBER of several
        // workspaces is unrestricted (see createWorkspaceUser); this only caps
        // founding a brand-new one from this public, unauthenticated mutation.
        if (await this.authService.hasCreatedWorkspace(email, manager)) {
          throw new ConflictError(
            "You've already created a workspace with this email. Ask an admin to invite you into another one, or sign in.",
          );
        }

        const organization = await this.organizationService.create(
          { legalName: input.organizationName },
          manager,
        );
        const organizationId = toId<OrganizationId>(organization.id);

        // Create the first admin user inside the new tenant's context. The manager
        // is threaded through so the user + role commit with the organization.
        return this.tenantContext.run({ organizationId, userId: null }, async () => {
          const created = await this.authService.createUser(
            {
              email: input.email,
              password: input.password,
              isWorkspaceCreator: true,
            },
            manager,
          );
          await this.authorization.assignSystemRole(
            toId<UserId>(created.id),
            'clientAdmin',
            manager,
          );
          return created;
        });
      });
    } catch (error) {
      // The advisory lock serializes same-email signups; the users unique index
      // is the last-resort backstop. Never surface a raw 23505 (TET-223).
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "You've already created a workspace with this email. Ask an admin to invite you into another one, or sign in.",
        );
      }
      throw error;
    }

    return { user, token: this.authService.issueToken(user) };
  }

  legalNameIsAlreadyUsed(legalName: string): Promise<boolean> {
    return this.organizationService.legalNameExists(legalName);
  }

  hasCreatedWorkspace(email: string): Promise<boolean> {
    return this.authService.hasCreatedWorkspace(email);
  }

  // Tethr is fully-managed by default (design.md "we handle the rest"): every
  // client org gets its own clientAdmin (view/approve only) AND its own
  // tethrAdmin, seeded together so there is never a window where a newly
  // onboarded client has no Tethr staff able to work inside it. The
  // tethrAdmin here is a plain member of THIS org only — nothing cross-tenant
  // — so a Tethr person supporting several clients holds one such account per
  // org (findVerifiedUsers + the workspace-selection login flow is how they
  // move between them).
  async onboardClient(input: OnboardClientData): Promise<OnboardClientResult> {
    const client = input.clientId
      ? await this.clientService.getById(toId<ClientId>(input.clientId))
      : await this.clientService.create({ name: input.legalName });
    if (!client) {
      throw new ConflictError('Client not found', { clientId: input.clientId });
    }

    const organization = await this.organizationService.create({
      kind: 'client',
      clientId: client.id,
      legalName: input.legalName,
      displayName: input.displayName ?? undefined,
      defaultLocale: input.defaultLocale ?? undefined,
      defaultCurrency: input.defaultCurrency ?? undefined,
    });
    const organizationId = toId<OrganizationId>(organization.id);

    const { initialAdmin, initialHrAdmin } = await this.tenantContext.run(
      { organizationId, userId: null },
      async () => {
        // Only the client-side admin is marked isWorkspaceCreator: this
        // flow is Tethr-staff-driven, so it's never gated by the
        // one-self-serve-workspace cap (see signUp) — but the flag still
        // has to be set here so a later self-serve signUp with this same
        // email is correctly recognized as "already has a workspace."
        const admin = await this.authService.createUser({
          email: input.adminEmail,
          password: input.adminPassword,
          isWorkspaceCreator: true,
        });
        await this.authorization.assignSystemRole(toId<UserId>(admin.id), 'clientAdmin');

        const hrAdmin = await this.authService.createUser({
          email: input.hrAdminEmail,
          password: input.hrAdminPassword,
        });
        await this.authorization.assignSystemRole(toId<UserId>(hrAdmin.id), 'tethrAdmin');

        return { initialAdmin: admin, initialHrAdmin: hrAdmin };
      },
    );

    return { client, workspace: organization, initialAdmin, initialHrAdmin };
  }

  // Orchestrates login across the Auth (core) and Organization (modules)
  // boundaries: verifies credentials against every workspace this email
  // holds an account in, then either logs straight in (the common case) or
  // hands back a short-lived selection token plus the matched workspaces'
  // display names for a picker screen.
  async login(email: string, password: string): Promise<LoginOutcome> {
    const verifiedUsers = await this.authService.findVerifiedUsers(email, password);
    if (verifiedUsers.length === 0) {
      throw new UnauthenticatedError('Invalid email or password');
    }
    if (verifiedUsers.length === 1) {
      const [user] = verifiedUsers;
      const access = await this.authorization.getAccessForUserInOrganization(
        user.id,
        user.organizationId,
      );
      return { kind: 'authenticated', token: this.authService.issueToken(user), user, access };
    }

    const workspaces = await Promise.all(
      verifiedUsers.map(async (user) => {
        const organization = await this.organizationService.getById(
          toId<OrganizationId>(user.organizationId),
        );
        return {
          organizationId: user.organizationId,
          organizationName: organization?.displayName ?? organization?.legalName ?? user.organizationId,
        };
      }),
    );
    return {
      kind: 'selectWorkspace',
      selectionToken: this.authService.issueWorkspaceSelectionToken(
        email,
        verifiedUsers.map((user) => user.organizationId),
      ),
      workspaces,
    };
  }

  // The other workspaces the signed-in user can jump to, with display names.
  // Unlike the login picker this needs no password: the caller already holds a
  // valid session, and every account here shares their email (same person).
  async listSwitchableWorkspaces(): Promise<
    readonly { readonly organizationId: string; readonly organizationName: string }[]
  > {
    const current = await this.authService.getCurrentUser();
    const accounts = await this.authService.findAccountsForEmail(current.email);
    const others = accounts.filter(
      (account) =>
        account.organizationId !== current.organizationId && account.status !== 'disabled',
    );
    return Promise.all(
      others.map(async (account) => {
        const organization = await this.organizationService.getById(
          toId<OrganizationId>(account.organizationId),
        );
        return {
          organizationId: account.organizationId,
          organizationName:
            organization?.displayName ?? organization?.legalName ?? account.organizationId,
        };
      }),
    );
  }

  // Mint a session for another of the caller's workspaces straight from their
  // current session — no password step. Only ever crosses to an account that
  // shares the caller's email; a disabled or non-existent account is refused.
  //
  // Accepted-risk deviation (TET-223): the current session is treated as
  // authority for every same-email workspace, so no password/MFA re-check runs
  // here. The switcher is only offered for accounts that share the caller's
  // email and the target must still be active; the trade-off (and the planned
  // workspace-first login that removes it) is recorded in docs/STATUS.md and
  // the TET-214 follow-up ticket.
  async switchWorkspace(targetOrganizationId: string): Promise<AuthResult> {
    const current = await this.authService.getCurrentUser();
    const accounts = await this.authService.findAccountsForEmail(current.email);
    const target = accounts.find(
      (account) =>
        account.organizationId === targetOrganizationId && account.status !== 'disabled',
    );
    if (!target) {
      throw new UnauthenticatedError('You do not have an account in that workspace');
    }
    return { user: target, token: this.authService.issueToken(target) };
  }

  // Provision a login for an employee/member in the CURRENT tenant. The
  // employee link is validated by the caller (EmployeeLinkGuard) before it
  // reaches here; the user row and its role assignment commit together, so a
  // failure cannot leave a role-less login holding the unique
  // (organizationId, email) slot. The unique index is the race backstop and
  // surfaces as a domain conflict instead of a raw 500 (TET-216).
  async createWorkspaceUser(input: CreateWorkspaceUserData): Promise<User> {
    const organizationId = this.tenantContext.getOrganizationId();
    try {
      return await this.dataSource.transaction((manager) =>
        this.tenantContext.run({ organizationId, userId: null }, async () => {
          const created = await this.authService.createUser(
            {
              email: input.email,
              password: input.password,
              employeeId: input.employeeId ?? null,
            },
            manager,
          );
          await this.authorization.assignSystemRole(
            toId<UserId>(created.id),
            input.roleKey,
            manager,
          );
          return created;
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('A login already exists for that email in this workspace', {
          email: input.email,
        });
      }
      throw error;
    }
  }

  // Change a workspace user's role and (optionally) their employee link. The
  // link is validated by the caller before it reaches here.
  async updateWorkspaceUserRole(input: UpdateWorkspaceUserRoleData): Promise<User> {
    let user = await this.authService.getUserById(input.userId);
    if (input.employeeId !== undefined) {
      user = await this.authService.updateUserEmployeeLink(input.userId, input.employeeId);
    }
    if (input.roleKey === 'employee' && !user.employeeId) {
      throw new ValidationFailedError(
        'employeeId is required before assigning employee access',
      );
    }
    await this.authorization.replaceSystemRole(toId<UserId>(user.id), input.roleKey);
    return user;
  }
}
