import {
  toId,
  type FormFieldType,
  type FormId,
  type FormSubmissionId,
  type FormTarget,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError, ValidationFailedError } from '../../common/errors';
import { StorageService } from '../../core/documents/storage.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { FormDefinition, type FormDefinitionStatus } from './entities/form-definition.entity';
import { FormField } from './entities/form-field.entity';
import { FormSubmission, type FormSubmissionFile } from './entities/form-submission.entity';
import { FormRateLimiter } from './form-rate-limiter';
import { FORM_DEFINITION_REPOSITORY, FORM_FIELD_REPOSITORY, FORM_SUBMISSION_REPOSITORY } from './forms.tokens';

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
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;
const UPLOAD_RATE_LIMIT = { limit: 12, windowMs: 10 * 60 * 1000 };
const SUBMIT_RATE_LIMIT = { limit: 6, windowMs: 10 * 60 * 1000 };

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
    private readonly storage: StorageService,
    private readonly publisher: DomainEventPublisher,
    private readonly rateLimiter: FormRateLimiter,
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
    this.rateLimiter.consume(input.rateLimitKey, UPLOAD_RATE_LIMIT.limit, UPLOAD_RATE_LIMIT.windowMs);
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
    return upload;
  }

  async submitForm(input: {
    readonly formId: FormId;
    readonly data: SubmitFormData;
    readonly rateLimitKey: string;
  }): Promise<FormSubmission> {
    this.rateLimiter.consume(input.rateLimitKey, SUBMIT_RATE_LIMIT.limit, SUBMIT_RATE_LIMIT.windowMs);
    const publicForm = await this.getPublicForm(input.formId);
    this.validateSubmission(publicForm.fields, input.data);

    const submission = await this.submissions.save(
      this.submissions.create({
        formId: input.formId,
        answers: { ...input.data.answers },
        files: [...input.data.files],
        submittedAt: new Date(),
        metadata: { ...input.data.metadata },
        targetRefType: null,
        targetRefId: null,
      }),
    );
    await this.publisher.publish({
      name: 'form.submitted',
      payload: {
        formId: input.formId,
        submissionId: toId<FormSubmissionId>(submission.id),
        target: publicForm.form.target,
      },
    });
    return submission;
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
  ): Promise<void> {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) return;
    submission.targetRefType = refType;
    submission.targetRefId = refId;
    await this.submissions.save(submission);
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
      if (!file.storageKey.startsWith(`form-submissions/${field.formId}/`)) {
        throw new ValidationFailedError('File does not belong to this form');
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
  }
}
