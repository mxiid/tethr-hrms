import {
  toId,
  type DataClassification,
  type DocumentSignatureStatus,
  type EmployeeDocumentCategory,
  type EmployeeDocumentLinkId,
  type EmployeeDocumentVisibility,
  type EmployeeId,
  type EmployeeOnboardingTaskKey,
  type EmployeeOnboardingTaskStatus,
  type UserId,
} from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { AuthorizationService } from '../../core/authz/authz.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';
import type { DocumentAccessDescriptor } from '../../core/documents';

import { AddEmployeeDocumentVersionInput } from './dto/add-employee-document-version.input';
import { AttachEmployeeDocumentInput } from './dto/attach-employee-document.input';
import {
  BankDetailChangeRequestView,
  BankDetailsView,
} from './dto/bank-detail-change.output';
import { DecideBankDetailChangeInput } from './dto/decide-bank-detail-change.input';
import { DocumentAccessView } from './dto/document-access.output';
import { EmployeeAssessmentView } from './dto/employee-assessment.output';
import { EmployeeDocumentSignatureRequestView } from './dto/employee-document-signature-request.output';
import { EmployeeDocumentView } from './dto/employee-document.output';
import { EmployeeHrRecordView } from './dto/employee-hr-record.output';
import { EmployeeOnboardingProgressView } from './dto/employee-onboarding-progress.output';
import { EmployeeOnboardingTaskView } from './dto/employee-onboarding-task.output';
import { PrepareEmployeeDocumentUploadInput } from './dto/prepare-employee-document-upload.input';
import { RecordEmployeeAssessmentInput } from './dto/record-employee-assessment.input';
import { RequestBankDetailChangeInput } from './dto/request-bank-detail-change.input';
import { RequestEmployeeDocumentSignatureInput } from './dto/request-employee-document-signature.input';
import { UpdateEmployeeHrRecordInput } from './dto/update-employee-hr-record.input';
import { UpdateEmployeeOnboardingTaskInput } from './dto/update-employee-onboarding-task.input';
import type {
  EmployeeDocumentSignatureRequestRecord,
  EmployeeDocumentRecord,
  EmployeeOnboardingTaskRecord,
} from './employee-records.service';
import { EmployeeRecordsService } from './employee-records.service';
import { EmployeeAssessment } from './entities/employee-assessment.entity';
import { EmployeeHrRecord } from './entities/employee-hr-record.entity';
import type { BankDetailChangeRequest } from './entities/bank-detail-change-request.entity';

const toAssessmentView = (assessment: EmployeeAssessment): EmployeeAssessmentView => ({
  id: assessment.id,
  employeeId: assessment.employeeId,
  title: assessment.title,
  assessmentDate: assessment.assessmentDate,
  score: assessment.score,
  assessorName: assessment.assessorName,
  notes: assessment.notes,
});

const toBankChangeView = (request: BankDetailChangeRequest): BankDetailChangeRequestView => ({
  id: request.id,
  employeeId: request.employeeId,
  bankName: request.bankName,
  bankAccountTitle: request.bankAccountTitle,
  bankAccountNumber: request.bankAccountNumber,
  bankIban: request.bankIban,
  status: request.status,
  createdAt: request.createdAt,
  decidedAt: request.decidedAt,
  decisionNote: request.decisionNote,
});

const toDocumentView = (record: EmployeeDocumentRecord): EmployeeDocumentView => ({
  id: record.link.id,
  employeeId: record.link.employeeId,
  documentId: record.link.documentId,
  category: record.link.category,
  visibility: record.link.visibility,
  name: record.document.name,
  contentType: record.document.contentType,
  sizeBytes: Number(record.document.sizeBytes),
  classification: record.document.classification,
  latestStorageKey: record.latestVersion?.storageKey ?? record.document.storageKey,
  latestVersionNumber: record.latestVersion?.versionNumber ?? 1,
  versionCount: record.versionCount,
  signatureStatus: record.latestVersion?.signatureStatus ?? 'notRequired',
  signedAt: record.latestVersion?.signedAt?.toISOString() ?? null,
  signatureProvider: record.latestVersion?.signatureProvider ?? null,
  externalEnvelopeId: record.latestVersion?.externalEnvelopeId ?? null,
});

const toAccessView = (descriptor: DocumentAccessDescriptor): DocumentAccessView => ({
  storageKey: descriptor.storageKey,
  url: descriptor.url,
  method: descriptor.method,
  expiresAt: descriptor.expiresAt.toISOString(),
  headers: descriptor.headers.map((header) => ({ name: header.name, value: header.value })),
});

const toSignatureRequestView = (
  record: EmployeeDocumentSignatureRequestRecord,
): EmployeeDocumentSignatureRequestView => ({
  employeeDocumentLinkId: record.link.id,
  documentId: record.document.id,
  signingUrl: record.signingUrl,
  externalEnvelopeId: record.externalEnvelopeId,
  signatureProvider: record.signatureProvider,
  signatureStatus: record.latestVersion.signatureStatus,
  expiresAt: record.expiresAt.toISOString(),
});

const toHrRecordView = (record: EmployeeHrRecord): EmployeeHrRecordView => ({
  id: record.id,
  employeeId: record.employeeId,
  roleTitle: record.roleTitle,
  salaryBreakdown: record.salaryBreakdown,
  paymentMode: record.paymentMode ?? null,
  bankName: record.bankName,
  bankAccountTitle: record.bankAccountTitle,
  bankAccountNumber: record.bankAccountNumber,
  bankIban: record.bankIban,
  hardwareInfo: record.hardwareInfo,
  employeeRecordForm: record.employeeRecordForm,
});

const toOnboardingTaskView = (
  record: EmployeeOnboardingTaskRecord,
): EmployeeOnboardingTaskView => ({
  id: record.id,
  employeeId: record.employeeId,
  taskKey: record.taskKey,
  title: record.title,
  status: record.status,
  dueDate: record.dueDate,
  completedAt: record.completedAt?.toISOString() ?? null,
  notes: record.notes,
});

@Resolver()
export class EmployeeRecordsResolver {
  constructor(
    private readonly employeeRecords: EmployeeRecordsService,
    private readonly auth: AuthService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Query(() => [EmployeeAssessmentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.assessmentRead)
  async employeeAssessments(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeAssessmentView[]> {
    return (await this.employeeRecords.listAssessments(toId<EmployeeId>(employeeId))).map(
      toAssessmentView,
    );
  }

  @Query(() => EmployeeHrRecordView, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSensitiveRead)
  async employeeHrRecord(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeHrRecordView | null> {
    const record = await this.employeeRecords.getHrRecord(toId<EmployeeId>(employeeId));
    return record ? toHrRecordView(record) : null;
  }

  @Query(() => [EmployeeOnboardingTaskView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSensitiveRead)
  async employeeOnboardingTasks(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeOnboardingTaskView[]> {
    return (await this.employeeRecords.listOnboardingTasks(toId<EmployeeId>(employeeId))).map(
      toOnboardingTaskView,
    );
  }

  // The aggregate gate: complete / total / allComplete, derived from the same
  // checklist (bank details included) so surfaces never re-count.
  @Query(() => EmployeeOnboardingProgressView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSensitiveRead)
  async employeeOnboardingProgress(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeOnboardingProgressView> {
    return {
      employeeId,
      ...(await this.employeeRecords.getOnboardingProgress(toId<EmployeeId>(employeeId))),
    };
  }

  @Mutation(() => EmployeeHrRecordView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async updateEmployeeHrRecord(
    @Args('input') input: UpdateEmployeeHrRecordInput,
  ): Promise<EmployeeHrRecordView> {
    const user = await this.auth.getCurrentUser();
    const record = await this.employeeRecords.updateHrRecord({
      employeeId: toId<EmployeeId>(input.employeeId),
      roleTitle: input.roleTitle,
      salaryBreakdown: input.salaryBreakdown,
      paymentMode: input.paymentMode ?? null,
      bankName: input.bankName,
      bankAccountTitle: input.bankAccountTitle,
      bankAccountNumber: input.bankAccountNumber,
      bankIban: input.bankIban,
      hardwareInfo: input.hardwareInfo,
      employeeRecordForm: input.employeeRecordForm,
      updatedByUserId: toId<UserId>(user.id),
    });
    return toHrRecordView(record);
  }

  @Mutation(() => EmployeeOnboardingTaskView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async updateEmployeeOnboardingTask(
    @Args('input') input: UpdateEmployeeOnboardingTaskInput,
  ): Promise<EmployeeOnboardingTaskView> {
    const user = await this.auth.getCurrentUser();
    return toOnboardingTaskView(
      await this.employeeRecords.updateOnboardingTask({
        employeeId: toId<EmployeeId>(input.employeeId),
        taskKey: input.taskKey as EmployeeOnboardingTaskKey,
        status: input.status as EmployeeOnboardingTaskStatus,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        updatedByUserId: toId<UserId>(user.id),
      }),
    );
  }

  @Mutation(() => EmployeeAssessmentView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.assessmentWrite)
  async recordEmployeeAssessment(
    @Args('input') input: RecordEmployeeAssessmentInput,
  ): Promise<EmployeeAssessmentView> {
    const user = await this.auth.getCurrentUser();
    const assessment = await this.employeeRecords.recordAssessment({
      employeeId: toId<EmployeeId>(input.employeeId),
      title: input.title,
      assessmentDate: input.assessmentDate,
      score: input.score ?? null,
      assessorName: input.assessorName ?? null,
      notes: input.notes ?? null,
      createdByUserId: toId<UserId>(user.id),
    });
    return toAssessmentView(assessment);
  }

  @Query(() => [EmployeeDocumentView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.documentRead)
  async employeeDocuments(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeDocumentView[]> {
    const access = await this.authorization.getCurrentAccess();
    return (
      await this.employeeRecords.listDocuments(toId<EmployeeId>(employeeId), access.portal)
    ).map(toDocumentView);
  }

  @Query(() => DocumentAccessView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.documentRead)
  async employeeDocumentDownloadAccess(
    @Args('employeeDocumentLinkId', { type: () => ID }) employeeDocumentLinkId: string,
  ): Promise<DocumentAccessView> {
    const access = await this.authorization.getCurrentAccess();
    return toAccessView(
      await this.employeeRecords.getDocumentDownloadAccess(
        toId<EmployeeDocumentLinkId>(employeeDocumentLinkId),
        access.portal,
      ),
    );
  }

  @Mutation(() => DocumentAccessView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.documentManage)
  async prepareEmployeeDocumentUpload(
    @Args('input') input: PrepareEmployeeDocumentUploadInput,
  ): Promise<DocumentAccessView> {
    return toAccessView(
      await this.employeeRecords.prepareDocumentUpload({
        employeeId: toId<EmployeeId>(input.employeeId),
        name: input.name,
        contentType: input.contentType,
      }),
    );
  }

  @Mutation(() => EmployeeDocumentView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.documentManage)
  async attachEmployeeDocument(
    @Args('input') input: AttachEmployeeDocumentInput,
  ): Promise<EmployeeDocumentView> {
    const user = await this.auth.getCurrentUser();
    const record = await this.employeeRecords.attachDocument({
      employeeId: toId<EmployeeId>(input.employeeId),
      name: input.name,
      contentType: input.contentType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      category: input.category as EmployeeDocumentCategory,
      visibility: input.visibility as EmployeeDocumentVisibility,
      classification: (input.classification as DataClassification | null | undefined) ?? null,
      signatureStatus:
        (input.signatureStatus as DocumentSignatureStatus | null | undefined) ?? null,
      signedAt: input.signedAt ? new Date(input.signedAt) : null,
      signatureProvider: input.signatureProvider ?? null,
      externalEnvelopeId: input.externalEnvelopeId ?? null,
      attachedByUserId: toId<UserId>(user.id),
    });
    return toDocumentView(record);
  }

  @Mutation(() => EmployeeDocumentView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.documentManage)
  async addEmployeeDocumentVersion(
    @Args('input') input: AddEmployeeDocumentVersionInput,
  ): Promise<EmployeeDocumentView> {
    const user = await this.auth.getCurrentUser();
    const record = await this.employeeRecords.addDocumentVersion({
      employeeDocumentLinkId: toId<EmployeeDocumentLinkId>(input.employeeDocumentLinkId),
      contentType: input.contentType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      signatureStatus:
        (input.signatureStatus as DocumentSignatureStatus | null | undefined) ?? null,
      signedAt: input.signedAt ? new Date(input.signedAt) : null,
      signatureProvider: input.signatureProvider ?? null,
      externalEnvelopeId: input.externalEnvelopeId ?? null,
      createdByUserId: toId<UserId>(user.id),
    });
    return toDocumentView(record);
  }

  @Mutation(() => EmployeeDocumentSignatureRequestView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.documentManage)
  async requestEmployeeDocumentSignature(
    @Args('input') input: RequestEmployeeDocumentSignatureInput,
  ): Promise<EmployeeDocumentSignatureRequestView> {
    const user = await this.auth.getCurrentUser();
    return toSignatureRequestView(
      await this.employeeRecords.requestDocumentSignature({
        employeeDocumentLinkId: toId<EmployeeDocumentLinkId>(input.employeeDocumentLinkId),
        signerEmail: input.signerEmail,
        signerName: input.signerName ?? null,
        provider: input.provider ?? null,
        requestedByUserId: toId<UserId>(user.id),
      }),
    );
  }

  // --- Bank details (payment instruction) ---

  @Query(() => BankDetailsView, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myBankDetails(): Promise<BankDetailsView | null> {
    const user = await this.auth.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    const details = await this.employeeRecords.getBankDetails(toId<EmployeeId>(user.employeeId));
    return details ?? null;
  }

  @Query(() => [BankDetailChangeRequestView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myBankDetailChangeRequests(): Promise<BankDetailChangeRequestView[]> {
    const user = await this.auth.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return (
      await this.employeeRecords.listBankDetailChangeRequests(toId<EmployeeId>(user.employeeId))
    ).map(toBankChangeView);
  }

  @Mutation(() => BankDetailChangeRequestView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSelfWrite)
  async requestMyBankDetailChange(
    @Args('input') input: RequestBankDetailChangeInput,
  ): Promise<BankDetailChangeRequestView> {
    const user = await this.auth.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return toBankChangeView(
      await this.employeeRecords.requestBankDetailChange({
        employeeId: toId<EmployeeId>(user.employeeId),
        bankName: input.bankName ?? null,
        bankAccountTitle: input.bankAccountTitle ?? null,
        bankAccountNumber: input.bankAccountNumber ?? null,
        bankIban: input.bankIban ?? null,
        requestedByUserId: toId<UserId>(user.id),
      }),
    );
  }

  @Query(() => [BankDetailChangeRequestView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeSensitiveRead)
  async bankDetailChangeRequests(
    @Args('employeeId', { type: () => ID, nullable: true }) employeeId?: string,
  ): Promise<BankDetailChangeRequestView[]> {
    return (
      await this.employeeRecords.listBankDetailChangeRequests(
        employeeId ? toId<EmployeeId>(employeeId) : undefined,
      )
    ).map(toBankChangeView);
  }

  @Mutation(() => BankDetailChangeRequestView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async decideBankDetailChange(
    @Args('input') input: DecideBankDetailChangeInput,
  ): Promise<BankDetailChangeRequestView> {
    const user = await this.auth.getCurrentUser();
    return toBankChangeView(
      await this.employeeRecords.decideBankDetailChange({
        requestId: input.requestId,
        approve: input.approve,
        decidedByUserId: toId<UserId>(user.id),
        note: input.note ?? null,
      }),
    );
  }
}
