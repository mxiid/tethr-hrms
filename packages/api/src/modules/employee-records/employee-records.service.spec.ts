import {
  toId,
  type DocumentId,
  type EmployeeAssessmentId,
  type EmployeeDocumentLinkId,
  type EmployeeId,
  type EmployeeOnboardingTaskKey,
  type OrganizationId,
  type UserId,
} from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import type { AuditService } from '../../core/audit/audit.service';
import type {
  Document,
  DocumentRecord,
  DocumentService,
  DocumentVersion,
} from '../../core/documents';
import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { WorkflowService } from '../../core/workflow';
import type { EmployeeDirectoryService, EmployeeService } from '../employee';

import { EmployeeRecordsService } from './employee-records.service';
import type { EmployeeAssessment } from './entities/employee-assessment.entity';
import type { EmployeeDocumentLink } from './entities/employee-document-link.entity';
import type { EmployeeHrRecord } from './entities/employee-hr-record.entity';
import type { EmployeeOnboardingTask } from './entities/employee-onboarding-task.entity';
import type { BankDetailChangeRequest } from './entities/bank-detail-change-request.entity';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('employee-1');
const USER = toId<UserId>('user-1');
const ASSESSMENT = toId<EmployeeAssessmentId>('assessment-1');
const DOCUMENT = toId<DocumentId>('document-1');

const documentRecord: Document = {
  id: DOCUMENT,
  organizationId: ORG,
  name: 'Signed NDA.pdf',
  contentType: 'application/pdf',
  storageKey: 'employees/employee-1/nda.pdf',
  sizeBytes: '1200',
  classification: 'confidential',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const documentVersion: DocumentVersion = {
  id: 'document-version-1',
  organizationId: ORG,
  documentId: DOCUMENT,
  versionNumber: 1,
  storageKey: 'employees/employee-1/nda.pdf',
  contentType: 'application/pdf',
  sizeBytes: '1200',
  signatureStatus: 'signed',
  signedAt: new Date('2026-07-01T00:00:00.000Z'),
  signatureProvider: 'DocuSign',
  externalEnvelopeId: 'env-1',
  createdByUserId: USER,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const documentSummary: DocumentRecord = {
  document: documentRecord,
  latestVersion: documentVersion,
  versionCount: 1,
};

const buildService = (links: EmployeeDocumentLink[] = []) => {
  const assessments = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<EmployeeAssessment>;
  const documentLinks = {
    findById: jest.fn().mockResolvedValue(link('client-doc', 'client')),
    find: jest.fn().mockResolvedValue(links),
  } as unknown as TenantScopedRepository<EmployeeDocumentLink>;
  const hrRecords = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({
        id: 'hr-record-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...value,
      }),
    ),
  } as unknown as TenantScopedRepository<EmployeeHrRecord>;
  const onboardingTasks = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({
        id: 'onboarding-task-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...value,
      }),
    ),
  } as unknown as TenantScopedRepository<EmployeeOnboardingTask>;
  const bankChangeRequests = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'bank-request-1', createdAt: new Date(), ...value }),
    ),
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
  } as unknown as TenantScopedRepository<BankDetailChangeRequest>;
  // Routes the manager's onboarding-task calls back to the repository mock so
  // the seed tests keep steering and asserting through one surface.
  let lastCreatedEntity: unknown = null;
  const manager = {
    create: jest.fn((entity: unknown, value: unknown) => {
      lastCreatedEntity = entity;
      return value;
    }),
    save: jest.fn((value: Record<string, unknown>) => {
      if ((lastCreatedEntity as { name?: string } | null)?.name === 'EmployeeOnboardingTask') {
        return onboardingTasks.save(value);
      }
      return Promise.resolve({ id: ASSESSMENT, createdAt: new Date(), updatedAt: new Date(), ...value });
    }),
    findOne: jest.fn((entity: unknown) =>
      (entity as { name?: string } | null)?.name === 'EmployeeOnboardingTask'
        ? (onboardingTasks.findOne as unknown as jest.Mock)()
        : Promise.resolve(null),
    ),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const documents = {
    register: jest.fn().mockResolvedValue(documentRecord),
    getRecordById: jest.fn().mockResolvedValue(documentSummary),
    addVersion: jest.fn().mockResolvedValue({ ...documentSummary, versionCount: 2 }),
    prepareUpload: jest.fn().mockReturnValue({
      storageKey: 'employees/employee-1/2026-08-03/upload.pdf',
      url: 'hrms-document://upload/test',
      method: 'PUT',
      expiresAt: new Date('2026-08-03T12:00:00.000Z'),
      headers: [{ name: 'Content-Type', value: 'application/pdf' }],
    }),
    prepareDownload: jest.fn().mockResolvedValue({
      storageKey: 'employees/employee-1/nda.pdf',
      url: 'hrms-document://download/test',
      method: 'GET',
      expiresAt: new Date('2026-08-03T12:00:00.000Z'),
      headers: [],
    }),
    requestSignature: jest.fn().mockResolvedValue({
      document: documentRecord,
      latestVersion: { ...documentVersion, signatureStatus: 'pending' },
      versionCount: 1,
      signingUrl: 'hrms-signature://sig-1',
      externalEnvelopeId: 'sig-1',
      signatureProvider: 'manual',
      expiresAt: new Date('2026-08-03T12:00:00.000Z'),
    }),
  } as unknown as DocumentService;
  const employeeDirectory = {
    exists: jest.fn().mockResolvedValue(true),
  } as unknown as EmployeeDirectoryService;
  const employeeService = {
    updateRoleTitle: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmployeeService;
  const publisher = {
    publishWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainEventPublisher;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const workflow = {
    requestApproval: jest.fn().mockResolvedValue({ id: 'approval-1', status: 'pending' }),
    decide: jest.fn().mockResolvedValue({ id: 'approval-1', status: 'approved' }),
  } as unknown as WorkflowService;

  return {
    service: new EmployeeRecordsService(
      assessments,
      documentLinks,
      hrRecords,
      onboardingTasks,
      bankChangeRequests,
      dataSource,
      documents,
      employeeDirectory,
      employeeService,
      publisher,
      tenantContext,
      audit,
      workflow,
    ),
    publisher,
    employeeService,
    onboardingTasks,
    hrRecords,
    documents,
  };
};

const link = (id: string, visibility: EmployeeDocumentLink['visibility']): EmployeeDocumentLink =>
  ({
    id,
    employeeId: EMPLOYEE,
    documentId: DOCUMENT,
    category: 'nda',
    visibility,
    attachedByUserId: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as EmployeeDocumentLink;

describe('EmployeeRecordsService', () => {
  it('records an employee assessment and emits an outbox event', async () => {
    const { service, publisher } = buildService();

    const assessment = await service.recordAssessment({
      employeeId: EMPLOYEE,
      title: 'Quarterly assessment',
      assessmentDate: '2026-07-01',
      score: 88,
      createdByUserId: USER,
    });

    expect(assessment.title).toBe('Quarterly assessment');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'employeeAssessment.recorded' }),
    );
  });

  it('shows client-visible documents to the client portal only', async () => {
    const { service } = buildService([link('client-doc', 'client'), link('hr-doc', 'tethr')]);

    const documents = await service.listDocuments(EMPLOYEE, 'client');

    expect(documents.map((record) => record.link.id)).toEqual(['client-doc']);
    expect(documents[0]?.latestVersion?.signatureStatus).toBe('signed');
  });

  it('adds a new version to an employee document through the document boundary', async () => {
    const { service } = buildService();

    const record = await service.addDocumentVersion({
      employeeDocumentLinkId: toId<EmployeeDocumentLinkId>('client-doc'),
      storageKey: 'employees/employee-1/nda-v2.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1400,
      signatureStatus: 'pending',
      createdByUserId: USER,
    });

    expect(record.versionCount).toBe(2);
    expect(record.link.documentId).toBe(DOCUMENT);
  });

  it('prepares upload and download access through the document boundary', async () => {
    const { documents, service } = buildService();

    const upload = await service.prepareDocumentUpload({
      employeeId: EMPLOYEE,
      name: 'NDA.pdf',
      contentType: 'application/pdf',
    });
    const download = await service.getDocumentDownloadAccess(
      toId<EmployeeDocumentLinkId>('client-doc'),
      'client',
    );

    expect(upload.method).toBe('PUT');
    expect(download.method).toBe('GET');
    expect(documents.prepareUpload).toHaveBeenCalledWith(
      expect.objectContaining({ storagePrefix: `employees/${EMPLOYEE}` }),
    );
  });

  it('requests a document signature through the document boundary', async () => {
    const { documents, service } = buildService();

    const request = await service.requestDocumentSignature({
      employeeDocumentLinkId: toId<EmployeeDocumentLinkId>('client-doc'),
      signerEmail: 'employee@example.com',
      provider: 'manual',
      requestedByUserId: USER,
    });

    expect(request.externalEnvelopeId).toBe('sig-1');
    expect(documents.requestSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOCUMENT,
        signerEmail: 'employee@example.com',
      }),
    );
  });

  it('returns the standard onboarding checklist for Tethr HR', async () => {
    const { service } = buildService();

    const tasks = await service.listOnboardingTasks(EMPLOYEE);

    expect(tasks.map((task) => task.taskKey)).toEqual([
      'profile',
      'contract',
      'nda',
      'resume',
      'bankDetails',
      'hardware',
      'employeeRecordForm',
    ]);
    expect(tasks.every((task) => task.status === 'notStarted')).toBe(true);
  });

  it('upserts an onboarding task status and marks completion', async () => {
    const { onboardingTasks, service } = buildService();

    const task = await service.updateOnboardingTask({
      employeeId: EMPLOYEE,
      taskKey: 'contract' as EmployeeOnboardingTaskKey,
      status: 'completed',
      dueDate: '2026-08-15',
      notes: 'Signed contract received',
      updatedByUserId: USER,
    });

    expect(task.status).toBe('completed');
    expect(task.completedAt).toBeInstanceOf(Date);
    expect(onboardingTasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: EMPLOYEE,
        taskKey: 'contract',
        completedByUserId: USER,
      }),
    );
  });

  it('seeds the seven checklist tasks for a new hire idempotently', async () => {
    const { service, onboardingTasks } = buildService();

    const created = await service.seedOnboardingChecklist(EMPLOYEE);

    expect(created).toBe(7);
    expect(onboardingTasks.save).toHaveBeenCalledTimes(7);

    // A retry finds every row and creates nothing.
    (onboardingTasks.findOne as jest.Mock).mockResolvedValue({ id: 'existing' });
    await expect(service.seedOnboardingChecklist(EMPLOYEE)).resolves.toBe(0);
  });

  it('derives aggregate onboarding progress including the bank-details task', async () => {
    const { service, onboardingTasks, hrRecords } = buildService();
    (onboardingTasks.find as jest.Mock).mockResolvedValue([
      { taskKey: 'profile', status: 'completed', title: 'Profile' },
    ]);
    (hrRecords.findOne as jest.Mock).mockResolvedValue({ bankAccountNumber: 'PK00-1234' });

    const progress = await service.getOnboardingProgress(EMPLOYEE);

    // profile + the derived bank-details completion.
    expect(progress).toEqual({ completed: 2, total: 7, allComplete: false });
  });

  it('creates the Tethr HR private record for sensitive employee data', async () => {
    const { service, employeeService } = buildService();

    const record = await service.updateHrRecord({
      employeeId: EMPLOYEE,
      roleTitle: 'Engineering lead',
      salaryBreakdown: 'Base + allowance',
      bankName: 'Example Bank',
      bankAccountTitle: 'Employee One',
      bankAccountNumber: '1234567890',
      bankIban: 'PK00EXAMPLE',
      hardwareInfo: 'MacBook Pro serial ABC',
      employeeRecordForm: 'Emergency contact and onboarding form data',
      updatedByUserId: USER,
    });

    expect(record.employeeId).toBe(EMPLOYEE);
    expect(record.roleTitle).toBe('Engineering lead');
    expect(record.bankName).toBe('Example Bank');
    expect(employeeService.updateRoleTitle).toHaveBeenCalledWith(
      EMPLOYEE,
      'Engineering lead',
      USER,
    );
  });
});
