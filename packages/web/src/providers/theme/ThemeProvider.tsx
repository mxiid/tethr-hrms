import { buildThemeCss, themes, type Theme } from '@hrms/ui';
import { useAtom } from 'jotai';
import { createContext, useEffect, useMemo, type ReactNode } from 'react';

import { themeModeState } from './themeState';

export type ThemeContextValue = {
  readonly theme: Theme;
  readonly toggle: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

// Injects the design tokens as CSS variables (light on :root, dark under
// [data-theme='dark']) and exposes the active theme object. Components read
// tokens via CSS variables or the useTheme hook — never hard-coded values
// (design.md §7).
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useAtom(themeModeState);
  const theme = themes[mode];

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggle: () => setMode((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [theme, setMode],
  );

  // Keep the browser chrome in step with the app theme: the scrollbar and form
  // controls (color-scheme on <html>), the mobile address bar (theme-color), and
  // the body behind the root wrapper so overscroll never flashes the old mode.
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
    document.body.style.backgroundColor = theme.color.background.primary;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = theme.color.background.primary;
    }
  }, [mode, theme]);

  return (
    <ThemeContext.Provider value={value}>
      <style>{buildThemeCss()}</style>
      <div
        className="hrms-theme-root"
        data-theme={mode}
        style={{
          minHeight: '100vh',
          background: 'var(--hrms-color-background-primary)',
          color: 'var(--hrms-color-text-primary)',
          fontFamily: theme.typography.family.ui,
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};
