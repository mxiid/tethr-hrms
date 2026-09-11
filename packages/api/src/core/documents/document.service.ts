import { randomUUID } from 'crypto';

import {
  toId,
  type DataClassification,
  type DocumentId,
  type DocumentSignatureStatus,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { TenantScopedRepository } from '../tenancy/tenant-scoped.repository';

import { DocumentVersion } from './document-version.entity';
import { Document } from './document.entity';
import { DOCUMENT_REPOSITORY, DOCUMENT_VERSION_REPOSITORY } from './document.tokens';

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

// Published interface for document metadata and version facts. Object-storage
// bytes stay behind `storageKey`; modules receive only document IDs and this
// read model, preserving the core document ownership boundary.
@Injectable()
export class DocumentService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: TenantScopedRepository<Document>,
    @Inject(DOCUMENT_VERSION_REPOSITORY)
    private readonly versions: TenantScopedRepository<DocumentVersion>,
  ) {}

  async register(input: RegisterDocumentInput): Promise<Document> {
    const document = this.documents.create({
      name: input.name,
      contentType: input.contentType,
      storageKey: input.storageKey,
      sizeBytes: String(input.sizeBytes),
      classification: input.classification ?? 'internal',
    });
    const saved = await this.documents.save(document);
    await this.createVersion(toId<DocumentId>(saved.id), 1, input);
    return saved;
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
    const latestVersion = await this.getLatestVersion(input.documentId);
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
    await this.createVersion(input.documentId, nextVersionNumber, input);

    document.storageKey = input.storageKey;
    document.contentType = input.contentType;
    document.sizeBytes = String(input.sizeBytes);
    await this.documents.save(document);
    return this.getRecordById(document.id);
  }

  prepareUpload(input: PrepareDocumentUploadInput): DocumentAccessDescriptor {
    const storageKey = this.buildStorageKey(input.storagePrefix ?? 'documents', input.name);
    return this.buildAccessDescriptor({
      action: 'upload',
      method: 'PUT',
      storageKey,
      headers: [{ name: 'Content-Type', value: input.contentType }],
    });
  }

  async prepareDownload(documentId: DocumentId): Promise<DocumentAccessDescriptor> {
    const document = await this.getById(documentId);
    const latestVersion = await this.ensureLatestVersion(document);
    return this.buildAccessDescriptor({
      action: 'download',
      method: 'GET',
      storageKey: latestVersion.storageKey,
      headers: [],
    });
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
        storageKey: input.storageKey,
        contentType: input.contentType,
        sizeBytes: String(input.sizeBytes),
        signatureStatus: input.signatureStatus ?? 'notRequired',
        signedAt: input.signedAt ?? null,
        signatureProvider: input.signatureProvider ?? null,
        externalEnvelopeId: input.externalEnvelopeId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      }),
    );
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

  private buildAccessDescriptor(input: {
    readonly action: 'upload' | 'download';
    readonly method: 'GET' | 'PUT';
    readonly storageKey: string;
    readonly headers: readonly DocumentAccessHeader[];
  }): DocumentAccessDescriptor {
    const expiresAt = this.expiresAt();
    return {
      storageKey: input.storageKey,
      url: `hrms-document://${input.action}/${encodeURIComponent(
        input.storageKey,
      )}?expiresAt=${encodeURIComponent(expiresAt.toISOString())}`,
      method: input.method,
      expiresAt,
      headers: input.headers,
    };
  }

  private expiresAt(): Date {
    return new Date(Date.now() + ACCESS_TICKET_TTL_SECONDS * 1000);
  }
}
