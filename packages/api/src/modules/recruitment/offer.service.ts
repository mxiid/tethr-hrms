import { toId, type HiringRequestId, type OrganizationId, type UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeService } from '../employee/employee.service';
import { PositionService } from '../position/position.service';

import { APPLICATION_REPOSITORY, CANDIDATE_REPOSITORY, JOB_POSTING_REPOSITORY, OFFER_REPOSITORY } from './ats.tokens';
import { Application } from './entities/application.entity';
import { Candidate } from './entities/candidate.entity';
import { JobPosting } from './entities/job-posting.entity';
import { Offer } from './entities/offer.entity';
import { RecruitmentService } from './recruitment.service';

export type CreateOfferData = {
  readonly applicationId: string;
  readonly baseSalary: number;
  readonly salaryCurrency: string;
  readonly startDate: string;
  readonly probationDays?: number | null;
  readonly noticePeriodDays?: number | null;
  readonly extras?: readonly { readonly label: string; readonly value: string }[];
  readonly notes?: string | null;
};

export type OfferRecord = {
  readonly offer: Offer;
  readonly application: Application;
  readonly candidate: Candidate | null;
  readonly posting: JobPosting | null;
};

export type AcceptedOffer = OfferRecord & { readonly employeeId: string };

// Offers and the hire. Acceptance creates the employee through the existing
// EmployeeService — but in the CLIENT's workspace (the posting's source), which
// is exactly the deliberate cross-tenant write the platform scope exists for.
@Injectable()
export class OfferService {
  constructor(
    @Inject(OFFER_REPOSITORY) private readonly offers: TenantScopedRepository<Offer>,
    @Inject(APPLICATION_REPOSITORY)
    private readonly applications: TenantScopedRepository<Application>,
    @Inject(CANDIDATE_REPOSITORY) private readonly candidates: TenantScopedRepository<Candidate>,
    @Inject(JOB_POSTING_REPOSITORY) private readonly postings: TenantScopedRepository<JobPosting>,
    private readonly employees: EmployeeService,
    private readonly positions: PositionService,
    private readonly recruitment: RecruitmentService,
    private readonly platformScope: PlatformScopeService,
  ) {}

  async createOffer(input: CreateOfferData): Promise<OfferRecord> {
    const application = await this.applications.findById(input.applicationId);
    if (!application) {
      throw new NotFoundError('Application not found', { id: input.applicationId });
    }
    const existing = await this.offers.find({ where: { applicationId: input.applicationId } });
    if (existing.some((offer) => offer.status === 'draft' || offer.status === 'sent')) {
      throw new ConflictError('This application already has an active offer');
    }
    if (input.baseSalary <= 0) {
      throw new ValidationFailedError('Base salary must be positive');
    }
    const offer = await this.offers.save(
      this.offers.create({
        applicationId: input.applicationId,
        baseSalary: input.baseSalary.toFixed(2),
        salaryCurrency: input.salaryCurrency.toUpperCase(),
        startDate: input.startDate,
        probationDays: input.probationDays ?? null,
        noticePeriodDays: input.noticePeriodDays ?? null,
        extras: [...(input.extras ?? [])],
        status: 'draft',
        sentAt: null,
        respondedAt: null,
        hiredEmployeeId: null,
        notes: input.notes ?? null,
      }),
    );
    return this.compose(offer);
  }

  async send(offerId: string): Promise<OfferRecord> {
    const offer = await this.getById(offerId);
    if (offer.status !== 'draft') {
      throw new ConflictError('Only a draft offer can be sent');
    }
    offer.status = 'sent';
    offer.sentAt = new Date();
    return this.compose(await this.offers.save(offer));
  }

  async withdraw(offerId: string): Promise<OfferRecord> {
    const offer = await this.getById(offerId);
    if (offer.status !== 'draft' && offer.status !== 'sent') {
      throw new ConflictError('Only a draft or sent offer can be withdrawn');
    }
    offer.status = 'withdrawn';
    offer.respondedAt = new Date();
    return this.compose(await this.offers.save(offer));
  }

  async decline(offerId: string, note?: string | null): Promise<OfferRecord> {
    const offer = await this.getById(offerId);
    if (offer.status !== 'sent') {
      throw new ConflictError('Only a sent offer can be declined');
    }
    offer.status = 'declined';
    offer.respondedAt = new Date();
    if (note) offer.notes = note;
    return this.compose(await this.offers.save(offer));
  }

  // Acceptance hires: employee in the client's workspace, application hired,
  // posting closed, position filled, request filled. The offer stores the new
  // employee id so the hire traces all the way back.
  async accept(offerId: string, hiredByUserId: UserId): Promise<AcceptedOffer> {
    const offer = await this.getById(offerId);
    if (offer.status !== 'sent') {
      throw new ConflictError('Only a sent offer can be accepted');
    }
    const record = await this.compose(offer);
    if (!record.candidate || !record.posting) {
      throw new NotFoundError('The offer’s candidate or posting is missing');
    }
    await this.platformScope.assertOperator(PERMISSIONS.candidateManage);
    const clientOrganizationId = toId<OrganizationId>(record.posting.sourceOrganizationId);
    const candidate = record.candidate;
    const posting = record.posting;

    const employee = await this.platformScope.switchTo(
      {
        organizationId: clientOrganizationId,
        purpose: 'offer acceptance hires the candidate',
        resourceType: 'offer',
        resourceId: offer.id,
      },
      () => this.hireEmployee(candidate, posting.title, offer),
    );

    offer.status = 'accepted';
    offer.respondedAt = new Date();
    offer.hiredEmployeeId = employee.id;
    const saved = await this.offers.save(offer);

    // The application is hired; the posting stops accepting applicants.
    record.application.stage = 'hired';
    record.application.outcome = 'hired';
    await this.applications.save(record.application);
    posting.isPublished = false;
    await this.postings.save(posting);

    // Close the client-side artefacts: the position and the hiring request.
    await this.recruitment.updateHiringRequest({
      hiringRequestId: toId<HiringRequestId>(posting.sourceHiringRequestId),
      status: 'filled',
      tethrNote: `Filled — ${candidate.fullName} accepted the offer.`,
      updatedByUserId: hiredByUserId,
      actor: 'tethr',
      sourceOrganizationId: clientOrganizationId,
    });
    const position = await this.platformScope.switchTo(
      {
        organizationId: clientOrganizationId,
        purpose: 'offer acceptance fills the position',
        resourceType: 'offer',
        resourceId: offer.id,
      },
      () => this.positions.ensureByTitle(posting.title),
    );
    await this.platformScope.switchTo(
      {
        organizationId: clientOrganizationId,
        purpose: 'offer acceptance fills the position',
        resourceType: 'offer',
        resourceId: offer.id,
      },
      () => this.positions.setStatus(position.id, 'filled'),
    );

    return { ...(await this.compose(saved)), employeeId: employee.id };
  }

  async listOffers(): Promise<OfferRecord[]> {
    const offers = await this.offers.find({ order: { createdAt: 'DESC' } });
    const records: OfferRecord[] = [];
    for (const offer of offers) {
      records.push(await this.compose(offer));
    }
    return records;
  }

  private async getById(offerId: string): Promise<Offer> {
    const offer = await this.offers.findById(offerId);
    if (!offer) {
      throw new NotFoundError('Offer not found', { id: offerId });
    }
    return offer;
  }

  // Employee numbers are unique per workspace; the timestamp suffix can repeat,
  // so a collision (23505) retries with a distinct number rather than failing
  // the hire after the employee write.
  private async hireEmployee(
    candidate: Candidate,
    roleTitle: string,
    offer: Offer,
  ): Promise<{ id: string }> {
    const fullName = candidate.fullName.trim();
    const lastSpace = fullName.lastIndexOf(' ');
    const firstName = lastSpace === -1 ? fullName : fullName.slice(0, lastSpace);
    const lastName = lastSpace === -1 ? fullName : fullName.slice(lastSpace + 1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = `${Date.now().toString().slice(-6)}${attempt === 0 ? '' : attempt}`;
      try {
        return await this.employees.create({
          employeeNumber: `EMP-${suffix}`,
          firstName,
          lastName,
          workEmail: candidate.email,
          roleTitle,
          hireDate: offer.startDate,
          noticePeriodDays: offer.noticePeriodDays,
          workerType: 'permanent',
        });
      } catch (error) {
        if ((error as { code?: string }).code !== '23505' || attempt === 4) {
          throw error;
        }
      }
    }
    throw new ConflictError('Could not allocate a unique employee number');
  }

  private async compose(offer: Offer): Promise<OfferRecord> {
    const application = await this.applications.findById(offer.applicationId);
    if (!application) {
      throw new NotFoundError('Application not found', { id: offer.applicationId });
    }
    const [candidate, posting] = await Promise.all([
      this.candidates.findById(application.candidateId),
      this.postings.findById(application.jobPostingId),
    ]);
    return { offer, application, candidate, posting };
  }
}
