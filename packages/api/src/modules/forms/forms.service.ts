import {
  toId,
  type FormFieldType,
  type FormId,
  type FormSubmissionId,
  type FormTarget,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { NotFoundError, ValidationFailedError } from '../../common/errors';
import { ConfigService } from '../../core/config/config.service';
import { StorageService } from '../../core/documents/storage.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { RateLimiterService } from '../../core/security/rate-limiter.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { FormDefinition, type FormDefinitionStatus } from './entities/form-definition.entity';
import { FormField } from './entities/form-field.entity';
import { FormSubmission, type FormSubmissionFile } from './entities/form-submission.entity';
import { FormUploadTicket } from './entities/form-upload-ticket.entity';
import {
  FORM_DEFINITION_REPOSITORY,
  FORM_FIELD_REPOSITORY,
  FORM_SUBMISSION_REPOSITORY,
  FORM_UPLOAD_TICKET_REPOSITORY,
} from './forms.tokens';

export type CreateFormFieldData = {
  readonly fieldKey: string;
  readonly label: string;
  readonly type: FormFieldType;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly mapsTo?: string | null;
  readonly helpText?: string | null;
};

export type CreateFormData = {
  readonly name: string;
  readonly slug: string;
  readonly target?: FormTarget;
  readonly status?: FormDefinitionStatus;
  readonly fields: readonly CreateFormFieldData[];
};

export type SubmitFormData = {
  readonly answers: Readonly<Record<string, string>>;
  readonly files: readonly FormSubmissionFile[];
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type PublicForm = {
  readonly form: FormDefinition;
  readonly fields: readonly FormField[];
};

export type PreparedFormUpload = {
  readonly storageKey: string;
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: readonly { readonly name: string; readonly value: string }[];
  readonly expiresAt: Date;
};

// What the projection consumer needs to turn a submission into its downstream
// record: the raw submission plus the field definitions (for `mapsTo`).
export type SubmissionProjection = {
  readonly submission: FormSubmission;
  readonly fields: readonly FormField[];
};

const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,63}$/;
// Same shape the intake projection enforces; catching it here turns a silent
// orphaned submission into a field error the applicant can fix. The lookahead
// keeps the match linear on malformed dotted domains while accepting the same
// values as the former pattern.
const EMAIL_PATTERN = /^[^\s@]+@(?=[^\s@][^\s@]*\.[^\s@])[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const APPLICATION_FORM_FIELDS: readonly CreateFormFieldData[] = [
  { fieldKey: 'fullName', label: 'Full name', type: 'text', required: true, mapsTo: 'candidate.fullName' },
  { fieldKey: 'email', label: 'Email', type: 'email', required: true, mapsTo: 'candidate.email' },
  { fieldKey: 'phone', label: 'Phone', type: 'phone', mapsTo: 'candidate.phone' },
  { fieldKey: 'linkedin', label: 'LinkedIn', type: 'text', mapsTo: 'candidate.linkedin' },
  { fieldKey: 'portfolio', label: 'Portfolio', type: 'text', mapsTo: 'candidate.portfolio' },
  { fieldKey: 'resume', label: 'Resume (CV)', type: 'file', required: true, mapsTo: 'document.resume' },
  { fieldKey: 'currentTitle', label: 'Current title', type: 'text', mapsTo: 'application.currentTitle' },
  { fieldKey: 'currentSalary', label: 'Current salary', type: 'number', mapsTo: 'application.currentSalary' },
  { fieldKey: 'expectedSalary', label: 'Expected salary', type: 'number', mapsTo: 'application.expectedSalary' },
  { fieldKey: 'salaryCurrency', label: 'Salary currency', type: 'text', mapsTo: 'application.salaryCurrency' },
  { fieldKey: 'yearsOfExperience', label: 'Years of experience', type: 'number', mapsTo: 'application.yearsExperience' },
  { fieldKey: 'location', label: 'Location', type: 'text', mapsTo: 'application.location' },
  { fieldKey: 'skills', label: 'Tech, stack and skills', type: 'textarea', mapsTo: 'application.skills' },
  { fieldKey: 'coverNote', label: "Tell us why you're a good fit", type: 'textarea', mapsTo: 'application.coverNote' },
];

// The generic form engine. Definitions, fields and submissions are ordinary
// tenant-scoped records; the public surface is the resolver's job (it verifies
// the signed link, then runs everything inside the link's tenant).
@Injectable()
export class FormsService {
  constructor(
    @Inject(FORM_DEFINITION_REPOSITORY)
    private readonly forms: TenantScopedRepository<FormDefinition>,
    @Inject(FORM_FIELD_REPOSITORY)
    private readonly fields: TenantScopedRepository<FormField>,
    @Inject(FORM_SUBMISSION_REPOSITORY)
    private readonly submissions: TenantScopedRepository<FormSubmission>,
    @Inject(FORM_UPLOAD_TICKET_REPOSITORY)
    private readonly tickets: TenantScopedRepository<FormUploadTicket>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly storage: StorageService,
    private readonly publisher: DomainEventPublisher,
    private readonly rateLimiter: RateLimiterService,
    private readonly config: ConfigService,
  ) {}

  async createForm(input: CreateFormData): Promise<PublicForm> {
    const name = input.name.trim();
    if (!name) {
      throw new ValidationFailedError('A form needs a name');
    }
    for (const field of input.fields) {
      this.assertFieldDefinition(field);
    }
    const form = await this.forms.save(
      this.forms.create({
        name,
        slug: input.slug.trim().toLowerCase(),
        status: input.status ?? 'draft',
        target: input.target ?? 'generic',
      }),
    );
    const formId = toId<FormId>(form.id);
    const savedFields: FormField[] = [];
    for (const [index, field] of input.fields.entries()) {
      savedFields.push(
        await this.fields.save(
          this.fields.create({
            formId,
            fieldKey: field.fieldKey,
            label: field.label,
            type: field.type,
            required: field.required ?? false,
            options: [...(field.options ?? [])],
            sortOrder: index,
            mapsTo: field.mapsTo ?? null,
            helpText: field.helpText ?? null,
          }),
        ),
      );
    }
    return { form, fields: savedFields };
  }

  async listForms(): Promise<PublicForm[]> {
    const forms = await this.forms.find({ order: { createdAt: 'DESC' } });
    const records: PublicForm[] = [];
    for (const form of forms) {
      records.push({ form, fields: await this.getFields(toId<FormId>(form.id)) });
    }
    return records;
  }

  // Only published forms render; the link token carries the org and form id, so
  // this reads under the link's tenant and refuses drafts.
  async getPublicForm(formId: FormId): Promise<PublicForm> {
    const form = await this.forms.findById(formId);
    if (!form || form.status !== 'published') {
      throw new NotFoundError('Form not found', { id: formId });
    }
    return { form, fields: await this.getFields(formId) };
  }

  async prepareFileUpload(input: {
    readonly formId: FormId;
    readonly fieldKey: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly rateLimitKey: string;
  }): Promise<PreparedFormUpload> {
    this.rateLimiter.consume(
      input.rateLimitKey,
      this.config.get('FORM_UPLOAD_LIMIT_PER_10_MIN'),
      RATE_LIMIT_WINDOW_MS,
    );
    const fields = await this.getFields(input.formId);
    const field = fields.find((candidate) => candidate.fieldKey === input.fieldKey);
    if (!field || field.type !== 'file') {
      throw new ValidationFailedError('Unknown file field');
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
      throw new ValidationFailedError('File must be between 1 byte and 10 MB');
    }
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'upload';
    const storageKey = `form-submissions/${input.formId}/${Date.now().toString(36)}-${safeName}`;
    const upload = await this.storage.createSignedUpload({
      storageKey,
      contentType: input.contentType,
    });
    // Record exactly what was issued; submission can only reference a ticket.
    await this.tickets.save(
      this.tickets.create({
        formId: input.formId,
        fieldKey: input.fieldKey,
        storageKey,
        contentType: input.contentType,
        sizeBytes: String(input.sizeBytes),
        expiresAt: upload.expiresAt,
        usedAt: null,
      }),
    );
    return upload;
  }

  async submitForm(input: {
    readonly formId: FormId;
    readonly data: SubmitFormData;
    readonly rateLimitKey: string;
  }): Promise<FormSubmission> {
    this.rateLimiter.consume(
      input.rateLimitKey,
      this.config.get('FORM_SUBMIT_LIMIT_PER_10_MIN'),
      RATE_LIMIT_WINDOW_MS,
      'Too many submissions — please try again later.',
    );
    const publicForm = await this.getPublicForm(input.formId);
    this.validateSubmission(publicForm.fields, input.data);
    const tickets = await this.verifyUploadTickets(publicForm.fields, input.data);

    // Claim every ticket and insert the submission in one transaction: a ticket
    // can back exactly one submission even under concurrent requests. The
    // form.submitted event joins the same transaction (transactional outbox) —
    // a crash between the insert and the publish can no longer drop the ATS
    // intake, and a rolled-back submission never emits.
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      for (const ticket of tickets) {
        const claim = await manager
          .createQueryBuilder()
          .update(FormUploadTicket)
          .set({ usedAt: new Date() })
          .where('id = :id', { id: ticket.id })
          .andWhere('"usedAt" IS NULL')
          .execute();
        if (!claim.affected) {
          throw new ValidationFailedError('That uploaded file was already submitted');
        }
      }
      const submission = await manager.save(
        manager.create(FormSubmission, {
          organizationId,
          formId: input.formId,
          answers: { ...input.data.answers },
          files: [...input.data.files],
          submittedAt: new Date(),
          status: 'pending',
          statusReason: null,
          metadata: { ...input.data.metadata },
          targetRefType: null,
          targetRefId: null,
        }),
      );
      await this.publisher.publishWithin(manager, {
        name: 'form.submitted',
        payload: {
          formId: input.formId,
          submissionId: toId<FormSubmissionId>(submission.id),
          target: publicForm.form.target,
        },
      });
      return submission;
    });
  }

  // The application form's template. Idempotent by slug; the first consumer of
  // the engine and the reason the exact intake columns are configuration.
  async ensureApplicationForm(): Promise<PublicForm> {
    const existing = await this.forms.findOne({ where: { slug: 'application' } });
    if (existing) {
      return { form: existing, fields: await this.getFields(toId<FormId>(existing.id)) };
    }
    return this.createForm({
      name: 'Application form',
      slug: 'application',
      target: 'application',
      status: 'published',
      fields: APPLICATION_FORM_FIELDS,
    });
  }

  private async getFields(formId: FormId): Promise<FormField[]> {
    return this.fields.find({ where: { formId }, order: { sortOrder: 'ASC' } });
  }

  // Published interface for the projection consumers: the raw submission plus
  // its field definitions, and the back-link once the downstream record exists.
  async getSubmissionForProjection(submissionId: FormSubmissionId): Promise<SubmissionProjection> {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) {
      throw new NotFoundError('Form submission not found', { id: submissionId });
    }
    return { submission, fields: await this.getFields(toId<FormId>(submission.formId)) };
  }

  async markSubmissionProjected(
    submissionId: FormSubmissionId,
    refType: string,
    refId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const submission = manager
      ? await manager.findOne(FormSubmission, {
          where: {
            id: submissionId,
            organizationId: this.tenantContext.getOrganizationId(),
          } as FindOptionsWhere<FormSubmission>,
        })
      : await this.submissions.findById(submissionId);
    if (!submission) return;
    submission.status = 'projected';
    submission.statusReason = null;
    submission.targetRefType = refType;
    submission.targetRefId = refId;
    await (manager ? manager.save(submission) : this.submissions.save(submission));
  }

  // The target refused the submission (e.g. the posting closed before it
  // arrived). Kept with a reason rather than dropped.
  async markSubmissionRejected(
    submissionId: FormSubmissionId,
    reason: string,
    manager?: EntityManager,
  ): Promise<void> {
    const submission = manager
      ? await manager.findOne(FormSubmission, {
          where: {
            id: submissionId,
            organizationId: this.tenantContext.getOrganizationId(),
          } as FindOptionsWhere<FormSubmission>,
        })
      : await this.submissions.findById(submissionId);
    if (!submission) return;
    submission.status = 'rejected';
    submission.statusReason = reason;
    await (manager ? manager.save(submission) : this.submissions.save(submission));
  }

  private assertFieldDefinition(field: CreateFormFieldData): void {
    if (!FIELD_KEY_PATTERN.test(field.fieldKey)) {
      throw new ValidationFailedError('Field keys must be camelCase identifiers', {
        fieldKey: field.fieldKey,
      });
    }
    if (field.type === 'select' && (field.options ?? []).length === 0) {
      throw new ValidationFailedError('Select fields need at least one option', {
        fieldKey: field.fieldKey,
      });
    }
  }

  private validateSubmission(fields: readonly FormField[], data: SubmitFormData): void {
    if (data.files.length > MAX_FILES) {
      throw new ValidationFailedError('Too many files');
    }
    const byKey = new Map(fields.map((field) => [field.fieldKey, field]));
    for (const answerKey of Object.keys(data.answers)) {
      if (!byKey.has(answerKey)) {
        throw new ValidationFailedError('Unknown form field', { fieldKey: answerKey });
      }
    }
    for (const file of data.files) {
      const field = byKey.get(file.fieldKey);
      if (!field || field.type !== 'file') {
        throw new ValidationFailedError('Unknown file field', { fieldKey: file.fieldKey });
      }
      if (file.sizeBytes <= 0 || file.sizeBytes > MAX_FILE_BYTES) {
        throw new ValidationFailedError('File must be between 1 byte and 10 MB');
      }
    }
    for (const field of fields) {
      if (!field.required) continue;
      if (field.type === 'file') {
        if (!data.files.some((file) => file.fieldKey === field.fieldKey)) {
          throw new ValidationFailedError(`${field.label} is required`, {
            fieldKey: field.fieldKey,
          });
        }
        continue;
      }
      const value = data.answers[field.fieldKey];
      if (value === undefined || value.trim() === '') {
        throw new ValidationFailedError(`${field.label} is required`, {
          fieldKey: field.fieldKey,
        });
      }
    }
    // An `email` field must carry a real address: the projection refuses to
    // build a candidate from a malformed one, and an anonymous applicant has no
    // other way to learn why nothing happened.
    for (const field of fields) {
      if (field.type !== 'email') continue;
      const value = data.answers[field.fieldKey]?.trim();
      if (value === undefined || value === '') continue;
      if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) {
        throw new ValidationFailedError(`${field.label} must be a valid email address`, {
          fieldKey: field.fieldKey,
        });
      }
    }
  }

  // Every file answer must match a ticket this form issued, be unused and
  // unexpired, and correspond to bytes that actually exist in object storage at
  // the declared size. Prefix-matching alone let anyone fabricate a key.
  private async verifyUploadTickets(
    fields: readonly FormField[],
    data: SubmitFormData,
  ): Promise<FormUploadTicket[]> {
    const tickets: FormUploadTicket[] = [];
    for (const file of data.files) {
      const field = fields.find((candidate) => candidate.fieldKey === file.fieldKey);
      if (!field) continue;
      const ticket = await this.tickets.findOne({
        where: { storageKey: file.storageKey, formId: field.formId, fieldKey: field.fieldKey },
      });
      if (!ticket) {
        throw new ValidationFailedError('That file was not uploaded through this form', {
          fieldKey: file.fieldKey,
        });
      }
      if (ticket.usedAt !== null) {
        throw new ValidationFailedError('That uploaded file was already submitted', {
          fieldKey: file.fieldKey,
        });
      }
      if (ticket.expiresAt.getTime() < Date.now()) {
        throw new ValidationFailedError('The upload link has expired — please upload again', {
          fieldKey: file.fieldKey,
        });
      }
      if (Number(ticket.sizeBytes) !== file.sizeBytes) {
        throw new ValidationFailedError('File size does not match the upload', {
          fieldKey: file.fieldKey,
        });
      }
      const stored = await this.storage.statObject(file.storageKey);
      if (!stored) {
        throw new ValidationFailedError('The uploaded file was not found in storage', {
          fieldKey: file.fieldKey,
        });
      }
      if (stored.sizeBytes !== file.sizeBytes) {
        throw new ValidationFailedError('File size does not match the upload', {
          fieldKey: file.fieldKey,
        });
      }
      tickets.push(ticket);
    }
    return tickets;
  }
}
