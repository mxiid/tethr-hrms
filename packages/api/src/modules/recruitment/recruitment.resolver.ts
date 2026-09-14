import {
  toId,
  type HiringRequestId,
  type HiringRequestPriority,
  type HiringRequestStatus,
  type OrganizationId,
  type UserId,
} from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuthService } from '../../core/auth/auth.service';
import { AuthorizationService } from '../../core/authz/authz.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import { CreateHiringRequestInput } from './dto/create-hiring-request.input';
import { HiringRequestUpdateView } from './dto/hiring-request-update.output';
import { ClientHiringRequestView, HiringRequestView } from './dto/hiring-request.output';
import { UpdateHiringRequestInput } from './dto/update-hiring-request.input';
import { HiringRequestUpdate } from './entities/hiring-request-update.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import {
  RecruitmentService,
  type ClientHiringRequestRecord,
  type HiringRequestRecord,
} from './recruitment.service';

// Clients see their own requests; Tethr-internal notes never cross that line —
// neither the single `tethrNote` field nor the note text on tethr-authored
// trail entries.
type ViewAudience = { readonly forClient: boolean };

const toHiringRequestUpdateView = (
  update: HiringRequestUpdate,
  audience: ViewAudience,
): HiringRequestUpdateView => ({
  id: update.id,
  hiringRequestId: update.hiringRequestId,
  status: update.status,
  actor: update.actor,
  note: audience.forClient && update.actor === 'tethr' ? null : update.note,
  createdByUserId: update.createdByUserId,
  createdAt: update.createdAt.toISOString(),
});

const toHiringRequestView = (
  request: HiringRequest,
  updates: readonly HiringRequestUpdate[] = [],
  audience: ViewAudience = { forClient: false },
): HiringRequestView => ({
  id: request.id,
  positionTitle: request.positionTitle,
  jobDescription: request.jobDescription,
  headcount: request.headcount,
  employmentType: request.employmentType,
  location: request.location,
  preferredStartDate: request.preferredStartDate,
  targetFillDate: request.targetFillDate,
  salaryMin: request.salaryMin === null ? null : Number(request.salaryMin),
  salaryMax: request.salaryMax === null ? null : Number(request.salaryMax),
  salaryCurrency: request.salaryCurrency,
  hiringManagerEmployeeId: request.hiringManagerEmployeeId,
  reportsToEmployeeId: request.reportsToEmployeeId,
  priority: request.priority,
  positionId: request.positionId,
  clientNote: request.clientNote,
  tethrNote: audience.forClient ? null : request.tethrNote,
  status: request.status,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
  updates: updates.map((update) => toHiringRequestUpdateView(update, audience)),
});

const toHiringRequestRecordView = (
  record: HiringRequestRecord,
  audience: ViewAudience,
): HiringRequestView => toHiringRequestView(record.request, record.updates, audience);

@Resolver(() => HiringRequestView)
export class RecruitmentResolver {
  constructor(
    private readonly recruitmentService: RecruitmentService,
    private readonly authService: AuthService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Query(() => [HiringRequestView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.hiringRequestRead)
  async hiringRequests(): Promise<HiringRequestView[]> {
    const audience = { forClient: await this.isClientCaller() };
    return (await this.recruitmentService.listHiringRequests()).map((record) =>
      toHiringRequestRecordView(record, audience),
    );
  }

  // The platform board: every client workspace plus Tethr's own. The service
  // enforces kind + platform:read-all; the guard here is the permission half.
  @Query(() => [ClientHiringRequestView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.platformReadAll)
  async clientHiringRequests(): Promise<ClientHiringRequestView[]> {
    const records: ClientHiringRequestRecord[] =
      await this.recruitmentService.listClientHiringRequests();
    return records.map((record) => ({
      ...toHiringRequestRecordView(record, { forClient: false }),
      organizationId: record.organizationId,
      organizationName: record.organizationName,
    }));
  }

  @Mutation(() => HiringRequestView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.hiringRequestWrite)
  async createHiringRequest(
    @Args('input') input: CreateHiringRequestInput,
  ): Promise<HiringRequestView> {
    const user = await this.authService.getCurrentUser();
    // Attribute the trail to the portal that raised it: clients submit for
    // their own workspace, Tethr staff can raise a request on their behalf.
    const access = await this.authorization.getAccessForUserInOrganization(
      user.id,
      user.organizationId,
    );
    const request = await this.recruitmentService.createHiringRequest({
      positionTitle: input.positionTitle,
      jobDescription: input.jobDescription ?? null,
      headcount: input.headcount,
      employmentType: input.employmentType,
      location: input.location ?? null,
      preferredStartDate: input.preferredStartDate ?? null,
      targetFillDate: input.targetFillDate ?? null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: input.salaryCurrency ?? null,
      hiringManagerEmployeeId: input.hiringManagerEmployeeId ?? null,
      reportsToEmployeeId: input.reportsToEmployeeId ?? null,
      priority: input.priority as HiringRequestPriority | undefined,
      clientNote: input.clientNote ?? null,
      requestedByUserId: toId<UserId>(user.id),
      actor: access.portal === 'client' ? 'client' : 'tethr',
    });
    return toHiringRequestView(request);
  }

  @Mutation(() => HiringRequestView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.hiringRequestManage)
  async updateHiringRequest(
    @Args('input') input: UpdateHiringRequestInput,
  ): Promise<HiringRequestView> {
    const user = await this.authService.getCurrentUser();
    const access = await this.authorization.getAccessForUserInOrganization(
      user.id,
      user.organizationId,
    );
    const request = await this.recruitmentService.updateHiringRequest({
      hiringRequestId: toId<HiringRequestId>(input.hiringRequestId),
      status: input.status as HiringRequestStatus,
      tethrNote: input.tethrNote,
      updatedByUserId: toId<UserId>(user.id),
      actor: access.portal === 'client' ? 'client' : 'tethr',
      sourceOrganizationId: input.organizationId
        ? toId<OrganizationId>(input.organizationId)
        : null,
    });
    return toHiringRequestView(request);
  }

  private async isClientCaller(): Promise<boolean> {
    const user = await this.authService.getCurrentUser();
    const access = await this.authorization.getAccessForUserInOrganization(
      user.id,
      user.organizationId,
    );
    return access.portal === 'client';
  }
}
