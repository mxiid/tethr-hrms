import { atomWithStorage } from 'jotai/utils';

import type { PortalKind } from '@hrms/shared';

export type AuthUser = {
  readonly id: string;
  readonly email: string;
  readonly organizationId: string;
  readonly status: string;
  readonly employeeId: string | null;
  readonly roleKeys: readonly string[];
  readonly portal: PortalKind;
};

export type AuthSession = {
  readonly token: string;
  readonly user: AuthUser;
};

// Persisted to localStorage so a refresh keeps you signed in. The Apollo auth
// link reads the same key to attach the bearer token to every request.
export const AUTH_STORAGE_KEY = 'hrms.auth';

// The one reader of the persisted session. A corrupt or legacy value must never
// throw (it would break every request through the Apollo auth link and there
// would be no way back to /login): the bad value is cleared and treated as
// logged out. Jotai's own storage adapter cannot express that, so the atom
// reads/writes through this pair instead.
export const readStoredSession = (): AuthSession | null => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { token?: unknown }).token === 'string' &&
      typeof (parsed as { user?: unknown }).user === 'object' &&
      (parsed as { user?: unknown }).user !== null
    ) {
      return parsed as AuthSession;
    }
  } catch {
    // Fall through: malformed JSON.
  }
  clearStoredSession();
  return null;
};

export const writeStoredSession = (session: AuthSession | null): void => {
  try {
    if (session === null) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable — the in-memory atom stays authoritative for this tab.
  }
};

export const clearStoredSession = (): void => {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Nothing to do; the caller also clears the in-memory atom.
  }
};

const authStorage = {
  getItem: (key: string, initialValue: AuthSession | null): AuthSession | null =>
    key === AUTH_STORAGE_KEY ? (readStoredSession() ?? initialValue) : initialValue,
  setItem: (key: string, value: AuthSession | null): void => {
    if (key === AUTH_STORAGE_KEY) {
      writeStoredSession(value);
    }
  },
  removeItem: (key: string): void => {
    if (key === AUTH_STORAGE_KEY) {
      clearStoredSession();
    }
  },
};

// getOnInit:true so the session is read from localStorage on the very first
// render — otherwise a refresh while signed in briefly sees `null` and the
// protected-route guard bounces the user to /login before hydration.
export const authState = atomWithStorage<AuthSession | null>(
  AUTH_STORAGE_KEY,
  null,
  authStorage,
  { getOnInit: true },
);
