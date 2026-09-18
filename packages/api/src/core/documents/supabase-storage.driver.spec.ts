import type { ConfigService } from '../config/config.service';

import { SupabaseStorageDriver } from './supabase-storage.driver';

const buildConfig = (): ConfigService =>
  ({
    get: jest.fn((key: string) => {
      switch (key) {
        case 'SUPABASE_URL':
          return 'https://project.supabase.co';
        case 'SUPABASE_SERVICE_ROLE_KEY':
          return 'service-role-key';
        case 'SUPABASE_STORAGE_BUCKET':
          return 'hrms-documents';
        case 'STORAGE_SIGNED_URL_TTL_SECONDS':
          return 900;
        default:
          return undefined;
      }
    }),
  }) as unknown as ConfigService;

describe('SupabaseStorageDriver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('bounds signed-URL requests with a timeout signal', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: '/object/sign/bucket/key?token=x' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const driver = new SupabaseStorageDriver(buildConfig());

    await driver.createSignedUpload({
      storageKey: 'documents/contract.pdf',
      contentType: 'application/pdf',
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
