import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  JOBS,
  QUEUES,
  toId,
  type ApplicationOutcome,
  type ApplicationStage,
  type CandidateId,
  type FormId,
  type FormSubmissionId,
  type HiringRequestId,
  type JobPostingId,
  type OrganizationId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { PERMISSIONS } from '../../core/authz/permissions';
import { MessageQueueService } from '../../core/queue/message-queue.service';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { FormSubmission } from '../forms/entities/form-submission.entity';
import { FormsService } from '../forms/forms.service';

import {
  APPLICATION_REPOSITORY,
  CANDIDATE_DOCUMENT_REPOSITORY,
  CANDIDATE_REPOSITORY,
  CV_PARSE_REPOSITORY,
  JOB_POSTING_REPOSITORY,
} from './ats.tokens';
import {
  Application,
} from './entities/application.entity';
import { CandidateDocument } from './entities/candidate-document.entity';
import { Candidate } from './entities/candidate.entity';
import { CvParse } from './entities/cv-parse.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import { JobPosting } from './entities/job-posting.entity';
import { HIRING_REQUEST_REPOSITORY } from './recruitment.tokens';

export type CreateCandidateData = {
  readonly fullName: string;
  readonly email: string;
  readonly phone?: string | null;
  readonly linkedin?: string | null;
  readonly portfolio?: string | null;
  readonly source?: string;
};

export type UpdateApplicationData = {
  readonly applicationId: string;
  readonly stage?: ApplicationStage;
  readonly outcome?: ApplicationOutcome;
  readonly onHold?: boolean;
  readonly holdReason?: string | null;
  readonly manualRating?: number | null;
  readonly notes?: string | null;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'role';

const numeric = (value: string | undefined): string | null => {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
};

// Public submissions are untrusted: values are trimmed and clipped to the
// destination column width so a malformed answer cannot fail the projection
// after the outbox has already retried it.
const bounded = (value: string | undefined, maxLength: number): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const integer = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const currencyCode = (value: string | undefined): string | null => {
  const code = value?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(code) ? code : null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The ATS core: postings, the candidate pool, applications and CV documents.
// Everything lives in the operator's (Tethr's) workspace; client visibility is
// a narrow projection added with shortlists.
@Injectable()
export class AtsService {
  constructor(
    @Inject(JOB_POSTING_REPOSITORY) private readonly postings: TenantScopedRepository<JobPosting>,
    @Inject(CANDIDATE_REPOSITORY) private readonly candidates: TenantScopedRepository<Candidate>,
    @Inject(APPLICATION_REPOSITORY) private readonly applications: TenantScopedRepository<Application>,
    @Inject(CANDIDATE_DOCUMENT_REPOSITORY)
    private readonly candidateDocuments: TenantScopedRepository<CandidateDocument>,
    @Inject(CV_PARSE_REPOSITORY) private readonly cvParses: TenantScopedRepository<CvParse>,
    @Inject(HIRING_REQUEST_REPOSITORY)
    private readonly hiringRequests: TenantScopedRepository<HiringRequest>,
    private readonly forms: FormsService,
    private readonly queue: MessageQueueService,
    private readonly tenantContext: TenantContextService,
    private readonly platformScope: PlatformScopeService,
  ) {}

  // --- Postings -----------------------------------------------------------------

  // One posting per hiring request (re-running returns the existing one). The
  // posting snapshots the request's briefing facts in Tethr's workspace and
  // keeps the client's org id for the projection back-edge. The board publishes
  // client requests by passing their workspace: the request is read there under
  // platform scope, while the posting is still created in the caller's
  // (Tethr's) workspace.
  async publishPostingFromRequest(
    hiringRequestId: HiringRequestId,
    sourceOrganizationId?: OrganizationId | null,
  ): Promise<JobPosting> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (sourceOrganizationId && sourceOrganizationId !== organizationId) {
      await this.platformScope.assertOperator(PERMISSIONS.hiringRequestManage);
      const request = await this.platformScope.switchTo(
        {
          organizationId: sourceOrganizationId,
          purpose: 'hiring request publish',
          resourceType: 'hiring_request',
          resourceId: hiringRequestId,
        },
        () => this.loadRequestForPublish(hiringRequestId),
      );
      return this.createOrReopenPosting(request);
    }
    return this.createOrReopenPosting(await this.loadRequestForPublish(hiringRequestId));
  }

  private async loadRequestForPublish(hiringRequestId: HiringRequestId): Promise<HiringRequest> {
    const request = await this.hiringRequests.findById(hiringRequestId);
    if (!request) {
      throw new NotFoundError('Hiring request not found', { id: hiringRequestId });
    }
    if (request.status === 'filled' || request.status === 'cancelled') {
      throw new ConflictError('A closed request cannot be published');
    }
    return request;
  }

  private async createOrReopenPosting(request: HiringRequest): Promise<JobPosting> {
    const existing = await this.postings.findOne({
      where: { sourceHiringRequestId: request.id },
    });
    const organizationId = this.tenantContext.getOrganizationId();
    const posting = existing
      ? await (async () => {
          existing.isPublished = true;
          existing.postedAt = existing.postedAt ?? new Date();
          return this.postings.save(existing);
        })()
      : await this.postings.save(
          this.postings.create({
            organizationId,
            sourceHiringRequestId: request.id,
            sourceOrganizationId: request.organizationId,
            title: request.positionTitle,
            slug: `${slugify(request.positionTitle)}-${request.id.slice(0, 8)}`,
            description: request.jobDescription,
            salaryMin: request.salaryMin,
            salaryMax: request.salaryMax,
            salaryCurrency: request.salaryCurrency,
            isPublished: true,
            publishSalaryRange: true,
            postedAt: new Date(),
            closesOn: request.targetFillDate,
          }),
        );
    return posting;
  }

  listPostings(): Promise<JobPosting[]> {
    return this.postings.find({ order: { postedAt: 'DESC' } });
  }

  async getPosting(id: JobPostingId): Promise<JobPosting> {
    const posting = await this.postings.findById(id);
    if (!posting) {
      throw new NotFoundError('Job posting not found', { id });
    }
    return posting;
  }

  // The first consumer of the form builder: the standard application form is the
  // posting's form, and the link carries the posting id as its context.
  async applicationFormForPosting(postingId: JobPostingId): Promise<{ formId: FormId; posting: JobPosting }> {
    const posting = await this.getPosting(postingId);
    const form = await this.forms.ensureApplicationForm();
    return { formId: toId<FormId>(form.form.id), posting };
  }

  // --- Candidates ---------------------------------------------------------------

  listCandidates(): Promise<Candidate[]> {
    return this.candidates.find({ order: { createdAt: 'DESC' } });
  }

  async getCandidate(id: CandidateId): Promise<Candidate> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) {
      throw new NotFoundError('Candidate not found', { id });
    }
    return candidate;
  }

  async createCandidate(input: CreateCandidateData): Promise<Candidate> {
    const email = input.email.trim().toLowerCase();
    try {
      return await this.candidates.save(
        this.candidates.create({
          fullName: input.fullName.trim(),
          email,
          phone: input.phone ?? null,
          linkedin: input.linkedin ?? null,
          portfolio: input.portfolio ?? null,
          source: input.source ?? 'manual',
          consentGivenAt: null,
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('A candidate with that email already exists', { email });
      }
      throw error;
    }
  }

  // --- Applications -------------------------------------------------------------

  listApplications(): Promise<Application[]> {
    return this.applications.find({ order: { createdAt: 'DESC' } });
  }

  applicationsForCandidate(candidateId: CandidateId): Promise<Application[]> {
    return this.applications.find({ where: { candidateId }, order: { createdAt: 'DESC' } });
  }

  applicationsForPosting(jobPostingId: JobPostingId): Promise<Application[]> {
    return this.applications.find({ where: { jobPostingId }, order: { createdAt: 'DESC' } });
  }

  // Applications ready for an interview (shortlisted or already interviewing);
  // the schedule picker ranks by the human rating first.
  shortlistReadyApplications(): Promise<Application[]> {
    return this.applications.find({
      where: { stage: In(['shortlisted', 'interviewing']) },
      order: { createdAt: 'DESC' },
    });
  }

  async updateApplication(input: UpdateApplicationData): Promise<Application> {
    const application = await this.applications.findById(input.applicationId);
    if (!application) {
      throw new NotFoundError('Application not found', { id: input.applicationId });
    }
    if (input.stage !== undefined) {
      if (!APPLICATION_STAGES.includes(input.stage)) {
        throw new ValidationFailedError('Unknown application stage', { stage: input.stage });
      }
      application.stage = input.stage;
    }
    if (input.outcome !== undefined) {
      if (!APPLICATION_OUTCOMES.includes(input.outcome)) {
        throw new ValidationFailedError('Unknown application outcome', { outcome: input.outcome });
      }
      application.outcome = input.outcome;
    }
    if (input.onHold !== undefined) {
      application.onHold = input.onHold;
      if (!input.onHold) application.holdReason = null;
    }
    if (input.holdReason !== undefined && application.onHold) {
      application.holdReason = input.holdReason;
    }
    if (input.manualRating !== undefined) {
      if (input.manualRating !== null && (input.manualRating < 1 || input.manualRating > 5)) {
        throw new ValidationFailedError('Rating must be between 1 and 5');
      }
      application.manualRating = input.manualRating;
    }
    if (input.notes !== undefined) {
      application.notes = input.notes;
    }
    return this.applications.save(application);
  }

  // --- Projection: a form submission becomes a candidate + application --------

  // Consumes `form.submitted` (target 'application'). The submission's `mapsTo`
  // fields are projected onto the candidate (the person, latest known) and the
  // application (what was said at submission time), a CandidateDocument records
  // the CV, and a parse job is enqueued for the AI seam.
  async applyFormSubmission(submissionId: FormSubmissionId): Promise<Application | null> {
    const { submission, fields } = await this.forms.getSubmissionForProjection(submissionId);
    const postingRef = typeof submission.metadata.refId === 'string' ? submission.metadata.refId : null;
    if (!postingRef) {
      return null;
    }
    const posting = await this.postings.findById(postingRef);
    if (!posting) {
      return null;
    }
    // A link can outlive the posting it was minted for (form links live for
    // weeks). Record the late application with a reason instead of dropping it
    // silently, and never create a live screening application for a closed role.
    const today = new Date().toISOString().slice(0, 10);
    if (!posting.isPublished) {
      await this.forms.markSubmissionRejected(
        submissionId,
        'The posting is no longer accepting applications',
      );
      return null;
    }
    if (posting.closesOn !== null && posting.closesOn < today) {
      await this.forms.markSubmissionRejected(
        submissionId,
        `The posting closed on ${posting.closesOn}`,
      );
      return null;
    }

    const byMap = new Map<string, string>();
    for (const field of fields) {
      if (!field.mapsTo) continue;
      const answer = submission.answers[field.fieldKey];
      if (answer !== undefined && answer.trim() !== '') {
        byMap.set(field.mapsTo, answer.trim());
      }
    }
    const email = bounded(byMap.get('candidate.email')?.toLowerCase(), 320);
    if (!email || !EMAIL_PATTERN.test(email)) {
      return null;
    }

    // The relay retries a projection that failed part-way; a submission that
    // already produced an application must not produce a second one.
    const alreadyProjected = await this.applications.findOne({
      where: { formSubmissionId: submission.id },
    });
    if (alreadyProjected) {
      await this.ensureResumeRecorded(alreadyProjected.candidateId, submission);
      return alreadyProjected;
    }

    const candidate = await this.findOrCreateCandidate({
      fullName: bounded(byMap.get('candidate.fullName'), 200) ?? email,
      email,
      phone: bounded(byMap.get('candidate.phone'), 64),
      linkedin: bounded(byMap.get('candidate.linkedin'), 320),
      portfolio: bounded(byMap.get('candidate.portfolio'), 320),
    });

    const application = await this.applications.save(
      this.applications.create({
        organizationId: this.tenantContext.getOrganizationId(),
        candidateId: candidate.id,
        jobPostingId: posting.id,
        formSubmissionId: submission.id,
        stage: 'screening',
        outcome: 'active',
        onHold: false,
        holdReason: null,
        expectedSalary: numeric(byMap.get('application.expectedSalary')),
        salaryCurrency: currencyCode(byMap.get('application.salaryCurrency')),
        currentSalary: numeric(byMap.get('application.currentSalary')),
        currentTitle: bounded(byMap.get('application.currentTitle'), 200),
        yearsExperience: integer(byMap.get('application.yearsExperience')),
        location: bounded(byMap.get('application.location'), 200),
        skills: bounded(byMap.get('application.skills'), 20000),
        coverNote: bounded(byMap.get('application.coverNote'), 20000),
        manualRating: null,
        notes: null,
      }),
    );

    await this.ensureResumeRecorded(candidate.id, submission);
    await this.forms.markSubmissionProjected(submissionId, 'application', application.id);
    return application;
  }

  private async ensureResumeRecorded(candidateId: string, submission: FormSubmission): Promise<void> {
    const resume = submission.files.find((file) => file.fieldKey === 'resume');
    if (resume) {
      await this.recordCandidateDocument(candidateId, resume);
    }
  }

  private async findOrCreateCandidate(input: CreateCandidateData): Promise<Candidate> {
    const existing = await this.candidates.findOne({ where: { email: input.email } });
    if (!existing) {
      return this.createCandidate(input);
    }
    // Latest known wins for the person's present-tense facts; application
    // history stays on the application rows.
    existing.fullName = input.fullName || existing.fullName;
    existing.phone = input.phone ?? existing.phone;
    existing.linkedin = input.linkedin ?? existing.linkedin;
    existing.portfolio = input.portfolio ?? existing.portfolio;
    return this.candidates.save(existing);
  }

  private async recordCandidateDocument(
    candidateId: string,
    resume: { storageKey: string; fileName: string; contentType: string; sizeBytes: number },
  ): Promise<void> {
    // Retried projections must not version the same submission's CV twice.
    const alreadyStored = await this.candidateDocuments.findOne({
      where: { candidateId: toId<CandidateId>(candidateId), storageKey: resume.storageKey },
    });
    if (alreadyStored) {
      await this.ensureCvParse(alreadyStored.id);
      return;
    }
    const versions = await this.candidateDocuments.find({
      where: { candidateId: toId<CandidateId>(candidateId), label: 'resume' },
    });
    const nextVersion = versions.reduce((max, doc) => Math.max(max, doc.versionNumber), 0) + 1;
    const document = await this.candidateDocuments.save(
      this.candidateDocuments.create({
        candidateId: toId<CandidateId>(candidateId),
        label: 'resume',
        versionNumber: nextVersion,
        storageKey: resume.storageKey,
        fileName: resume.fileName,
        contentType: resume.contentType,
        sizeBytes: String(resume.sizeBytes),
      }),
    );
    await this.ensureCvParse(document.id);
  }

  // The parse record and the job that fills it are created together and only
  // once per document, so a retried projection cannot queue a duplicate parse.
  private async ensureCvParse(candidateDocumentId: string): Promise<void> {
    const existing = await this.cvParses.findOne({ where: { candidateDocumentId } });
    if (existing) return;
    await this.cvParses.save(
      this.cvParses.create({
        candidateDocumentId,
        status: 'pending',
        extractedText: null,
        structured: {},
        score: null,
        provider: null,
        parsedAt: null,
      }),
    );
    await this.queue.add(QUEUES.default, JOBS.parseCv, {
      organizationId: this.tenantContext.getOrganizationId(),
      candidateDocumentId,
    });
  }

  // Used by the resolver to label applications with their posting.
  async postingsByIds(ids: readonly string[]): Promise<Map<string, JobPosting>> {
    if (ids.length === 0) return new Map();
    const rows = await this.postings.find({ where: { id: In([...ids]) } });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async candidatesByIds(ids: readonly string[]): Promise<Map<string, Candidate>> {
    if (ids.length === 0) return new Map();
    const rows = await this.candidates.find({ where: { id: In([...ids]) } });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async applicationsByIds(ids: readonly string[]): Promise<Map<string, Application>> {
    if (ids.length === 0) return new Map();
    const rows = await this.applications.find({ where: { id: In([...ids]) } });
    return new Map(rows.map((row) => [row.id, row]));
  }

  // Which candidates have at least one CV on file — one query for a whole list.
  async resumePresenceByCandidateIds(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.candidateDocuments.find({
      where: { candidateId: In([...ids]), label: 'resume' },
    });
    return new Set(rows.map((row) => row.candidateId));
  }
}