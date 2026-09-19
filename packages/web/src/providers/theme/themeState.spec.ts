import { initialThemeMode, THEME_STORAGE_KEY } from './themeState';

const installWindow = (
  stored: string | null,
  prefersDark: boolean,
): Map<string, string> => {
  const store = new Map<string, string>();
  if (stored !== null) store.set(THEME_STORAGE_KEY, stored);
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
      matchMedia: () => ({ matches: prefersDark }),
    },
  });
  return store;
};

describe('initialThemeMode', () => {
  it('honours an explicitly stored choice', () => {
    installWindow('dark', false);
    expect(initialThemeMode()).toBe('dark');

    installWindow('light', true);
    expect(initialThemeMode()).toBe('light');
  });

  it('follows the OS preference when nothing is stored', () => {
    installWindow(null, true);
    expect(initialThemeMode()).toBe('dark');

    installWindow(null, false);
    expect(initialThemeMode()).toBe('light');
  });

  it('falls back to light when storage and matchMedia are unavailable', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
    expect(initialThemeMode()).toBe('light');
  });
});
