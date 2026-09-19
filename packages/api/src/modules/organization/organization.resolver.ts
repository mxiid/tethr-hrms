import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../common/errors';
import { PERMISSIONS } from '../../core/authz/permissions';
import { Public } from '../../core/authz/public.decorator';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';

import { MyOrganizationView } from './dto/my-organization.output';
import { UpdateBrandColorInput } from './dto/update-brand-color.input';
import type { Organization } from './entities/organization.entity';
import { OrganizationService } from './organization.service';

const toMyOrganizationView = (organization: Organization): MyOrganizationView => ({
  id: organization.id,
  legalName: organization.legalName,
  displayName: organization.displayName,
  brandColor: organization.brandColor,
});

// Every signed-in user can read their own workspace's name/color (it's the
// shell chrome everyone sees); only organizationManage can change it.
@Resolver()
export class OrganizationResolver {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Query(() => MyOrganizationView)
  @Public()
  async myOrganization(): Promise<MyOrganizationView> {
    const organization = await this.organizationService.getById(
      this.tenantContext.getOrganizationId(),
    );
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    return toMyOrganizationView(organization);
  }

  @Mutation(() => MyOrganizationView)
  @RequirePermissions(PERMISSIONS.organizationManage)
  async updateMyOrganizationBrandColor(
    @Args('input') input: UpdateBrandColorInput,
  ): Promise<MyOrganizationView> {
    const organization = await this.organizationService.updateBrandColor(
      this.tenantContext.getOrganizationId(),
      input.brandColor,
    );
    return toMyOrganizationView(organization);
  }
}
