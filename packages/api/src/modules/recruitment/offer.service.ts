import { toId, type HiringRequestId, type OrganizationId, type UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
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
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
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
    const saved = await this.offers.save(offer);
    // Sending is the moment the pipeline reaches the offer stage; a draft was
    // internal. The stage is never rolled back — decline/withdraw only end the
    // outcome, leaving the reached stage as history.
    await this.moveApplicationStage(saved.applicationId, 'offer');
    return this.compose(saved);
  }

  async withdraw(offerId: string): Promise<OfferRecord> {
    const offer = await this.getById(offerId);
    if (offer.status !== 'draft' && offer.status !== 'sent') {
      throw new ConflictError('Only a draft or sent offer can be withdrawn');
    }
    offer.status = 'withdrawn';
    offer.respondedAt = new Date();
    const saved = await this.offers.save(offer);
    // The company pulled the offer: the application ends rejected.
    await this.closeApplication(saved.applicationId, 'rejected');
    return this.compose(saved);
  }

  async decline(offerId: string, note?: string | null): Promise<OfferRecord> {
    const offer = await this.getById(offerId);
    if (offer.status !== 'sent') {
      throw new ConflictError('Only a sent offer can be declined');
    }
    offer.status = 'declined';
    offer.respondedAt = new Date();
    if (note) offer.notes = note;
    const saved = await this.offers.save(offer);
    // The candidate said no: the application ends withdrawn, not rejected.
    await this.closeApplication(saved.applicationId, 'withdrawn');
    return this.compose(saved);
  }

  // Stage moves follow the offer facts, so the pipeline is never left claiming
  // an application is interviewing after it has reached the offer.
  private async moveApplicationStage(applicationId: string, stage: 'offer'): Promise<void> {
    const application = await this.applications.findById(applicationId);
    if (application && application.stage !== 'hired' && application.stage !== stage) {
      application.stage = stage;
      await this.applications.save(application);
    }
  }

  // Terminal sub-stage facts end the application once: only an active, un-hired
  // application is touched, so a later retry or a second decline is a no-op.
  private async closeApplication(
    applicationId: string,
    outcome: 'withdrawn' | 'rejected',
  ): Promise<void> {
    const application = await this.applications.findById(applicationId);
    if (application && application.outcome === 'active' && application.stage !== 'hired') {
      application.outcome = outcome;
      await this.applications.save(application);
    }
  }

  // Acceptance hires: employee in the client's workspace, application hired,
  // posting closed, position filled, request filled — all in one transaction.
  // The offer row is locked and re-checked first, so two concurrent acceptances
  // cannot both pass the status check; a failure anywhere rolls the whole hire
  // back and leaves the offer `sent` for a retry.
  async accept(offerId: string, hiredByUserId: UserId): Promise<AcceptedOffer> {
    await this.platformScope.assertOperator(PERMISSIONS.candidateManage);
    const organizationId = this.tenantContext.getOrganizationId();

    const accepted = await this.dataSource.transaction(async (manager) => {
      const offer = await manager.findOne(Offer, {
        where: { id: offerId, organizationId } as FindOptionsWhere<Offer>,
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) {
        throw new NotFoundError('Offer not found', { id: offerId });
      }
      if (offer.status !== 'sent') {
        throw new ConflictError('Only a sent offer can be accepted');
      }
      const application = await manager.findOne(Application, {
        where: { id: offer.applicationId, organizationId } as FindOptionsWhere<Application>,
      });
      if (!application) {
        throw new NotFoundError('Application not found', { id: offer.applicationId });
      }
      const [candidate, posting] = await Promise.all([
        manager.findOne(Candidate, {
          where: { id: application.candidateId, organizationId } as FindOptionsWhere<Candidate>,
        }),
        manager.findOne(JobPosting, {
          where: { id: application.jobPostingId, organizationId } as FindOptionsWhere<JobPosting>,
        }),
      ]);
      if (!candidate || !posting) {
        throw new NotFoundError('The offer’s candidate or posting is missing');
      }
      const clientOrganizationId = toId<OrganizationId>(posting.sourceOrganizationId);

      // The employee lands in the client's workspace, inside this transaction.
      const employee = await this.platformScope.switchTo(
        {
          organizationId: clientOrganizationId,
          purpose: 'offer acceptance hires the candidate',
          resourceType: 'offer',
          resourceId: offer.id,
        },
        () => this.hireEmployee(candidate, posting.title, offer, manager),
        manager,
      );

      offer.status = 'accepted';
      offer.respondedAt = new Date();
      offer.hiredEmployeeId = employee.id;
      await manager.save(offer);

      application.stage = 'hired';
      application.outcome = 'hired';
      await manager.save(application);

      posting.isPublished = false;
      await manager.save(posting);

      // The client-side artefacts: hiring request and position, in the same
      // transaction. `updateHiringRequest` joins this manager (it skips its own
      // position sync when one is supplied).
      await this.platformScope.switchTo(
        {
          organizationId: clientOrganizationId,
          purpose: 'offer acceptance closes the requisition',
          resourceType: 'offer',
          resourceId: offer.id,
        },
        async () => {
          await this.recruitment.updateHiringRequest({
            hiringRequestId: toId<HiringRequestId>(posting.sourceHiringRequestId),
            status: 'filled',
            tethrNote: `Filled — ${candidate.fullName} accepted the offer.`,
            updatedByUserId: hiredByUserId,
            actor: 'tethr',
            manager,
          });
          const position = await this.positions.ensureByTitle(posting.title, manager);
          await this.positions.setStatus(position.id, 'filled', manager);
        },
        manager,
      );

      return {
        offer,
        application,
        candidate,
        posting,
        employeeId: employee.id,
      };
    });

    return {
      offer: accepted.offer,
      application: accepted.application,
      candidate: accepted.candidate,
      posting: accepted.posting,
      employeeId: accepted.employeeId,
    };
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
    manager: EntityManager,
  ): Promise<{ id: string }> {
    const fullName = candidate.fullName.trim();
    const lastSpace = fullName.lastIndexOf(' ');
    const firstName = lastSpace === -1 ? fullName : fullName.slice(0, lastSpace);
    const lastName = lastSpace === -1 ? fullName : fullName.slice(lastSpace + 1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = `${Date.now().toString().slice(-6)}${attempt === 0 ? '' : attempt}`;
      try {
        // Each attempt is a savepoint: a unique violation aborts the ambient
        // Postgres transaction, so the retry needs a rollback target.
        return await manager.transaction((inner) =>
          this.employees.create(
            {
              employeeNumber: `EMP-${suffix}`,
              firstName,
              lastName,
              workEmail: candidate.email,
              roleTitle,
              hireDate: offer.startDate,
              noticePeriodDays: offer.noticePeriodDays,
              workerType: 'permanent',
            },
            inner,
          ),
        );
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
