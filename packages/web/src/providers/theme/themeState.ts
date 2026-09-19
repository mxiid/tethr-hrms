import type { ThemeName } from '@hrms/ui';
import { atomWithStorage } from 'jotai/utils';

export const THEME_STORAGE_KEY = 'hrms.theme';

const isThemeName = (value: unknown): value is ThemeName => value === 'light' || value === 'dark';

// First visit (nothing stored) follows the OS preference; after that the
// explicit choice wins. Guarded because storage can throw outright (private
// windows, blocked site data) and `matchMedia` is absent in non-browser tests.
export const initialThemeMode = (): ThemeName => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(stored)) {
      return stored;
    }
  } catch {
    // Storage unavailable — fall through to the OS preference.
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

// Writes go through a guarded adapter: a blocked or quota-exhausted
// localStorage throws on setItem, and a theme toggle must never crash the app —
// the in-memory atom stays authoritative when storage is unavailable.
const themeStorage = {
  getItem: (key: string, initialValue: ThemeName): ThemeName => {
    try {
      const stored = window.localStorage.getItem(key);
      return isThemeName(stored) ? stored : initialValue;
    } catch {
      return initialValue;
    }
  },
  setItem: (key: string, value: ThemeName): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage unavailable — the in-memory theme still applies.
    }
  },
  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do.
    }
  },
};

// UI state (the active color mode) belongs in an atom (architecture.md §5.2).
// Persisted so a reload keeps the choice; initialized from the OS preference on
// the first visit.
export const themeModeState = atomWithStorage<ThemeName>(
  THEME_STORAGE_KEY,
  initialThemeMode(),
  themeStorage,
  { getOnInit: true },
);
