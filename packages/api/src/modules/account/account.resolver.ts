import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuthPayload } from '../../core/auth/dto/auth-payload.output';
import { toCurrentUserView } from '../../core/auth/dto/current-user.output';
import { LoginInput } from '../../core/auth/dto/login.input';
import { AuthorizationService } from '../../core/authz/authz.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';
import { toClientView } from '../clients/dto/client.output';
import { toWorkspaceSummaryView } from '../organization/dto/workspace-summary.output';

import { AccountService } from './account.service';
import { OnboardClientPayload } from './dto/client-workspace.output';
import { LoginResult, WorkspaceOption } from './dto/login-result.output';
import { OnboardClientInput } from './dto/onboard-client.input';
import { SignUpInput } from './dto/sign-up.input';

@Resolver()
export class AccountResolver {
  constructor(
    private readonly accountService: AccountService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Mutation(() => AuthPayload)
  async signUp(@Args('input') input: SignUpInput): Promise<AuthPayload> {
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
  async login(@Args('input') input: LoginInput): Promise<LoginResult> {
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
  legalNameIsAlreadyUsed(@Args('legalName') legalName: string): Promise<boolean> {
    return this.accountService.legalNameIsAlreadyUsed(legalName);
  }

  // Public precheck for the one-self-serve-workspace-per-person cap: has
  // this email already founded a workspace (as opposed to merely being a
  // member of one)? Same boolean-only trust boundary as the two checks above.
  @Query(() => Boolean)
  hasCreatedWorkspace(@Args('email') email: string): Promise<boolean> {
    return this.accountService.hasCreatedWorkspace(email);
  }

  @Mutation(() => OnboardClientPayload)
  @UseGuards(PermissionsGuard)
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
}
