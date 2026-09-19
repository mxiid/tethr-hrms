import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuthorizationService } from '../authz/authz.service';
import { PERMISSIONS } from '../authz/permissions';
import { Public } from '../authz/public.decorator';
import { RequirePermissions } from '../authz/require-permissions.decorator';

import { AuthService } from './auth.service';
import { AuthPayload } from './dto/auth-payload.output';
import { CurrentUserView, toCurrentUserView } from './dto/current-user.output';
import { SelectWorkspaceInput } from './dto/select-workspace.input';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly authorization: AuthorizationService,
  ) {}

  // Redeems the short-lived token from a multi-workspace login (AccountService)
  // for a real session, once the user has picked which workspace to enter.
  @Mutation(() => AuthPayload)
  @Public()
  async selectWorkspace(@Args('input') input: SelectWorkspaceInput): Promise<AuthPayload> {
    const user = await this.authService.resolveWorkspaceSelection(
      input.selectionToken,
      input.organizationId,
    );
    const access = await this.authorization.getAccessForUserInOrganization(
      user.id,
      user.organizationId,
    );
    return { token: this.authService.issueToken(user), user: toCurrentUserView(user, access) };
  }

  @Query(() => CurrentUserView)
  @Public()
  async me(): Promise<CurrentUserView> {
    const user = await this.authService.getCurrentUser();
    return toCurrentUserView(user, await this.authorization.getCurrentAccess());
  }

  @Query(() => Boolean)
  @Public()
  async hasOtherWorkspaces(): Promise<boolean> {
    return this.authService.hasOtherWorkspaces();
  }

  @Query(() => [CurrentUserView])
  @RequirePermissions(PERMISSIONS.userManage)
  async workspaceUsers(): Promise<CurrentUserView[]> {
    const users = await this.authService.listUsers();
    return Promise.all(
      users.map(async (user) =>
        toCurrentUserView(
          user,
          await this.authorization.getAccessForUserInOrganization(user.id, user.organizationId),
        ),
      ),
    );
  }

  @Query(() => [String])
  @RequirePermissions(PERMISSIONS.userManage)
  async assignableWorkspaceRoles(): Promise<string[]> {
    return [...(await this.authorization.listAssignableSystemRoleKeys())];
  }
}
