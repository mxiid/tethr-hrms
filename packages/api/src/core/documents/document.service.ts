import { randomUUID } from 'crypto';

import {
  toId,
  type DataClassification,
  type DocumentId,
  type DocumentSignatureStatus,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantScopedRepository } from '../tenancy/tenant-scoped.repository';

import { DocumentVersion } from './document-version.entity';
import { Document } from './document.entity';
import { DOCUMENT_REPOSITORY, DOCUMENT_VERSION_REPOSITORY } from './document.tokens';
import { StorageService } from './storage.service';

type RegisterDocumentInput = {
  readonly name: string;
  readonly contentType: string;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly classification?: DataClassification;
  readonly signatureStatus?: DocumentSignatureStatus | null;
  readonly signedAt?: Date | null;
  readonly signatureProvider?: string | null;
  readonly externalEnvelopeId?: string | null;
  readonly createdByUserId?: UserId | null;
};

type AddDocumentVersionInput = {
  readonly documentId: DocumentId;
  readonly contentType: string;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly signatureStatus?: DocumentSignatureStatus | null;
  readonly signedAt?: Date | null;
  readonly signatureProvider?: string | null;
  readonly externalEnvelopeId?: string | null;
  readonly createdByUserId?: UserId | null;
};

type PrepareDocumentUploadInput = {
  readonly name: string;
  readonly contentType: string;
  readonly storagePrefix?: string | null;
};

export type DocumentAccessHeader = {
  readonly name: string;
  readonly value: string;
};

export type DocumentAccessDescriptor = {
  readonly storageKey: string;
  readonly url: string;
  readonly method: 'GET' | 'PUT';
  readonly expiresAt: Date;
  readonly headers: readonly DocumentAccessHeader[];
};

type RequestDocumentSignatureInput = {
  readonly documentId: DocumentId;
  readonly signerEmail: string;
  readonly signerName?: string | null;
  readonly provider?: string | null;
  readonly requestedByUserId: UserId;
};

export type DocumentSignatureRequest = {
  readonly document: Document;
  readonly latestVersion: DocumentVersion;
  readonly versionCount: number;
  readonly signingUrl: string;
  readonly externalEnvelopeId: string;
  readonly signatureProvider: string;
  readonly expiresAt: Date;
};

export type DocumentRecord = {
  readonly document: Document;
  readonly latestVersion: DocumentVersion | null;
  readonly versionCount: number;
};

const ACCESS_TICKET_TTL_SECONDS = 15 * 60;
// A concurrent addVersion can allocate the same number and lose the unique
// index; the loser re-reads the winner's committed row and tries again.
const VERSION_ALLOCATION_ATTEMPTS = 3;

// Postgres unique_violation, as surfaced by TypeORM's QueryFailedError.
const isUniqueViolation = (cause: unknown): boolean => {
  const driverError = (cause as { readonly driverError?: { readonly code?: string } }).driverError;
  return (driverError?.code ?? (cause as { readonly code?: string }).code) === '23505';
};

// Published interface for document metadata and version facts. Object-storage
// bytes stay behind `storageKey`; modules receive only document IDs and this
// read model, preserving the core document ownership boundary.
@Injectable()
export class DocumentService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: TenantScopedRepository<Document>,
    @Inject(DOCUMENT_VERSION_REPOSITORY)
    private readonly versions: TenantScopedRepository<DocumentVersion>,
    private readonly storage: StorageService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async register(input: RegisterDocumentInput): Promise<Document> {
    // The document and its initial version commit together: a version failure
    // must not leave an orphaned document row behind.
    return this.dataSource.transaction(async (manager) => {
      const document = await manager.save(
        this.documents.create({
          name: input.name,
          contentType: input.contentType,
          storageKey: input.storageKey,
          sizeBytes: String(input.sizeBytes),
          classification: input.classification ?? 'internal',
        }),
      );
      await this.createVersionWithin(manager, toId<DocumentId>(document.id), 1, input);
      return document;
    });
  }

  async getById(id: string): Promise<Document> {
    const document = await this.documents.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found', { id });
    }
    return document;
  }

  async getRecordById(id: string): Promise<DocumentRecord> {
    const document = await this.getById(id);
    const [latestVersion, versionCount] = await Promise.all([
      this.getLatestVersion(toId<DocumentId>(document.id)),
      this.versions.count({
        where: { documentId: toId<DocumentId>(document.id) } as FindOptionsWhere<DocumentVersion>,
      }),
    ]);
    return { document, latestVersion, versionCount };
  }

  async addVersion(input: AddDocumentVersionInput): Promise<DocumentRecord> {
    const document = await this.getById(input.documentId);
    await this.withVersionRetry(() =>
      this.dataSource.transaction(async (manager) => {
        // Re-read the latest version inside the transaction: a concurrent
        // winner's row must be visible before this attempt allocates a number.
        const latestVersion = await this.getLatestVersionWithin(manager, input.documentId);
        const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
        await this.createVersionWithin(manager, input.documentId, nextVersionNumber, input);

        document.storageKey = input.storageKey;
        document.contentType = input.contentType;
        document.sizeBytes = String(input.sizeBytes);
        await manager.save(document);
      }),
    );
    return this.getRecordById(document.id);
  }

  async prepareUpload(input: PrepareDocumentUploadInput): Promise<DocumentAccessDescriptor> {
    const storageKey = this.buildStorageKey(input.storagePrefix ?? 'documents', input.name);
    const signed = await this.storage.createSignedUpload({
      storageKey,
      contentType: input.contentType,
    });
    return {
      storageKey: signed.storageKey,
      url: signed.url,
      method: 'PUT',
      expiresAt: signed.expiresAt,
      headers: signed.headers,
    };
  }

  async prepareDownload(documentId: DocumentId): Promise<DocumentAccessDescriptor> {
    const document = await this.getById(documentId);
    const latestVersion = await this.ensureLatestVersion(document);
    const signed = await this.storage.createSignedDownload({
      storageKey: latestVersion.storageKey,
      contentType: latestVersion.contentType,
    });
    return {
      storageKey: signed.storageKey,
      url: signed.url,
      method: 'GET',
      expiresAt: signed.expiresAt,
      headers: [],
    };
  }

  async requestSignature(input: RequestDocumentSignatureInput): Promise<DocumentSignatureRequest> {
    const document = await this.getById(input.documentId);
    const latestVersion = await this.ensureLatestVersion(document);
    const signatureProvider = input.provider?.trim() || 'manual';
    const externalEnvelopeId = `sig_${randomUUID()}`;
    latestVersion.signatureStatus = 'pending';
    latestVersion.signatureProvider = signatureProvider;
    latestVersion.externalEnvelopeId = externalEnvelopeId;
    latestVersion.signedAt = null;
    const savedVersion = await this.versions.save(latestVersion);
    const versionCount = await this.versions.count({
      where: { documentId: toId<DocumentId>(document.id) } as FindOptionsWhere<DocumentVersion>,
    });
    const expiresAt = this.expiresAt();
    const signingUrl = `hrms-signature://${encodeURIComponent(
      externalEnvelopeId,
    )}?provider=${encodeURIComponent(signatureProvider)}&signer=${encodeURIComponent(
      input.signerEmail,
    )}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}`;
    return {
      document,
      latestVersion: savedVersion,
      versionCount,
      signingUrl,
      externalEnvelopeId,
      signatureProvider,
      expiresAt,
    };
  }

  private async getLatestVersion(documentId: DocumentId): Promise<DocumentVersion | null> {
    const [latestVersion] = await this.versions.find({
      where: { documentId } as FindOptionsWhere<DocumentVersion>,
      order: { versionNumber: 'DESC' },
      take: 1,
    });
    return latestVersion ?? null;
  }

  private getLatestVersionWithin(
    manager: EntityManager,
    documentId: DocumentId,
  ): Promise<DocumentVersion | null> {
    return manager.findOne(DocumentVersion, {
      where: { documentId, organizationId: this.tenantContext.getOrganizationId() },
      order: { versionNumber: 'DESC' },
    });
  }

  // The loser of a concurrent version allocation retries after the winner's
  // transaction commits, so its re-read sees the new latest and allocates the
  // next number instead of colliding again.
  private async withVersionRetry<TResult>(work: () => Promise<TResult>): Promise<TResult> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await work();
      } catch (cause) {
        if (!isUniqueViolation(cause) || attempt >= VERSION_ALLOCATION_ATTEMPTS) {
          throw cause;
        }
      }
    }
  }

  private async ensureLatestVersion(document: Document): Promise<DocumentVersion> {
    const existing = await this.getLatestVersion(toId<DocumentId>(document.id));
    if (existing) return existing;
    return this.createVersion(toId<DocumentId>(document.id), 1, {
      name: document.name,
      contentType: document.contentType,
      storageKey: document.storageKey,
      sizeBytes: Number(document.sizeBytes),
      classification: document.classification,
    });
  }

  private createVersion(
    documentId: DocumentId,
    versionNumber: number,
    input: RegisterDocumentInput | AddDocumentVersionInput,
  ): Promise<DocumentVersion> {
    return this.versions.save(
      this.versions.create({
        documentId,
        versionNumber,
        ...this.versionFields(input),
      }),
    );
  }

  private createVersionWithin(
    manager: EntityManager,
    documentId: DocumentId,
    versionNumber: number,
    input: RegisterDocumentInput | AddDocumentVersionInput,
  ): Promise<DocumentVersion> {
    return manager.save(
      manager.create(DocumentVersion, {
        organizationId: this.tenantContext.getOrganizationId(),
        documentId,
        versionNumber,
        ...this.versionFields(input),
      }),
    );
  }

  private versionFields(input: RegisterDocumentInput | AddDocumentVersionInput): {
    readonly storageKey: string;
    readonly contentType: string;
    readonly sizeBytes: string;
    readonly signatureStatus: DocumentSignatureStatus;
    readonly signedAt: Date | null;
    readonly signatureProvider: string | null;
    readonly externalEnvelopeId: string | null;
    readonly createdByUserId: UserId | null;
  } {
    return {
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: String(input.sizeBytes),
      signatureStatus: input.signatureStatus ?? 'notRequired',
      signedAt: input.signedAt ?? null,
      signatureProvider: input.signatureProvider ?? null,
      externalEnvelopeId: input.externalEnvelopeId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    };
  }

  private buildStorageKey(storagePrefix: string, name: string): string {
    const safePrefix = storagePrefix
      .split('/')
      .filter(Boolean)
      .map((segment) => this.safeStorageSegment(segment))
      .join('/');
    return `${safePrefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${this.safeStorageSegment(
      name,
    )}`;
  }

  private safeStorageSegment(value: string): string {
    const safe = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return safe || 'file';
  }

  private expiresAt(): Date {
    return new Date(Date.now() + ACCESS_TICKET_TTL_SECONDS * 1000);
  }
}
