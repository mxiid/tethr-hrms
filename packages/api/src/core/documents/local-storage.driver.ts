import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { ForbiddenError } from '../../common/errors';
import type { ConfigService } from '../config/config.service';

import { signLocalStorageToken } from './local-storage.signing';
import type {
  CreateSignedDownloadInput,
  CreateSignedUploadInput,
  SignedDownload,
  SignedUpload,
  StoredObjectInfo,
  StorageDriver,
} from './storage.driver';

// The dev driver writes objects under the API's working directory and mints
// links to LocalStorageController. It exists so the full upload/download flow
// is exercisable before a real bucket is provisioned; config validation
// refuses it in production. The signing secret is the JWT secret — both are
// server-only signing secrets, and rotating that secret invalidates both.
const STORAGE_ROOT = '.local-storage';

export const encodeLocalStorageKey = (storageKey: string): string =>
  Buffer.from(storageKey, 'utf8').toString('base64url');

export const decodeLocalStorageKey = (encoded: string | undefined): string | null => {
  if (!encoded) return null;
  try {
    const key = Buffer.from(encoded, 'base64url').toString('utf8');
    if (key.length === 0 || key.includes('..') || key.startsWith('/')) return null;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key)) return null;
    return key;
  } catch {
    return null;
  }
};

export const resolveLocalStoragePath = (storageKey: string): string => {
  const root = resolve(process.cwd(), STORAGE_ROOT);
  const filePath = resolve(root, storageKey);
  if (!filePath.startsWith(`${root}${sep}`)) {
    throw new ForbiddenError('Invalid storage key');
  }
  return filePath;
};

export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly config: ConfigService) {}

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUpload> {
    const expiresAtMs = this.expiresAtMs();
    const token = signLocalStorageToken(
      this.secret(),
      'upload',
      input.storageKey,
      input.contentType,
      expiresAtMs,
    );
    return {
      storageKey: input.storageKey,
      url: `${this.baseUrl()}/storage/local/upload?key=${encodeLocalStorageKey(
        input.storageKey,
      )}&token=${encodeURIComponent(token)}`,
      method: 'PUT',
      headers: [{ name: 'Content-Type', value: input.contentType }],
      expiresAt: new Date(expiresAtMs),
    };
  }

  async createSignedDownload(input: CreateSignedDownloadInput): Promise<SignedDownload> {
    const expiresAtMs = this.expiresAtMs();
    const token = signLocalStorageToken(
      this.secret(),
      'download',
      input.storageKey,
      input.contentType,
      expiresAtMs,
    );
    return {
      storageKey: input.storageKey,
      url: `${this.baseUrl()}/storage/local/download?key=${encodeLocalStorageKey(
        input.storageKey,
      )}&contentType=${encodeURIComponent(input.contentType)}&token=${encodeURIComponent(token)}`,
      expiresAt: new Date(expiresAtMs),
    };
  }

  private baseUrl(): string {
    const configured = this.config.get('PUBLIC_API_URL');
    return configured ?? `http://localhost:${this.config.get('PORT')}`;
  }

  async statObject(storageKey: string): Promise<StoredObjectInfo | null> {
    try {
      const info = await stat(resolveLocalStoragePath(storageKey));
      return info.isFile() ? { sizeBytes: info.size } : null;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  private secret(): string {
    return this.config.get('JWT_SECRET');
  }

  private expiresAtMs(): number {
    return Date.now() + this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS') * 1000;
  }
}
