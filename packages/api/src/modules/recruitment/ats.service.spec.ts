import {
  toId,
  type FormId,
  type FormSubmissionId,
  type HiringRequestId,
  type OrganizationId,
} from '@hrms/shared';

import type { AuditService } from '../../core/audit/audit.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import type { MessageQueueService } from '../../core/queue/message-queue.service';
import type { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { FormsService } from '../forms/forms.service';

import { AtsService } from './ats.service';
import type { Application } from './entities/application.entity';
import type { CandidateDocument } from './entities/candidate-document.entity';
import { Candidate } from './entities/candidate.entity';
import type { CvParse } from './entities/cv-parse.entity';
import type { HiringRequest } from './entities/hiring-request.entity';
import type { JobPosting } from './entities/job-posting.entity';

const ORGANIZATION = 'org-1';
const POSTING = 'posting-1';
const SUBMISSION = toId<FormSubmissionId>('submission-1');
const REQUEST = toId<HiringRequestId>('request-1');

const posting = {
  id: POSTING,
  organizationId: ORGANIZATION,
  sourceHiringRequestId: REQUEST,
  title: 'Senior developer',
  isPublished: true,
} as unknown as JobPosting;

const buildService = (options: { request?: HiringRequest | null } = {}) => {
  const jobPostings = {
    findOne: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(posting),
    find: jest.fn().mockResolvedValue([posting]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve({ id: POSTING, ...(value as object) })),
  } as unknown as TenantScopedRepository<JobPosting>;
  const candidates = {
    findOne: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) =>
      Promise.resolve({ id: 'candidate-1', createdAt: new Date(), ...(value as object) }),
    ),
  } as unknown as TenantScopedRepository<Candidate>;
  const applications = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve({ id: 'application-1', ...(value as object) })),
    findById: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<Application>;
  const documents = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve({ id: 'document-1', ...(value as object) })),
  } as unknown as TenantScopedRepository<CandidateDocument>;
  const cvParses = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve({ id: 'parse-1', ...(value as object) })),
  } as unknown as TenantScopedRepository<CvParse>;
  const hiringRequests = {
    findById: jest.fn().mockResolvedValue(options.request ?? null),
  } as unknown as TenantScopedRepository<HiringRequest>;
  const forms = {
    getSubmissionForProjection: jest.fn().mockResolvedValue({
      submission: {
        id: SUBMISSION,
        formId: toId<FormId>('form-1'),
        answers: {
          fullName: 'Ada Lovelace',
          email: 'ADA@example.com',
          currentTitle: 'Staff Engineer',
          expectedSalary: '120000',
          yearsOfExperience: '9',
          coverNote: 'Hello',
        },
        files: [
          {
            fieldKey: 'resume',
            storageKey: 'form-submissions/form-1/cv.pdf',
            fileName: 'cv.pdf',
            contentType: 'application/pdf',
            sizeBytes: 2048,
          },
        ],
        metadata: { refId: POSTING },
      },
      fields: [
        { fieldKey: 'fullName', mapsTo: 'candidate.fullName' },
        { fieldKey: 'email', mapsTo: 'candidate.email' },
        { fieldKey: 'currentTitle', mapsTo: 'application.currentTitle' },
        { fieldKey: 'expectedSalary', mapsTo: 'application.expectedSalary' },
        { fieldKey: 'yearsOfExperience', mapsTo: 'application.yearsExperience' },
        { fieldKey: 'coverNote', mapsTo: 'application.coverNote' },
      ],
    }),
    markSubmissionProjected: jest.fn().mockResolvedValue(undefined),
  } as unknown as FormsService;
  const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as MessageQueueService;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORGANIZATION),
  } as unknown as TenantContextService;
  const platformScope = {
    assertOperator: jest.fn().mockResolvedValue({
      userId: 'user-1',
      organizationId: ORGANIZATION,
      access: { roleKeys: ['tethrHr'], permissions: [], portal: 'tethr' },
    }),
    switchTo: jest.fn((_input: unknown, work: () => Promise<unknown>) => work()),
  } as unknown as PlatformScopeService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  return {
    service: new AtsService(
      jobPostings,
      candidates,
      applications,
      documents,
      cvParses,
      hiringRequests,
      forms,
      queue,
      tenantContext,
      platformScope,
      audit,
    ),
    jobPostings,
    candidates,
    applications,
    documents,
    cvParses,
    forms,
    queue,
    platformScope,
    audit,
  };
};

describe('AtsService', () => {
  it('projects an application submission into a candidate, application, CV document and parse job', async () => {
    const { service, candidates, applications, documents, cvParses, forms, queue } = buildService();

    const application = await service.applyFormSubmission(SUBMISSION);

    expect(application).not.toBeNull();
    expect(candidates.create).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Ada Lovelace', email: 'ada@example.com' }),
    );
    expect(applications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        jobPostingId: POSTING,
        formSubmissionId: SUBMISSION,
        expectedSalary: '120000.00',
        yearsExperience: 9,
        currentTitle: 'Staff Engineer',
      }),
    );
    expect(documents.save).toHaveBeenCalled();
    expect(cvParses.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(queue.add).toHaveBeenCalledWith(
      'hrms-default',
      'parse-cv',
      expect.objectContaining({ candidateDocumentId: 'document-1' }),
    );
    expect(forms.markSubmissionProjected).toHaveBeenCalledWith(SUBMISSION, 'application', 'application-1');
  });

  it('ignores a submission with no posting context', async () => {
    const { service, forms } = buildService();
    (forms.getSubmissionForProjection as jest.Mock).mockResolvedValue({
      submission: { id: SUBMISSION, answers: {}, files: [], metadata: {} },
      fields: [],
    });

    await expect(service.applyFormSubmission(SUBMISSION)).resolves.toBeNull();
  });

  it('reuses an existing candidate by email', async () => {
    const { service, candidates } = buildService();
    (candidates.findOne as jest.Mock).mockResolvedValue({
      id: 'candidate-1',
      fullName: 'Old Name',
      email: 'ada@example.com',
      phone: '123',
      linkedin: null,
      portfolio: null,
      source: 'form',
    });

    await service.applyFormSubmission(SUBMISSION);

    expect(candidates.create).not.toHaveBeenCalled();
    expect(candidates.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'candidate-1', fullName: 'Ada Lovelace' }),
    );
  });

  it('validates application updates', async () => {
    const { service, applications } = buildService();
    (applications.findById as jest.Mock).mockResolvedValue({
      id: 'application-1',
      stage: 'screening',
      outcome: 'active',
      onHold: false,
    });

    await expect(
      service.updateApplication({ applicationId: 'application-1', manualRating: 9 }),
    ).rejects.toThrow('Rating must be between 1 and 5');
    await expect(
      service.updateApplication({
        applicationId: 'application-1',
        stage: 'nonsense' as never,
      }),
    ).rejects.toThrow('Unknown application stage');
  });

  it('refuses to publish a closed request', async () => {
    const { service } = buildService({
      request: {
        id: REQUEST,
        organizationId: ORGANIZATION,
        positionTitle: 'Senior developer',
        status: 'filled',
      } as unknown as HiringRequest,
    });

    await expect(service.publishPostingFromRequest(REQUEST)).rejects.toThrow(
      'A closed request cannot be published',
    );
  });

  it('reads a client request under platform scope when publishing from the board', async () => {
    const clientOrganization = toId<OrganizationId>('org-client');
    const { service, platformScope } = buildService({
      request: {
        id: REQUEST,
        organizationId: clientOrganization,
        positionTitle: 'Senior developer',
        status: 'open',
      } as unknown as HiringRequest,
    });

    await service.publishPostingFromRequest(REQUEST, clientOrganization);

    expect(platformScope.assertOperator).toHaveBeenCalledWith(PERMISSIONS.hiringRequestManage);
    expect(platformScope.switchTo).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: clientOrganization }),
      expect.any(Function),
    );
  });

  it('does not create a second application when a retried projection finds one', async () => {
    const { service, applications } = buildService();
    (applications.findOne as jest.Mock).mockResolvedValue({
      id: 'application-1',
      candidateId: 'candidate-1',
    });

    const result = await service.applyFormSubmission(SUBMISSION);

    expect(result).toMatchObject({ id: 'application-1' });
    expect(applications.create).not.toHaveBeenCalled();
  });

  it('normalizes untrusted projection values instead of failing the write', async () => {
    const { service, applications, forms } = buildService();
    (forms.getSubmissionForProjection as jest.Mock).mockResolvedValue({
      submission: {
        id: SUBMISSION,
        formId: toId<FormId>('form-1'),
        answers: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
          currentTitle: 'x'.repeat(500),
          yearsOfExperience: 'nine',
          salaryCurrency: 'dollars',
        },
        files: [],
        metadata: { refId: POSTING },
      },
      fields: [
        { fieldKey: 'fullName', mapsTo: 'candidate.fullName' },
        { fieldKey: 'email', mapsTo: 'candidate.email' },
        { fieldKey: 'currentTitle', mapsTo: 'application.currentTitle' },
        { fieldKey: 'yearsOfExperience', mapsTo: 'application.yearsExperience' },
        { fieldKey: 'salaryCurrency', mapsTo: 'application.salaryCurrency' },
      ],
    });

    await service.applyFormSubmission(SUBMISSION);

    expect(applications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTitle: 'x'.repeat(200),
        yearsExperience: null,
        salaryCurrency: null,
      }),
    );
  });
});

describe('AtsService posting lifecycle', () => {
  it('unpublishes a live posting and audits it', async () => {
    const { service, jobPostings, audit } = buildService();

    const saved = await service.unpublishPosting(POSTING as never);

    expect(jobPostings.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: POSTING, isPublished: false }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unpublish', resourceId: POSTING }),
    );
    expect(saved.isPublished).toBe(false);
  });

  it('leaves an already unpublished posting alone', async () => {
    const { service, jobPostings } = buildService();
    (jobPostings.findById as jest.Mock).mockResolvedValue({ ...posting, isPublished: false });

    await service.unpublishPosting(POSTING as never);

    expect(jobPostings.save).not.toHaveBeenCalled();
  });

  it('finds the posting born from a request', async () => {
    const { service, jobPostings } = buildService();
    (jobPostings.findOne as jest.Mock).mockResolvedValue(posting);

    await expect(service.getPostingForRequest(REQUEST)).resolves.toBe(posting);
  });
});
