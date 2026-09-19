import type { AuthSession } from './authState';
import { AUTH_STORAGE_KEY, readStoredSession, writeStoredSession } from './authState';

const session: AuthSession = {
  token: 'token-1',
  user: {
    id: 'user-1',
    email: 'person@acme.test',
    organizationId: 'org-1',
    status: 'active',
    employeeId: null,
    roleKeys: ['clientAdmin'],
    portal: 'client',
  },
};

const installStorage = (initial: Record<string, string> = {}): Map<string, string> => {
  const store = new Map<string, string>(Object.entries(initial));
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    },
  });
  return store;
};

describe('readStoredSession', () => {
  it('reads a valid session', () => {
    installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify(session) });

    expect(readStoredSession()).toEqual(session);
  });

  it('treats a corrupt value as logged out and clears it', () => {
    const store = installStorage({ [AUTH_STORAGE_KEY]: '{not-json' });

    expect(readStoredSession()).toBeNull();
    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });

  it('rejects a shape that is not a session and clears it', () => {
    const store = installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify({ token: 42 }) });

    expect(readStoredSession()).toBeNull();
    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });

  it('returns null when nothing is stored', () => {
    installStorage();
    expect(readStoredSession()).toBeNull();
  });

  it('writeStoredSession(null) removes the key', () => {
    const store = installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify(session) });

    writeStoredSession(null);

    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });
});
