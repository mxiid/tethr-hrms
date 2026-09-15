import {
  toId,
  type DataClassification,
  type DocumentId,
  type DocumentSignatureStatus,
  type EmployeeAssessmentId,
  type EmployeeDocumentCategory,
  type EmployeeDocumentLinkId,
  type EmployeeDocumentVisibility,
  type EmployeeId,
  type EmployeeOnboardingTaskKey,
  type EmployeeOnboardingTaskStatus,
  type PortalKind,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import {
  DocumentService,
  type DocumentAccessDescriptor,
  type DocumentRecord,
  type DocumentSignatureRequest,
} from '../../core/documents';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { WorkflowService } from '../../core/workflow';
import { EmployeeDirectoryService, EmployeeService } from '../employee';

import {
  BANK_DETAIL_CHANGE_REQUEST_REPOSITORY,
  EMPLOYEE_ASSESSMENT_REPOSITORY,
  EMPLOYEE_DOCUMENT_LINK_REPOSITORY,
  EMPLOYEE_HR_RECORD_REPOSITORY,
  EMPLOYEE_ONBOARDING_TASK_REPOSITORY,
} from './employee-records.tokens';
import { BankDetailChangeRequest } from './entities/bank-detail-change-request.entity';
import { EmployeeAssessment } from './entities/employee-assessment.entity';
import { EmployeeDocumentLink } from './entities/employee-document-link.entity';
import { EmployeeHrRecord } from './entities/employee-hr-record.entity';
import { EmployeeOnboardingTask } from './entities/employee-onboarding-task.entity';

const ONBOARDING_TASK_DEFINITIONS: readonly {
  readonly taskKey: EmployeeOnboardingTaskKey;
  readonly title: string;
}[] = [
  { taskKey: 'profile', title: 'Profile and personal details' },
  { taskKey: 'contract', title: 'Contract document' },
  { taskKey: 'nda', title: 'NDA document' },
  { taskKey: 'resume', title: 'Resume on file' },
  { taskKey: 'bankDetails', title: 'Bank details' },
  { taskKey: 'hardware', title: 'Hardware allocation' },
  { taskKey: 'employeeRecordForm', title: 'Employee record form' },
];

type RecordEmployeeAssessmentData = {
  readonly employeeId: EmployeeId;
  readonly title: string;
  readonly assessmentDate: string;
  readonly score?: number | null;
  readonly assessorName?: string | null;
  readonly notes?: string | null;
  readonly createdByUserId: UserId;
};

type AttachEmployeeDocumentData = {
  readonly employeeId: EmployeeId;
  readonly name: string;
  readonly contentType: string;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly category: EmployeeDocumentCategory;
  readonly visibility: EmployeeDocumentVisibility;
  readonly classification?: DataClassification | null;
  readonly signatureStatus?: DocumentSignatureStatus | null;
  readonly signedAt?: Date | null;
  readonly signatureProvider?: string | null;
  readonly externalEnvelopeId?: string | null;
  readonly attachedByUserId: UserId;
};

type AddEmployeeDocumentVersionData = {
  readonly employeeDocumentLinkId: EmployeeDocumentLinkId;
  readonly contentType: string;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly signatureStatus?: DocumentSignatureStatus | null;
  readonly signedAt?: Date | null;
  readonly signatureProvider?: string | null;
  readonly externalEnvelopeId?: string | null;
  readonly createdByUserId: UserId;
};

type PrepareEmployeeDocumentUploadData = {
  readonly employeeId: EmployeeId;
  readonly name: string;
  readonly contentType: string;
};

type RequestEmployeeDocumentSignatureData = {
  readonly employeeDocumentLinkId: EmployeeDocumentLinkId;
  readonly signerEmail: string;
  readonly signerName?: string | null;
  readonly provider?: string | null;
  readonly requestedByUserId: UserId;
};

export type EmployeeDocumentSignatureRequestRecord = {
  readonly link: EmployeeDocumentLink;
} & DocumentSignatureRequest;

export type EmployeeOnboardingTaskRecord = {
  readonly id: string | null;
  readonly employeeId: EmployeeId;
  readonly taskKey: EmployeeOnboardingTaskKey;
  readonly title: string;
  readonly status: EmployeeOnboardingTaskStatus;
  readonly dueDate: string | null;
  readonly completedAt: Date | null;
  readonly notes: string | null;
};

type UpdateEmployeeOnboardingTaskData = {
  readonly employeeId: EmployeeId;
  readonly taskKey: EmployeeOnboardingTaskKey;
  readonly status: EmployeeOnboardingTaskStatus;
  readonly dueDate?: string | null;
  readonly notes?: string | null;
  readonly updatedByUserId: UserId;
};

type UpdateEmployeeHrRecordData = {
  readonly employeeId: EmployeeId;
  readonly roleTitle?: string | null;
  readonly salaryBreakdown?: string | null;
  readonly paymentMode?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountTitle?: string | null;
  readonly bankAccountNumber?: string | null;
  readonly bankIban?: string | null;
  readonly hardwareInfo?: string | null;
  readonly employeeRecordForm?: string | null;
  readonly updatedByUserId: UserId;
};

type BankDetails = {
  readonly bankName: string | null;
  readonly bankAccountTitle: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIban: string | null;
};

type RequestBankDetailChangeData = {
  readonly employeeId: EmployeeId;
  readonly bankName?: string | null;
  readonly bankAccountTitle?: string | null;
  readonly bankAccountNumber?: string | null;
  readonly bankIban?: string | null;
  readonly requestedByUserId?: UserId | null;
};

type DecideBankDetailChangeData = {
  readonly requestId: string;
  readonly approve: boolean;
  readonly decidedByUserId: UserId;
  readonly note?: string | null;
};

export type EmployeeDocumentRecord = {
  readonly link: EmployeeDocumentLink;
} & DocumentRecord;

@Injectable()
export class EmployeeRecordsService {
  constructor(
    @Inject(EMPLOYEE_ASSESSMENT_REPOSITORY)
    private readonly assessments: TenantScopedRepository<EmployeeAssessment>,
    @Inject(EMPLOYEE_DOCUMENT_LINK_REPOSITORY)
    private readonly documentLinks: TenantScopedRepository<EmployeeDocumentLink>,
    @Inject(EMPLOYEE_HR_RECORD_REPOSITORY)
    private readonly hrRecords: TenantScopedRepository<EmployeeHrRecord>,
    @Inject(EMPLOYEE_ONBOARDING_TASK_REPOSITORY)
    private readonly onboardingTasks: TenantScopedRepository<EmployeeOnboardingTask>,
    @Inject(BANK_DETAIL_CHANGE_REQUEST_REPOSITORY)
    private readonly bankChangeRequests: TenantScopedRepository<BankDetailChangeRequest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly documents: DocumentService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly employeeService: EmployeeService,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  async recordAssessment(input: RecordEmployeeAssessmentData): Promise<EmployeeAssessment> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const organizationId = this.tenantContext.getOrganizationId();
    const assessment = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(EmployeeAssessment, {
        organizationId,
        employeeId: input.employeeId,
        title: input.title,
        assessmentDate: input.assessmentDate,
        score: input.score ?? null,
        assessorName: input.assessorName ?? null,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId,
      });
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'employeeAssessment.recorded',
        payload: {
          employeeAssessmentId: toId<EmployeeAssessmentId>(saved.id),
          employeeId: saved.employeeId,
          title: saved.title,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'record',
      resourceType: 'employee_assessment',
      resourceId: assessment.id,
      after: { employeeId: assessment.employeeId, title: assessment.title },
    });
    return assessment;
  }

  getHrRecord(employeeId: EmployeeId): Promise<EmployeeHrRecord | null> {
    return this.hrRecords.findOne({
      where: { employeeId } as FindOptionsWhere<EmployeeHrRecord>,
    });
  }

  // --- Bank details (payment instruction) ---

  async getBankDetails(employeeId: EmployeeId): Promise<BankDetails | null> {
    const record = await this.getHrRecord(employeeId);
    if (!record) {
      return null;
    }
    return {
      bankName: record.bankName,
      bankAccountTitle: record.bankAccountTitle,
      bankAccountNumber: record.bankAccountNumber,
      bankIban: record.bankIban,
    };
  }

  async requestBankDetailChange(
    input: RequestBankDetailChangeData,
  ): Promise<BankDetailChangeRequest> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const proposed = [
      input.bankName,
      input.bankAccountTitle,
      input.bankAccountNumber,
      input.bankIban,
    ];
    if (proposed.every((value) => value == null || value.trim() === '')) {
      throw new ValidationFailedError('At least one bank field is required');
    }
    const request = await this.bankChangeRequests.save(
      this.bankChangeRequests.create({
        employeeId: input.employeeId,
        bankName: input.bankName?.trim() || null,
        bankAccountTitle: input.bankAccountTitle?.trim() || null,
        bankAccountNumber: input.bankAccountNumber?.trim() || null,
        bankIban: input.bankIban?.trim() || null,
        status: 'pending',
        approvalRequestId: null,
        requestedByUserId: input.requestedByUserId ?? null,
        decidedByUserId: null,
        decidedAt: null,
        decisionNote: null,
      }),
    );
    // Ride the shared approval engine so bank changes aren't a second bespoke
    // approval mechanism (finding 7).
    if (input.requestedByUserId) {
      const approval = await this.workflow.requestApproval({
        subjectType: 'bankDetailChange',
        subjectId: request.id,
        requestedByUserId: input.requestedByUserId,
      });
      request.approvalRequestId = approval.id;
      await this.bankChangeRequests.save(request);
    }
    await this.audit.record({
      action: 'request',
      resourceType: 'bank_detail_change_request',
      resourceId: request.id,
      after: { employeeId: request.employeeId },
    });
    return request;
  }

  listBankDetailChangeRequests(employeeId?: EmployeeId): Promise<BankDetailChangeRequest[]> {
    const where = employeeId ? { employeeId } : {};
    return this.bankChangeRequests.find({
      where: where as FindOptionsWhere<BankDetailChangeRequest>,
      order: { createdAt: 'DESC' },
    });
  }

  async decideBankDetailChange(
    input: DecideBankDetailChangeData,
  ): Promise<BankDetailChangeRequest> {
    const request = await this.bankChangeRequests.findById(input.requestId);
    if (!request) {
      throw new NotFoundError('Bank detail change request not found', { id: input.requestId });
    }
    if (request.status !== 'pending') {
      throw new ConflictError('This change request has already been decided');
    }
    if (request.approvalRequestId) {
      await this.workflow.decide(
        request.approvalRequestId,
        input.decidedByUserId,
        input.approve ? 'approved' : 'rejected',
        input.note ?? undefined,
      );
    }
    request.status = input.approve ? 'approved' : 'rejected';
    request.decidedByUserId = input.decidedByUserId;
    request.decidedAt = new Date();
    request.decisionNote = input.note ?? null;
    const saved = await this.bankChangeRequests.save(request);

    if (input.approve) {
      const existing = await this.getHrRecord(request.employeeId);
      const record = existing ?? this.hrRecords.create({ employeeId: request.employeeId });
      if (request.bankName !== null) record.bankName = request.bankName;
      if (request.bankAccountTitle !== null) record.bankAccountTitle = request.bankAccountTitle;
      if (request.bankAccountNumber !== null) record.bankAccountNumber = request.bankAccountNumber;
      if (request.bankIban !== null) record.bankIban = request.bankIban;
      record.updatedByUserId = input.decidedByUserId;
      await this.hrRecords.save(record);
    }

    await this.audit.record({
      action: input.approve ? 'approve' : 'reject',
      resourceType: 'bank_detail_change_request',
      resourceId: saved.id,
      after: { employeeId: saved.employeeId, status: saved.status },
    });
    return saved;
  }

  async updateHrRecord(input: UpdateEmployeeHrRecordData): Promise<EmployeeHrRecord> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const existing = await this.getHrRecord(input.employeeId);
    const record =
      existing ??
      this.hrRecords.create({
        employeeId: input.employeeId,
      });

    const patch = {
      roleTitle: input.roleTitle,
      salaryBreakdown: input.salaryBreakdown,
      paymentMode: input.paymentMode,
      bankName: input.bankName,
      bankAccountTitle: input.bankAccountTitle,
      bankAccountNumber: input.bankAccountNumber,
      bankIban: input.bankIban,
      hardwareInfo: input.hardwareInfo,
      employeeRecordForm: input.employeeRecordForm,
    };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        (record as unknown as Record<string, string | null>)[key] = value;
      }
    }
    record.updatedByUserId = input.updatedByUserId;

    const saved = await this.hrRecords.save(record);
    if (input.roleTitle !== undefined) {
      await this.employeeService.updateRoleTitle(
        input.employeeId,
        input.roleTitle,
        input.updatedByUserId,
      );
    }
    await this.audit.record({
      action: existing ? 'update' : 'create',
      resourceType: 'employee_hr_record',
      resourceId: saved.id,
      after: { employeeId: saved.employeeId },
    });
    return saved;
  }

  listAssessments(employeeId: EmployeeId): Promise<EmployeeAssessment[]> {
    return this.assessments.find({
      where: { employeeId } as FindOptionsWhere<EmployeeAssessment>,
      order: { assessmentDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async listOnboardingTasks(employeeId: EmployeeId): Promise<EmployeeOnboardingTaskRecord[]> {
    if (!(await this.employeeDirectory.exists(employeeId))) {
      throw new NotFoundError('Employee not found', { id: employeeId });
    }
    const existing = await this.onboardingTasks.find({
      where: { employeeId } as FindOptionsWhere<EmployeeOnboardingTask>,
      order: { createdAt: 'ASC' },
    });
    const byTaskKey = new Map(existing.map((task) => [task.taskKey, task]));
    // Derive the one task whose truth lives in our own data: bank details are
    // done exactly when the payment fields are populated, so "completed" can
    // never be true while the bank columns are empty (plan Phase 1 #11).
    const hrRecord = await this.getHrRecord(employeeId);
    const bankDetailsComplete = Boolean(
      hrRecord && (hrRecord.bankAccountNumber || hrRecord.bankIban),
    );
    return ONBOARDING_TASK_DEFINITIONS.map((definition) => {
      const task = byTaskKey.get(definition.taskKey);
      let status = task?.status ?? 'notStarted';
      if (definition.taskKey === 'bankDetails' && bankDetailsComplete) {
        status = 'completed';
      }
      return {
        id: task?.id ?? null,
        employeeId,
        taskKey: definition.taskKey,
        title: task?.title ?? definition.title,
        status,
        dueDate: task?.dueDate ?? null,
        completedAt: task?.completedAt ?? null,
        notes: task?.notes ?? null,
      };
    });
  }

  // Seeds the standard checklist for a new hire. Idempotent per (employee,
  // taskKey): the employee.created consumer may be retried by the outbox, and
  // the rows may already have been created by an operator.
  async seedOnboardingChecklist(employeeId: EmployeeId): Promise<number> {
    const organizationId = this.tenantContext.getOrganizationId();
    let created = 0;
    for (const definition of ONBOARDING_TASK_DEFINITIONS) {
      const existing = await this.onboardingTasks.findOne({
        where: {
          employeeId,
          taskKey: definition.taskKey,
        } as FindOptionsWhere<EmployeeOnboardingTask>,
      });
      if (existing) continue;
      await this.onboardingTasks.save(
        this.onboardingTasks.create({
          organizationId,
          employeeId,
          taskKey: definition.taskKey,
          title: definition.title,
          status: 'notStarted',
          dueDate: null,
          notes: null,
        }),
      );
      created += 1;
    }
    return created;
  }

  // The aggregate read the checklist never had: everything complete, with the
  // derived bank-details task included. Surfaces and later workflows gate on
  // this instead of re-counting in each client.
  async getOnboardingProgress(employeeId: EmployeeId): Promise<{
    readonly completed: number;
    readonly total: number;
    readonly allComplete: boolean;
  }> {
    const tasks = await this.listOnboardingTasks(employeeId);
    const completed = tasks.filter((task) => task.status === 'completed').length;
    return {
      completed,
      total: tasks.length,
      allComplete: tasks.length > 0 && completed === tasks.length,
    };
  }

  async updateOnboardingTask(
    input: UpdateEmployeeOnboardingTaskData,
  ): Promise<EmployeeOnboardingTaskRecord> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const definition = ONBOARDING_TASK_DEFINITIONS.find(
      (candidate) => candidate.taskKey === input.taskKey,
    );
    if (!definition) {
      throw new NotFoundError('Onboarding task not found', { taskKey: input.taskKey });
    }
    const existing = await this.onboardingTasks.findOne({
      where: {
        employeeId: input.employeeId,
        taskKey: input.taskKey,
      } as FindOptionsWhere<EmployeeOnboardingTask>,
    });
    const task =
      existing ??
      this.onboardingTasks.create({
        employeeId: input.employeeId,
        taskKey: input.taskKey,
        title: definition.title,
      });

    task.status = input.status;
    task.dueDate = input.dueDate ?? null;
    task.notes = input.notes ?? null;
    task.updatedByUserId = input.updatedByUserId;
    if (input.status === 'completed') {
      task.completedAt = task.completedAt ?? new Date();
      task.completedByUserId = task.completedByUserId ?? input.updatedByUserId;
    } else {
      task.completedAt = null;
      task.completedByUserId = null;
    }

    const saved = await this.onboardingTasks.save(task);
    await this.audit.record({
      action: existing ? 'update' : 'create',
      resourceType: 'employee_onboarding_task',
      resourceId: saved.id,
      after: {
        employeeId: saved.employeeId,
        taskKey: saved.taskKey,
        status: saved.status,
      },
    });
    return {
      id: saved.id,
      employeeId: saved.employeeId,
      taskKey: saved.taskKey,
      title: saved.title,
      status: saved.status,
      dueDate: saved.dueDate,
      completedAt: saved.completedAt,
      notes: saved.notes,
    };
  }

  async attachDocument(input: AttachEmployeeDocumentData): Promise<EmployeeDocumentRecord> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const document = await this.documents.register({
      name: input.name,
      contentType: input.contentType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      classification: input.classification ?? 'internal',
      signatureStatus: input.signatureStatus ?? null,
      signedAt: input.signedAt ?? null,
      signatureProvider: input.signatureProvider ?? null,
      externalEnvelopeId: input.externalEnvelopeId ?? null,
      createdByUserId: input.attachedByUserId,
    });
    const organizationId = this.tenantContext.getOrganizationId();
    const link = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(EmployeeDocumentLink, {
        organizationId,
        employeeId: input.employeeId,
        documentId: toId<DocumentId>(document.id),
        category: input.category,
        visibility: input.visibility,
        attachedByUserId: input.attachedByUserId,
      });
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'employeeDocument.attached',
        payload: {
          employeeDocumentLinkId: toId<EmployeeDocumentLinkId>(saved.id),
          employeeId: saved.employeeId,
          documentId: saved.documentId,
          visibility: saved.visibility,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'attach',
      resourceType: 'employee_document',
      resourceId: link.id,
      after: {
        employeeId: link.employeeId,
        documentId: link.documentId,
        visibility: link.visibility,
      },
    });
    return { link, ...(await this.documents.getRecordById(document.id)) };
  }

  async prepareDocumentUpload(
    input: PrepareEmployeeDocumentUploadData,
  ): Promise<DocumentAccessDescriptor> {
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    return this.documents.prepareUpload({
      name: input.name,
      contentType: input.contentType,
      storagePrefix: `employees/${input.employeeId}`,
    });
  }

  async getDocumentDownloadAccess(
    employeeDocumentLinkId: EmployeeDocumentLinkId,
    portal: PortalKind,
  ): Promise<DocumentAccessDescriptor> {
    const link = await this.getVisibleDocumentLink(employeeDocumentLinkId, portal);
    return this.documents.prepareDownload(link.documentId);
  }

  async requestDocumentSignature(
    input: RequestEmployeeDocumentSignatureData,
  ): Promise<EmployeeDocumentSignatureRequestRecord> {
    const link = await this.documentLinks.findById(input.employeeDocumentLinkId);
    if (!link) {
      throw new NotFoundError('Employee document link not found', {
        id: input.employeeDocumentLinkId,
      });
    }
    const signatureRequest = await this.documents.requestSignature({
      documentId: link.documentId,
      signerEmail: input.signerEmail,
      signerName: input.signerName ?? null,
      provider: input.provider ?? null,
      requestedByUserId: input.requestedByUserId,
    });
    await this.audit.record({
      action: 'signature_request',
      resourceType: 'employee_document',
      resourceId: link.id,
      after: {
        employeeId: link.employeeId,
        documentId: link.documentId,
        externalEnvelopeId: signatureRequest.externalEnvelopeId,
        signatureProvider: signatureRequest.signatureProvider,
      },
    });
    return { link, ...signatureRequest };
  }

  async addDocumentVersion(input: AddEmployeeDocumentVersionData): Promise<EmployeeDocumentRecord> {
    const link = await this.documentLinks.findById(input.employeeDocumentLinkId);
    if (!link) {
      throw new NotFoundError('Employee document link not found', {
        id: input.employeeDocumentLinkId,
      });
    }
    const documentRecord = await this.documents.addVersion({
      documentId: link.documentId,
      contentType: input.contentType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      signatureStatus: input.signatureStatus ?? null,
      signedAt: input.signedAt ?? null,
      signatureProvider: input.signatureProvider ?? null,
      externalEnvelopeId: input.externalEnvelopeId ?? null,
      createdByUserId: input.createdByUserId,
    });

    await this.audit.record({
      action: 'version',
      resourceType: 'employee_document',
      resourceId: link.id,
      after: {
        employeeId: link.employeeId,
        documentId: link.documentId,
        versionCount: documentRecord.versionCount,
      },
    });
    return { link, ...documentRecord };
  }

  async listDocuments(
    employeeId: EmployeeId,
    portal: PortalKind,
  ): Promise<EmployeeDocumentRecord[]> {
    const visible = this.visibleDocumentVisibilities(portal);
    const links = await this.documentLinks.find({
      where: { employeeId } as FindOptionsWhere<EmployeeDocumentLink>,
      order: { createdAt: 'DESC' },
    });
    const records: EmployeeDocumentRecord[] = [];
    for (const link of links.filter((candidate) => visible.has(candidate.visibility))) {
      records.push({ link, ...(await this.documents.getRecordById(link.documentId)) });
    }
    return records;
  }

  private async getVisibleDocumentLink(
    employeeDocumentLinkId: EmployeeDocumentLinkId,
    portal: PortalKind,
  ): Promise<EmployeeDocumentLink> {
    const link = await this.documentLinks.findById(employeeDocumentLinkId);
    if (!link || !this.visibleDocumentVisibilities(portal).has(link.visibility)) {
      throw new NotFoundError('Employee document link not found', { id: employeeDocumentLinkId });
    }
    return link;
  }

  private visibleDocumentVisibilities(portal: PortalKind): ReadonlySet<EmployeeDocumentVisibility> {
    if (portal === 'tethr') return new Set(['all', 'client', 'employee', 'tethr']);
    if (portal === 'client') return new Set(['all', 'client']);
    if (portal === 'employee') return new Set(['all', 'employee']);
    return new Set(['all']);
  }
}
