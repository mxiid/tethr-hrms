import { signLocalStorageToken, verifyLocalStorageToken } from './local-storage.signing';

const SECRET = 'test-secret-that-is-at-least-32-characters';
const KEY = 'documents/2026-09-14/abc-file.pdf';
const TYPE = 'application/pdf';

describe('local storage link signing', () => {
  it('round-trips a signed upload link', () => {
    const expiresAtMs = Date.now() + 60_000;
    const token = signLocalStorageToken(SECRET, 'upload', KEY, TYPE, expiresAtMs);

    expect(
      verifyLocalStorageToken({
        secret: SECRET,
        token,
        action: 'upload',
        storageKey: KEY,
        contentType: TYPE,
      }),
    ).toEqual({ expiresAtMs });
  });

  it('rejects the token for a different action', () => {
    const token = signLocalStorageToken(SECRET, 'upload', KEY, TYPE, Date.now() + 60_000);

    expect(
      verifyLocalStorageToken({
        secret: SECRET,
        token,
        action: 'download',
        storageKey: KEY,
        contentType: TYPE,
      }),
    ).toBeNull();
  });

  it('rejects a swapped storage key', () => {
    const token = signLocalStorageToken(SECRET, 'upload', KEY, TYPE, Date.now() + 60_000);

    expect(
      verifyLocalStorageToken({
        secret: SECRET,
        token,
        action: 'upload',
        storageKey: 'documents/2026-09-14/other-file.pdf',
        contentType: TYPE,
      }),
    ).toBeNull();
  });

  it('rejects a swapped content type', () => {
    const token = signLocalStorageToken(SECRET, 'upload', KEY, TYPE, Date.now() + 60_000);

    expect(
      verifyLocalStorageToken({
        secret: SECRET,
        token,
        action: 'upload',
        storageKey: KEY,
        contentType: 'text/html',
      }),
    ).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signLocalStorageToken(SECRET, 'download', KEY, TYPE, Date.now() - 1_000);

    expect(
      verifyLocalStorageToken({
        secret: SECRET,
        token,
        action: 'download',
        storageKey: KEY,
        contentType: TYPE,
      }),
    ).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(
      verifyLocalStorageToken({
        secret: SECRET,
        token: 'not-a-token',
        action: 'upload',
        storageKey: KEY,
        contentType: TYPE,
      }),
    ).toBeNull();
  });
});
