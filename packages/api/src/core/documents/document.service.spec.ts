import { toId, type DocumentId, type OrganizationId, type UserId } from '@hrms/shared';
import type { FindManyOptions } from 'typeorm';

import type { TenantScopedRepository } from '../tenancy/tenant-scoped.repository';

import { DocumentVersion } from './document-version.entity';
import { Document } from './document.entity';
import { DocumentService } from './document.service';
import type { StorageService } from './storage.service';

const ORGANIZATION = toId<OrganizationId>('org-1');
const DOCUMENT = toId<DocumentId>('document-1');
const USER = toId<UserId>('user-1');

const makeDocument = (): Document => ({
  id: DOCUMENT,
  organizationId: ORGANIZATION,
  name: 'Contract.pdf',
  contentType: 'application/pdf',
  storageKey: 'employees/employee-1/contract.pdf',
  sizeBytes: '1200',
  classification: 'confidential',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const makeVersion = (versionNumber: number, storageKey: string): DocumentVersion => ({
  id: `version-${versionNumber}`,
  organizationId: ORGANIZATION,
  documentId: DOCUMENT,
  versionNumber,
  storageKey,
  contentType: 'application/pdf',
  sizeBytes: '1200',
  signatureStatus: 'notRequired',
  signedAt: null,
  signatureProvider: null,
  externalEnvelopeId: null,
  createdByUserId: USER,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const buildService = () => {
  let currentDocument = makeDocument();
  const savedVersions: DocumentVersion[] = [];
  const documents = {
    create: jest.fn((value: Partial<Document>) => ({ ...currentDocument, ...value })),
    save: jest.fn((value: Document) => {
      currentDocument = { ...currentDocument, ...value };
      return Promise.resolve(currentDocument);
    }),
    findById: jest.fn((id: string) => Promise.resolve(id === DOCUMENT ? currentDocument : null)),
  } as unknown as TenantScopedRepository<Document>;
  const versions = {
    create: jest.fn((value: Partial<DocumentVersion>) => ({
      ...makeVersion(value.versionNumber ?? 1, value.storageKey ?? ''),
      ...value,
    })),
    save: jest.fn((value: DocumentVersion) => {
      const existingIndex = savedVersions.findIndex((version) => version.id === value.id);
      if (existingIndex >= 0) {
        savedVersions[existingIndex] = value;
      } else {
        savedVersions.push(value);
      }
      return Promise.resolve(value);
    }),
    find: jest.fn((options: FindManyOptions<DocumentVersion>) => {
      const where = options.where as { documentId?: DocumentId } | undefined;
      const rows = savedVersions
        .filter((version) => version.documentId === where?.documentId)
        .sort((left, right) => right.versionNumber - left.versionNumber);
      return Promise.resolve(typeof options.take === 'number' ? rows.slice(0, options.take) : rows);
    }),
    count: jest.fn((options: FindManyOptions<DocumentVersion>) => {
      const where = options.where as { documentId?: DocumentId } | undefined;
      return Promise.resolve(
        savedVersions.filter((version) => version.documentId === where?.documentId).length,
      );
    }),
  } as unknown as TenantScopedRepository<DocumentVersion>;

  const storage = {
    createSignedUpload: jest.fn((input: { storageKey: string; contentType: string }) =>
      Promise.resolve({
        storageKey: input.storageKey,
        url: `https://storage.test/upload/${encodeURIComponent(input.storageKey)}`,
        method: 'PUT' as const,
        headers: [{ name: 'Content-Type', value: input.contentType }],
        expiresAt: new Date('2026-01-01T00:15:00.000Z'),
      }),
    ),
    createSignedDownload: jest.fn((input: { storageKey: string; contentType: string }) =>
      Promise.resolve({
        storageKey: input.storageKey,
        url: `https://storage.test/download/${encodeURIComponent(input.storageKey)}`,
        expiresAt: new Date('2026-01-01T00:15:00.000Z'),
      }),
    ),
  } as unknown as StorageService;

  return {
    documents,
    savedVersions,
    storage,
    service: new DocumentService(documents, versions, storage),
  };
};

describe('DocumentService', () => {
  it('registers a document with an initial version and signature metadata', async () => {
    const { savedVersions, service } = buildService();

    await service.register({
      name: 'Contract.pdf',
      contentType: 'application/pdf',
      storageKey: 'employees/employee-1/contract.pdf',
      sizeBytes: 1200,
      classification: 'confidential',
      signatureStatus: 'signed',
      signedAt: new Date('2026-07-01T00:00:00.000Z'),
      signatureProvider: 'DocuSign',
      externalEnvelopeId: 'env-1',
      createdByUserId: USER,
    });

    expect(savedVersions).toHaveLength(1);
    expect(savedVersions[0]).toMatchObject({
      versionNumber: 1,
      signatureStatus: 'signed',
      signatureProvider: 'DocuSign',
    });
  });

  it('adds a newer version and updates the latest document pointer', async () => {
    const { documents, savedVersions, service } = buildService();
    savedVersions.push(makeVersion(1, 'employees/employee-1/contract.pdf'));

    const record = await service.addVersion({
      documentId: DOCUMENT,
      contentType: 'application/pdf',
      storageKey: 'employees/employee-1/contract-v2.pdf',
      sizeBytes: 1600,
      signatureStatus: 'pending',
      createdByUserId: USER,
    });

    expect(record.latestVersion?.versionNumber).toBe(2);
    expect(record.versionCount).toBe(2);
    expect(documents.save).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'employees/employee-1/contract-v2.pdf' }),
    );
  });

  it('prepares upload and download access descriptors from signed URLs', async () => {
    const { savedVersions, service } = buildService();
    savedVersions.push(makeVersion(1, 'employees/employee-1/contract.pdf'));

    const upload = await service.prepareUpload({
      name: 'Signed Contract.pdf',
      contentType: 'application/pdf',
      storagePrefix: 'employees/employee-1',
    });
    const download = await service.prepareDownload(DOCUMENT);

    expect(upload.method).toBe('PUT');
    expect(upload.storageKey).toContain('employees/employee-1/');
    expect(upload.url).toContain('https://storage.test/upload/');
    expect(upload.headers).toContainEqual({ name: 'Content-Type', value: 'application/pdf' });
    expect(download).toMatchObject({
      method: 'GET',
      storageKey: 'employees/employee-1/contract.pdf',
      url: 'https://storage.test/download/employees%2Femployee-1%2Fcontract.pdf',
    });
  });

  it('requests a signature envelope against the latest document version', async () => {
    const { savedVersions, service } = buildService();
    savedVersions.push(makeVersion(1, 'employees/employee-1/contract.pdf'));

    const request = await service.requestSignature({
      documentId: DOCUMENT,
      signerEmail: 'employee@example.com',
      signerName: 'Employee One',
      provider: 'manual',
      requestedByUserId: USER,
    });

    expect(request.latestVersion.signatureStatus).toBe('pending');
    expect(request.signatureProvider).toBe('manual');
    expect(request.externalEnvelopeId).toMatch(/^sig_/);
    expect(request.signingUrl).toContain('employee%40example.com');
  });
});
