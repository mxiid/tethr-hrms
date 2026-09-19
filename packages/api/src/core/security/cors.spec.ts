import { DEV_CORS_ORIGINS, parseCorsOrigins } from './cors';

describe('parseCorsOrigins', () => {
  it('parses a comma-separated allowlist and trims entries', () => {
    expect(parseCorsOrigins('https://app.example.com, https://admin.example.com', 'production')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('falls back to the dev origins outside production', () => {
    expect(parseCorsOrigins(undefined, 'development')).toEqual([...DEV_CORS_ORIGINS]);
    expect(parseCorsOrigins('', 'test')).toEqual([...DEV_CORS_ORIGINS]);
  });

  it('never reflects an arbitrary origin in production', () => {
    expect(parseCorsOrigins(undefined, 'production')).toEqual([]);
    expect(parseCorsOrigins(' , ', 'production')).toEqual([]);
  });
});
