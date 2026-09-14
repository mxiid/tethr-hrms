import type { ConfigService } from '../config/config.service';

import { StorageService } from './storage.service';

const buildConfig = (values: Record<string, unknown>): ConfigService =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

describe('StorageService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mints local dev links that point at the API storage routes', async () => {
    const service = new StorageService(
      buildConfig({
        STORAGE_DRIVER: 'local',
        PUBLIC_API_URL: 'http://localhost:3001',
        PORT: 3001,
        JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
        STORAGE_SIGNED_URL_TTL_SECONDS: 900,
      }),
    );

    const upload = await service.createSignedUpload({
      storageKey: 'documents/2026-09-14/file.pdf',
      contentType: 'application/pdf',
    });
    const download = await service.createSignedDownload({
      storageKey: 'documents/2026-09-14/file.pdf',
      contentType: 'application/pdf',
    });

    expect(service.activeDriver).toBe('local');
    expect(upload.url).toContain('http://localhost:3001/storage/local/upload?');
    expect(upload.headers).toEqual([{ name: 'Content-Type', value: 'application/pdf' }]);
    expect(download.url).toContain('http://localhost:3001/storage/local/download?');
  });

  it('mints Supabase signed URLs absolute against the project URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: '/object/upload/sign/hrms-documents/key.pdf?token=up' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ signedURL: '/object/sign/hrms-documents/key.pdf?token=down' }),
      });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const service = new StorageService(
      buildConfig({
        STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        SUPABASE_STORAGE_BUCKET: 'hrms-documents',
        STORAGE_SIGNED_URL_TTL_SECONDS: 900,
      }),
    );

    const upload = await service.createSignedUpload({
      storageKey: 'documents/2026-09-14/file.pdf',
      contentType: 'application/pdf',
    });
    const download = await service.createSignedDownload({
      storageKey: 'documents/2026-09-14/file.pdf',
      contentType: 'application/pdf',
    });

    expect(upload.url).toBe(
      'https://project.supabase.co/storage/v1/object/upload/sign/hrms-documents/key.pdf?token=up',
    );
    expect(download.url).toBe(
      'https://project.supabase.co/storage/v1/object/sign/hrms-documents/key.pdf?token=down',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/upload/sign/hrms-documents/documents/2026-09-14/file.pdf',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer service-role-key' }),
      }),
    );
  });

  it('surfaces a storage failure as a domain error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as Response);

    const service = new StorageService(
      buildConfig({
        STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        SUPABASE_STORAGE_BUCKET: 'hrms-documents',
        STORAGE_SIGNED_URL_TTL_SECONDS: 900,
      }),
    );

    await expect(
      service.createSignedUpload({ storageKey: 'key.pdf', contentType: 'application/pdf' }),
    ).rejects.toThrow('could not create an upload link');
  });
});
