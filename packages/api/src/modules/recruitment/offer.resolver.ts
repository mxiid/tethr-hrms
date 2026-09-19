import { toId, type UserId } from '@hrms/shared';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuthService } from '../../core/auth/auth.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import {
  CreateOfferInput,
  DeclineOfferInput,
  OfferIdInput,
} from './dto/offer.inputs';
import { AcceptedOfferView, OfferView } from './dto/offer.outputs';
import { OfferService, type OfferRecord } from './offer.service';

@Resolver(() => OfferView)
export class OfferResolver {
  constructor(
    private readonly offerService: OfferService,
    private readonly authService: AuthService,
  ) {}

  @Query(() => [OfferView])
  @RequirePermissions(PERMISSIONS.candidateRead)
  async offers(): Promise<OfferView[]> {
    return (await this.offerService.listOffers()).map((record) => this.toView(record));
  }

  @Mutation(() => OfferView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async createOffer(@Args('input') input: CreateOfferInput): Promise<OfferView> {
    const record = await this.offerService.createOffer({
      applicationId: input.applicationId,
      baseSalary: input.baseSalary,
      salaryCurrency: input.salaryCurrency,
      startDate: input.startDate,
      probationDays: input.probationDays ?? null,
      noticePeriodDays: input.noticePeriodDays ?? null,
      extras: input.extras ?? [],
      notes: input.notes ?? null,
    });
    return this.toView(record);
  }

  @Mutation(() => OfferView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async sendOffer(@Args('input') input: OfferIdInput): Promise<OfferView> {
    return this.toView(await this.offerService.send(input.offerId));
  }

  @Mutation(() => OfferView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async withdrawOffer(@Args('input') input: OfferIdInput): Promise<OfferView> {
    return this.toView(await this.offerService.withdraw(input.offerId));
  }

  @Mutation(() => OfferView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async declineOffer(@Args('input') input: DeclineOfferInput): Promise<OfferView> {
    return this.toView(await this.offerService.decline(input.offerId, input.note ?? null));
  }

  @Mutation(() => AcceptedOfferView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async acceptOffer(@Args('input') input: OfferIdInput): Promise<AcceptedOfferView> {
    const user = await this.authService.getCurrentUser();
    const accepted = await this.offerService.accept(input.offerId, toId<UserId>(user.id));
    return { offer: this.toView(accepted), employeeId: accepted.employeeId };
  }

  private toView(record: OfferRecord): OfferView {
    return {
      id: record.offer.id,
      applicationId: record.offer.applicationId,
      candidateName: record.candidate?.fullName ?? 'Candidate',
      jobPostingTitle: record.posting?.title ?? 'Unknown role',
      baseSalary: Number(record.offer.baseSalary),
      salaryCurrency: record.offer.salaryCurrency,
      startDate: record.offer.startDate,
      probationDays: record.offer.probationDays,
      noticePeriodDays: record.offer.noticePeriodDays,
      extras: record.offer.extras.map((extra) => ({ label: extra.label, value: extra.value })),
      status: record.offer.status,
      sentAt: record.offer.sentAt?.toISOString() ?? null,
      respondedAt: record.offer.respondedAt?.toISOString() ?? null,
      hiredEmployeeId: record.offer.hiredEmployeeId,
      notes: record.offer.notes,
    };
  }
}
