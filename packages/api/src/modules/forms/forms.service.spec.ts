import { toId, type FormId, type OrganizationId } from '@hrms/shared';

import type { StorageService } from '../../core/documents/storage.service';
import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { RateLimiterService } from '../../core/security/rate-limiter.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { FormDefinition } from './entities/form-definition.entity';
import { FormField } from './entities/form-field.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { FormUploadTicket } from './entities/form-upload-ticket.entity';
import { FormsService } from './forms.service';

const ORGANIZATION = toId<OrganizationId>('org-1');
const FORM = toId<FormId>('form-1');

const makeField = (overrides: Partial<FormField>): FormField =>
  ({
    id: `field-${overrides.fieldKey ?? 'x'}`,
    organizationId: ORGANIZATION,
    formId: FORM,
    fieldKey: 'fullName',
    label: 'Full name',
    type: 'text',
    required: false,
    options: [],
    sortOrder: 0,
    mapsTo: null,
    helpText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as FormField;

const buildService = (
  options: {
    existingForm?: FormDefinition | null;
    fields?: FormField[];
    ticket?: Partial<FormUploadTicket> | null;
    storedObject?: { sizeBytes: number } | null;
  } = {},
) => {
  const forms = {
    find: jest.fn().mockResolvedValue(options.existingForm ? [options.existingForm] : []),
    findOne: jest.fn().mockResolvedValue(options.existingForm ?? null),
    findById: jest.fn().mockImplementation((id: string) =>
      Promise.resolve(
        options.existingForm && options.existingForm.id === id ? options.existingForm : null,
      ),
    ),
    create: jest.fn((value: unknown) => ({ id: FORM, createdAt: new Date(), ...(value as object) })),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<FormDefinition>;
  const fields = {
    find: jest.fn().mockResolvedValue(options.fields ?? []),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve({ id: 'field-1', ...(value as object) })),
  } as unknown as TenantScopedRepository<FormField>;
  const submissions = {
    create: jest.fn((value: unknown) => ({ id: 'submission-1', ...(value as object) })),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<FormSubmission>;
  const tickets = {
    findOne: jest.fn().mockResolvedValue(options.ticket ?? null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<FormUploadTicket>;
  const manager = {
    create: jest.fn((_entity: unknown, value: unknown) => ({ id: 'submission-1', ...(value as object) })),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
  };
  const dataSource = {
    transaction: jest.fn((work: (inner: unknown) => Promise<unknown>) => work(manager)),
  };
  const tenantContext = { getOrganizationId: jest.fn().mockReturnValue(ORGANIZATION) };
  const storage = {
    createSignedUpload: jest.fn().mockResolvedValue({
      storageKey: 'form-submissions/form-1/file.pdf',
      url: 'https://storage.test/upload',
      method: 'PUT',
      headers: [{ name: 'Content-Type', value: 'application/pdf' }],
      expiresAt: new Date('2026-01-01T00:15:00.000Z'),
    }),
    statObject: jest
      .fn()
      .mockImplementation((storageKey: string) =>
        Promise.resolve(
          options.storedObject === undefined
            ? storageKey.startsWith('form-submissions/')
              ? { sizeBytes: 2048 }
              : null
            : options.storedObject,
        ),
      ),
  } as unknown as StorageService;
  const publisher = {
    publish: jest.fn().mockResolvedValue(undefined),
    publishWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainEventPublisher;
  const rateLimiter = new RateLimiterService();
  const config = {
    get: jest.fn((key: string) => (key === 'FORM_SUBMIT_LIMIT_PER_10_MIN' ? 10 : 30)),
  };

  return {
    service: new FormsService(
      forms,
      fields,
      submissions,
      tickets,
      dataSource as never,
      tenantContext as never,
      storage,
      publisher,
      rateLimiter,
      config as never,
    ),
    forms,
    fields,
    submissions,
    tickets,
    manager,
    dataSource,
    storage,
    publisher,
    rateLimiter,
  };
};

describe('FormsService', () => {
  it('creates a form with ordered fields and projection targets', async () => {
    const { service, fields } = buildService();

    const record = await service.createForm({
      name: 'Application form',
      slug: 'application',
      target: 'application',
      status: 'published',
      fields: [
        { fieldKey: 'fullName', label: 'Full name', type: 'text', required: true, mapsTo: 'candidate.fullName' },
        { fieldKey: 'email', label: 'Email', type: 'email', required: true, mapsTo: 'candidate.email' },
      ],
    });

    expect(record.form.slug).toBe('application');
    expect(record.fields).toHaveLength(2);
    expect(fields.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sortOrder: 0, mapsTo: 'candidate.fullName', required: true }),
    );
    expect(fields.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ sortOrder: 1 }));
  });

  it('rejects malformed field definitions', async () => {
    const { service } = buildService();

    await expect(
      service.createForm({
        name: 'Broken',
        slug: 'broken',
        fields: [{ fieldKey: 'Bad Key', label: 'Bad', type: 'text' }],
      }),
    ).rejects.toThrow('camelCase');
    await expect(
      service.createForm({
        name: 'Broken',
        slug: 'broken',
        fields: [{ fieldKey: 'choice', label: 'Choice', type: 'select', options: [] }],
      }),
    ).rejects.toThrow('at least one option');
  });

  it('seeds the application form once and reuses it afterwards', async () => {
    const fresh = buildService();
    const created = await fresh.service.ensureApplicationForm();
    expect(created.fields).toHaveLength(14);
    expect(created.fields[5].fieldKey).toBe('resume');
    expect(created.fields[5].type).toBe('file');
    expect(created.fields[0].mapsTo).toBe('candidate.fullName');

    const existing = buildService({
      existingForm: {
        id: FORM,
        organizationId: ORGANIZATION,
        name: 'Application form',
        slug: 'application',
        status: 'published',
        target: 'application',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as FormDefinition,
      fields: [makeField({ fieldKey: 'fullName' })],
    });
    const reused = await existing.service.ensureApplicationForm();
    expect(reused.fields).toHaveLength(1);
    expect(existing.forms.create).not.toHaveBeenCalled();
  });

  it('validates required answers and publishes form.submitted', async () => {
    const published = {
      id: FORM,
      organizationId: ORGANIZATION,
      name: 'Application form',
      slug: 'application',
      status: 'published' as const,
      target: 'application' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FormDefinition;
    const { service, manager, publisher } = buildService({
      existingForm: published,
      fields: [
        makeField({ fieldKey: 'fullName', label: 'Full name', required: true }),
        makeField({ fieldKey: 'email', label: 'Email', required: true, type: 'email', sortOrder: 1 }),
      ],
    });

    await expect(
      service.submitForm({
        formId: FORM,
        data: { answers: { fullName: 'Ada' }, files: [], metadata: {} },
        rateLimitKey: 'test',
      }),
    ).rejects.toThrow('Email is required');

    const submission = await service.submitForm({
      formId: FORM,
      data: {
        answers: { fullName: 'Ada', email: 'ada@example.com' },
        files: [],
        metadata: { ip: '127.0.0.1' },
      },
      rateLimitKey: 'test',
    });

    expect(submission.id).toBe('submission-1');
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ formId: FORM, answers: { fullName: 'Ada', email: 'ada@example.com' } }),
    );
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        name: 'form.submitted',
        payload: expect.objectContaining({ formId: FORM, target: 'application' }),
      }),
    );
  });

  it('refuses a malformed email before the submission is stored', async () => {
    const published = {
      id: FORM,
      organizationId: ORGANIZATION,
      name: 'Application form',
      slug: 'application',
      status: 'published' as const,
      target: 'application' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FormDefinition;
    const { service, manager, publisher } = buildService({
      existingForm: published,
      fields: [
        makeField({ fieldKey: 'fullName', label: 'Full name', required: true }),
        makeField({ fieldKey: 'email', label: 'Email', required: true, type: 'email', sortOrder: 1 }),
      ],
    });

    await expect(
      service.submitForm({
        formId: FORM,
        data: { answers: { fullName: 'Ada', email: 'not-an-email' }, files: [], metadata: {} },
        rateLimitKey: 'test',
      }),
    ).rejects.toThrow('Email must be a valid email address');
    expect(manager.save).not.toHaveBeenCalled();
    expect(publisher.publishWithin).not.toHaveBeenCalled();
  });

  it('keeps accepting the dotted-domain shapes the previous pattern accepted', async () => {
    const published = {
      id: FORM,
      organizationId: ORGANIZATION,
      name: 'Application form',
      slug: 'application',
      status: 'published' as const,
      target: 'application' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FormDefinition;
    const { service } = buildService({
      existingForm: published,
      fields: [
        makeField({ fieldKey: 'fullName', label: 'Full name', required: true }),
        makeField({ fieldKey: 'email', label: 'Email', required: true, type: 'email', sortOrder: 1 }),
      ],
    });

    const submission = await service.submitForm({
      formId: FORM,
      data: { answers: { fullName: 'Ada', email: 'a@b..c' }, files: [], metadata: {} },
      rateLimitKey: 'test',
    });

    expect(submission.id).toBe('submission-1');
  });

  it('refuses files that were not uploaded through this form', async () => {
    const published = {
      id: FORM,
      organizationId: ORGANIZATION,
      name: 'Application form',
      slug: 'application',
      status: 'published' as const,
      target: 'application' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FormDefinition;
    const { service } = buildService({
      existingForm: published,
      fields: [makeField({ fieldKey: 'resume', type: 'file', required: true })],
      ticket: null,
    });

    await expect(
      service.submitForm({
        formId: FORM,
        data: {
          answers: {},
          files: [
            {
              fieldKey: 'resume',
              storageKey: 'form-submissions/form-1/cv.pdf',
              fileName: 'cv.pdf',
              contentType: 'application/pdf',
              sizeBytes: 2048,
            },
          ],
          metadata: {},
        },
        rateLimitKey: 'test',
      }),
    ).rejects.toThrow('was not uploaded through this form');
  });

  it('refuses a file whose bytes are not in storage', async () => {
    const published = {
      id: FORM,
      organizationId: ORGANIZATION,
      name: 'Application form',
      slug: 'application',
      status: 'published' as const,
      target: 'application' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FormDefinition;
    const { service } = buildService({
      existingForm: published,
      fields: [makeField({ fieldKey: 'resume', type: 'file', required: true })],
      ticket: {
        id: 'ticket-1',
        formId: FORM,
        fieldKey: 'resume',
        storageKey: 'form-submissions/form-1/cv.pdf',
        sizeBytes: '2048',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      } as unknown as FormUploadTicket,
      storedObject: null,
    });

    await expect(
      service.submitForm({
        formId: FORM,
        data: {
          answers: {},
          files: [
            {
              fieldKey: 'resume',
              storageKey: 'form-submissions/form-1/cv.pdf',
              fileName: 'cv.pdf',
              contentType: 'application/pdf',
              sizeBytes: 2048,
            },
          ],
          metadata: {},
        },
        rateLimitKey: 'test',
      }),
    ).rejects.toThrow('was not found in storage');
  });

  it('limits repeated submissions per key', () => {
    const limiter = new RateLimiterService();
    for (let index = 0; index < 6; index += 1) {
      limiter.consume('form:ip', 6, 60_000, 'Too many submissions');
    }
    expect(() => limiter.consume('form:ip', 6, 60_000, 'Too many submissions')).toThrow(
      'Too many submissions',
    );
    expect(() => limiter.consume('form:other-ip', 6, 60_000)).not.toThrow();
  });
});
