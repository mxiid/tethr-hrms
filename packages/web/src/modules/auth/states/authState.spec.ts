import { createStore } from 'jotai';

import type { AuthSession } from './authState';
import {
  AUTH_STORAGE_KEY,
  authState,
  readStoredSession,
  writeStoredSession,
} from './authState';

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

type FakeWindow = {
  readonly localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  addEventListener: (type: string, listener: (event: StorageEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: StorageEvent) => void) => void;
  emitStorage: (key: string | null) => void;
};

const installStorage = (initial: Record<string, string> = {}): {
  store: Map<string, string>;
  fakeWindow: FakeWindow;
} => {
  const store = new Map<string, string>(Object.entries(initial));
  const listeners = new Set<(event: StorageEvent) => void>();
  const fakeWindow: FakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    addEventListener: (type, listener) => {
      if (type === 'storage') listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'storage') listeners.delete(listener);
    },
    emitStorage: (key) => {
      for (const listener of listeners) {
        listener({ key } as StorageEvent);
      }
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  return { store, fakeWindow };
};

describe('readStoredSession', () => {
  it('reads a valid session', () => {
    installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify(session) });

    expect(readStoredSession()).toEqual(session);
  });

  it('treats a corrupt value as logged out and clears it', () => {
    const { store } = installStorage({ [AUTH_STORAGE_KEY]: '{not-json' });

    expect(readStoredSession()).toBeNull();
    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });

  it('rejects a shape that is not a session and clears it', () => {
    const { store } = installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify({ token: 42 }) });

    expect(readStoredSession()).toBeNull();
    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });

  it('rejects a partial user object instead of trusting the cast', () => {
    const partial = JSON.stringify({ token: 'token-1', user: {} });
    const { store } = installStorage({ [AUTH_STORAGE_KEY]: partial });

    expect(readStoredSession()).toBeNull();
    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });

  it('rejects wrong field types and unknown portals', () => {
    const cases = [
      { ...session, user: { ...session.user, roleKeys: 'clientAdmin' } },
      { ...session, user: { ...session.user, roleKeys: [1] } },
      { ...session, user: { ...session.user, portal: 'admin' } },
      { ...session, user: { ...session.user, employeeId: 7 } },
    ];
    for (const value of cases) {
      installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify(value) });
      expect(readStoredSession()).toBeNull();
    }
  });

  it('returns null when nothing is stored', () => {
    installStorage();
    expect(readStoredSession()).toBeNull();
  });

  it('writeStoredSession(null) removes the key', () => {
    const { store } = installStorage({ [AUTH_STORAGE_KEY]: JSON.stringify(session) });

    writeStoredSession(null);

    expect(store.has(AUTH_STORAGE_KEY)).toBe(false);
  });
});

describe('authStorage cross-tab sync', () => {
  it('updates a mounted atom when another tab clears the session', () => {
    const { store: webStorage, fakeWindow } = installStorage({
      [AUTH_STORAGE_KEY]: JSON.stringify(session),
    });
    const store = createStore();
    const unsubscribe = store.sub(authState, () => undefined);
    expect(store.get(authState)).toEqual(session);

    // Another tab logs out: the key disappears and a storage event arrives.
    webStorage.delete(AUTH_STORAGE_KEY);
    fakeWindow.emitStorage(AUTH_STORAGE_KEY);

    expect(store.get(authState)).toBeNull();

    // Unsubscribed atoms stop receiving events.
    unsubscribe();
    webStorage.set(AUTH_STORAGE_KEY, JSON.stringify(session));
    fakeWindow.emitStorage(AUTH_STORAGE_KEY);
    expect(store.get(authState)).toBeNull();
  });

  it('ignores storage events for other keys', () => {
    const { store: webStorage, fakeWindow } = installStorage({
      [AUTH_STORAGE_KEY]: JSON.stringify(session),
    });
    const store = createStore();
    const unsubscribe = store.sub(authState, () => undefined);

    webStorage.delete(AUTH_STORAGE_KEY);
    fakeWindow.emitStorage('hrms.theme');

    expect(store.get(authState)).toEqual(session);
    unsubscribe();
  });
});
