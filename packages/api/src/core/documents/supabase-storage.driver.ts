import { ValidationFailedError } from '../../common/errors';
import type { ConfigService } from '../config/config.service';

import type {
  CreateSignedDownloadInput,
  CreateSignedUploadInput,
  SignedDownload,
  SignedUpload,
  StoredObjectInfo,
  StorageDriver,
} from './storage.driver';

type SupabaseSignResponse = {
  readonly url?: string;
  readonly signedURL?: string;
};

// Supabase Storage over its REST API — deliberately not the SDK: the shape we
// need is two signed-URL endpoints, and keeping it as fetch keeps the API's
// dependency list untouched. Requires the service-role key (bypasses RLS by
// design; the bucket itself stays private — every read is a short-lived signed
// URL minted here, and the key never leaves the server).
export class SupabaseStorageDriver implements StorageDriver {
  constructor(private readonly config: ConfigService) {}

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUpload> {
    const body = await this.post(
      `/object/upload/sign/${this.bucketPath(input.storageKey)}`,
      {},
      'create an upload link',
    );
    const url = this.absolute(body.url);
    return {
      storageKey: input.storageKey,
      url,
      method: 'PUT',
      headers: [{ name: 'Content-Type', value: input.contentType }],
      expiresAt: new Date(Date.now() + this.ttlSeconds() * 1000),
    };
  }

  async createSignedDownload(input: CreateSignedDownloadInput): Promise<SignedDownload> {
    const body = await this.post(
      `/object/sign/${this.bucketPath(input.storageKey)}`,
      { expiresIn: this.ttlSeconds() },
      'create a download link',
    );
    return {
      storageKey: input.storageKey,
      url: this.absolute(body.signedURL ?? body.url),
      expiresAt: new Date(Date.now() + this.ttlSeconds() * 1000),
    };
  }

  // Object metadata (`size`) for verification; a missing object is null rather
  // than an error — Supabase answers 400/404 depending on the endpoint version.
  async statObject(storageKey: string): Promise<StoredObjectInfo | null> {
    const serviceKey = this.serviceKey();
    const response = await fetch(`${this.baseUrl()}/object/info/${this.bucketPath(storageKey)}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404 || response.status === 400) {
      return null;
    }
    if (!response.ok) {
      throw new ValidationFailedError('Object storage could not stat the object', {
        status: response.status,
      });
    }
    const body = (await response.json()) as { size?: number; metadata?: { size?: number } };
    const size = body.size ?? body.metadata?.size;
    return typeof size === 'number' ? { sizeBytes: size } : null;
  }

  private async post(path: string, payload: unknown, action: string): Promise<SupabaseSignResponse> {
    const serviceKey = this.serviceKey();
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ValidationFailedError(`Object storage could not ${action}`, {
        status: response.status,
        detail: detail.slice(0, 500),
      });
    }
    return (await response.json()) as SupabaseSignResponse;
  }

  private baseUrl(): string {
    const url = this.config.get('SUPABASE_URL');
    if (!url) {
      throw new ValidationFailedError('SUPABASE_URL is not configured');
    }
    return `${url.replace(/\/+$/, '')}/storage/v1`;
  }

  private serviceKey(): string {
    const key = this.config.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!key) {
      throw new ValidationFailedError('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    return key;
  }

  private bucketPath(storageKey: string): string {
    const bucket = this.config.get('SUPABASE_STORAGE_BUCKET');
    const key = storageKey
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return `${bucket}/${key}`;
  }

  // Supabase returns paths relative to /storage/v1; the browser needs absolute.
  private absolute(returned: string | undefined): string {
    if (!returned) {
      throw new ValidationFailedError('Object storage returned no signed URL');
    }
    if (returned.startsWith('http')) return returned;
    return `${this.baseUrl()}${returned.startsWith('/') ? '' : '/'}${returned}`;
  }

  private ttlSeconds(): number {
    return this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS');
  }
}
