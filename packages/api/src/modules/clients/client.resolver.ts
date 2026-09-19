import { Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import { PERMISSIONS } from '../../core/authz/permissions';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';
import { toWorkspaceSummaryView, WorkspaceSummaryView } from '../organization/dto/workspace-summary.output';
import { OrganizationService } from '../organization/organization.service';

import { ClientService } from './client.service';
import { ClientView, toClientView } from './dto/client.output';

// Clients only exist for Tethr: every operation here is gated behind
// client:manage (today: tethrAdmin) — the same guard onboardClient already
// uses, moved to live alongside the entity it actually owns.
@Resolver(() => ClientView)
@RequirePermissions(PERMISSIONS.clientManage)
export class ClientResolver {
  constructor(
    private readonly clientService: ClientService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Query(() => [ClientView])
  async clients(): Promise<ClientView[]> {
    return (await this.clientService.list()).map(toClientView);
  }

  @ResolveField(() => [WorkspaceSummaryView])
  async workspaces(@Parent() client: ClientView): Promise<WorkspaceSummaryView[]> {
    const organizations = await this.organizationService.findByClientId(client.id);
    return organizations.map(toWorkspaceSummaryView);
  }
}
