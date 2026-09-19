import { toId, type EmployeeId, type SystemRoleKey, type UserId } from '@hrms/shared';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { ValidationFailedError } from '../../common/errors';
import { AuthPayload } from '../../core/auth/dto/auth-payload.output';
import { toCurrentUserView, CurrentUserView } from '../../core/auth/dto/current-user.output';
import { LoginInput } from '../../core/auth/dto/login.input';
import { AuthorizationService } from '../../core/authz/authz.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { Public } from '../../core/authz/public.decorator';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';
import { ConfigService } from '../../core/config/config.service';
import { RateLimiterService } from '../../core/security/rate-limiter.service';
import { toClientView } from '../clients/dto/client.output';
import { toWorkspaceSummaryView } from '../organization/dto/workspace-summary.output';

import { AccountService } from './account.service';
import { OnboardClientPayload } from './dto/client-workspace.output';
import { CreateWorkspaceUserInput } from './dto/create-workspace-user.input';
import { LoginResult, WorkspaceOption } from './dto/login-result.output';
import { OnboardClientInput } from './dto/onboard-client.input';
import { SignUpInput } from './dto/sign-up.input';
import { UpdateWorkspaceUserRoleInput } from './dto/update-workspace-user-role.input';
import { EmployeeLinkGuard } from './employee-link-guard.service';

type GraphqlContext = {
  readonly req?: {
    readonly ip?: string;
    readonly socket?: { readonly remoteAddress?: string };
  };
};

const clientAddress = (context: GraphqlContext): string =>
  context.req?.ip ?? context.req?.socket?.remoteAddress ?? 'unknown';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

@Resolver()
export class AccountResolver {
  constructor(
    private readonly accountService: AccountService,
    private readonly authorization: AuthorizationService,
    private readonly employeeLinkGuard: EmployeeLinkGuard,
    private readonly rateLimiter: RateLimiterService,
    private readonly config: ConfigService,
  ) {}

  @Mutation(() => AuthPayload)
  @Public()
  async signUp(
    @Args('input') input: SignUpInput,
    @Context() context: GraphqlContext,
  ): Promise<AuthPayload> {
    // Signup is anonymous and expensive (org + scrypt + rows): throttle per IP.
    this.rateLimiter.consume(
      `signup:${clientAddress(context)}`,
      this.config.get('AUTH_SIGNUP_LIMIT_PER_10_MIN'),
      RATE_LIMIT_WINDOW_MS,
    );
    const { user, token } = await this.accountService.signUp({
      organizationName: input.organizationName,
      email: input.email,
      password: input.password,
    });
    const access = await this.authorization.getAccessForUserInOrganization(
      user.id,
      user.organizationId,
    );
    return { token, user: toCurrentUserView(user, access) };
  }

  // Lives here (not core/auth) because a multi-workspace match needs each
  // candidate organization's display name for the picker — an Organization
  // (modules) read that core is not allowed to depend on.
  @Mutation(() => LoginResult)
  @Public()
  async login(
    @Args('input') input: LoginInput,
    @Context() context: GraphqlContext,
  ): Promise<LoginResult> {
    // Throttled per email+IP: bounds both brute force and the scrypt work a
    // caller can demand (TET-214).
    this.rateLimiter.consume(
      `login:${input.email.toLowerCase()}:${clientAddress(context)}`,
      this.config.get('AUTH_LOGIN_LIMIT_PER_10_MIN'),
      RATE_LIMIT_WINDOW_MS,
      'Too many sign-in attempts — please try again later.',
    );
    const outcome = await this.accountService.login(input.email, input.password);
    if (outcome.kind === 'authenticated') {
      return {
        token: outcome.token,
        user: toCurrentUserView(outcome.user, outcome.access),
        workspaceSelectionToken: null,
        workspaces: null,
      };
    }
    return {
      token: null,
      user: null,
      workspaceSelectionToken: outcome.selectionToken,
      workspaces: outcome.workspaces.map((workspace) => ({ ...workspace })),
    };
  }

  // Public precheck, same trust boundary as signUp/login: workspace names ARE
  // unique now, so this predicts the real create()-time check exactly.
  @Query(() => Boolean)
  @Public()
  legalNameIsAlreadyUsed(@Args('legalName') legalName: string): Promise<boolean> {
    return this.accountService.legalNameIsAlreadyUsed(legalName);
  }

  // Public precheck for the one-self-serve-workspace-per-person cap: has
  // this email already founded a workspace (as opposed to merely being a
  // member of one)? Same boolean-only trust boundary as the two checks above.
  @Query(() => Boolean)
  @Public()
  hasCreatedWorkspace(@Args('email') email: string): Promise<boolean> {
    return this.accountService.hasCreatedWorkspace(email);
  }

  @Mutation(() => OnboardClientPayload)
  @RequirePermissions(PERMISSIONS.clientManage)
  async onboardClient(@Args('input') input: OnboardClientInput): Promise<OnboardClientPayload> {
    const { client, workspace, initialAdmin, initialHrAdmin } =
      await this.accountService.onboardClient({
        clientId: input.clientId ?? null,
        legalName: input.legalName,
        displayName: input.displayName ?? null,
        defaultLocale: input.defaultLocale ?? null,
        defaultCurrency: input.defaultCurrency ?? null,
        adminEmail: input.adminEmail,
        adminPassword: input.adminPassword,
        hrAdminEmail: input.hrAdminEmail,
        hrAdminPassword: input.hrAdminPassword,
      });
    const [adminAccess, hrAdminAccess] = await Promise.all([
      this.authorization.getAccessForUserInOrganization(initialAdmin.id, initialAdmin.organizationId),
      this.authorization.getAccessForUserInOrganization(
        initialHrAdmin.id,
        initialHrAdmin.organizationId,
      ),
    ]);
    return {
      client: toClientView(client),
      workspace: toWorkspaceSummaryView(workspace),
      initialAdmin: toCurrentUserView(initialAdmin, adminAccess),
      initialHrAdmin: toCurrentUserView(initialHrAdmin, hrAdminAccess),
    };
  }

  // The signed-in user's other workspaces, for the header switcher. Needs a
  // session (getCurrentUser throws without one) but no extra permission — a
  // user may always see and enter their own accounts.
  @Query(() => [WorkspaceOption])
  @Public()
  async switchableWorkspaces(): Promise<WorkspaceOption[]> {
    const workspaces = await this.accountService.listSwitchableWorkspaces();
    return workspaces.map((workspace) => ({
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName,
    }));
  }

  // Enter another of the caller's workspaces without re-entering a password —
  // the current valid session is the authority (see AccountService).
  @Mutation(() => AuthPayload)
  @Public()
  async switchWorkspace(
    @Args('organizationId', { type: () => ID }) organizationId: string,
  ): Promise<AuthPayload> {
    const { user, token } = await this.accountService.switchWorkspace(organizationId);
    const access = await this.authorization.getAccessForUserInOrganization(
      user.id,
      user.organizationId,
    );
    return { token, user: toCurrentUserView(user, access) };
  }

  // Workspace-user administration lives here (not core/auth) so the employee
  // link can be resolved through the employee module's published interface —
  // a modules read core is not allowed to make. The link is verified to belong
  // to the CALLER'S tenant before it is stored (TET-216), so an account can
  // never point at another workspace's employee.
  @Mutation(() => CurrentUserView)
  @RequirePermissions(PERMISSIONS.userManage)
  async createWorkspaceUser(
    @Args('input') input: CreateWorkspaceUserInput,
  ): Promise<CurrentUserView> {
    const roleKey = input.roleKey as SystemRoleKey;
    await this.authorization.assertCurrentUserCanAssign(roleKey);
    if (roleKey === 'employee' && !input.employeeId) {
      throw new ValidationFailedError('employeeId is required when creating an employee account');
    }
    if (input.employeeId) {
      await this.employeeLinkGuard.assertEmployeeInTenant(input.employeeId);
    }
    const user = await this.accountService.createWorkspaceUser({
      email: input.email,
      password: input.password,
      employeeId: input.employeeId ? toId<EmployeeId>(input.employeeId) : null,
      roleKey,
    });
    return toCurrentUserView(
      user,
      await this.authorization.getAccessForUserInOrganization(user.id, user.organizationId),
    );
  }

  @Mutation(() => CurrentUserView)
  @RequirePermissions(PERMISSIONS.userManage)
  async updateWorkspaceUserRole(
    @Args('input') input: UpdateWorkspaceUserRoleInput,
  ): Promise<CurrentUserView> {
    const roleKey = input.roleKey as SystemRoleKey;
    await this.authorization.assertCurrentUserCanAssign(roleKey);
    if (input.employeeId) {
      await this.employeeLinkGuard.assertEmployeeInTenant(input.employeeId);
    }
    const user = await this.accountService.updateWorkspaceUserRole({
      userId: toId<UserId>(input.userId),
      employeeId:
        input.employeeId === undefined
          ? undefined
          : input.employeeId
            ? toId<EmployeeId>(input.employeeId)
            : null,
      roleKey,
    });
    return toCurrentUserView(
      user,
      await this.authorization.getAccessForUserInOrganization(user.id, user.organizationId),
    );
  }
}
