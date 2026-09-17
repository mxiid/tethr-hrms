import { buildThemeCss, themeToCssVariables } from './css-variables';
import { darkTheme, lightTheme } from './theme';

describe('light/dark parity', () => {
  it('light and dark expose exactly the same set of CSS variables', () => {
    const lightKeys = Object.keys(themeToCssVariables(lightTheme)).sort();
    const darkKeys = Object.keys(themeToCssVariables(darkTheme)).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('no token resolves to an empty value', () => {
    for (const value of Object.values(themeToCssVariables(darkTheme))) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('spacing', () => {
  it('resolves multipliers on the 4px grid', () => {
    expect(lightTheme.spacing(2)).toBe('8px');
    expect(lightTheme.spacing(2, 4)).toBe('8px 16px');
  });
});

describe('buildThemeCss', () => {
  it('emits a :root block and a dark override block', () => {
    const css = buildThemeCss();
    expect(css).toContain(':root {');
    expect(css).toContain("[data-theme='dark'] {");
    expect(css).toContain('--hrms-color-accent-accent9');
  });
});

describe('token contract', () => {
  // Locks the full set of variable families the component CSS depends on, so a
  // future change to the generator can't silently drop a token global.css uses.
  it('emits every variable family the design system relies on', () => {
    const vars = themeToCssVariables(lightTheme);
    expect(vars['--hrms-space-4']).toBe('16px');
    expect(vars['--hrms-between-siblings-gap']).toBe('2px');
    expect(vars['--hrms-layout-sidebar-width']).toBeDefined();
    expect(vars['--hrms-layout-top-bar-height']).toBeDefined();
    expect(vars['--hrms-layout-side-panel-width']).toBeDefined();
    expect(vars['--hrms-layout-table-checkbox-column-width']).toBeDefined();
    expect(vars['--hrms-layout-dashboard-row-unit']).toBe('36px');
    expect(vars['--hrms-layout-dashboard-glyph-width']).toBe('18px');
    expect(vars['--hrms-layout-dashboard-glyph-half']).toBe('9px');
    expect(vars['--hrms-layout-dashboard-glyph-tall']).toBe('26px');
    expect(vars['--hrms-layout-dashboard-glyph-wide']).toBe('34px');
    expect(vars['--hrms-box-shadow-light']).toBeDefined();
    expect(vars['--hrms-box-shadow-strong']).toBeDefined();
    expect(vars['--hrms-color-box-shadow-light']).toBeUndefined();
    expect(vars['--hrms-font-family-ui']).toBeDefined();
    expect(vars['--hrms-line-height-md']).toBeDefined();
    expect(vars['--hrms-animation-clickable-background-transition']).toBeDefined();
  });
});

describe('motion tokens', () => {
  it('exposes the named easing curves as CSS variables', () => {
    const vars = themeToCssVariables(lightTheme);
    expect(vars['--hrms-animation-easing-out']).toBe('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(vars['--hrms-animation-easing-in-out']).toBe('cubic-bezier(0.77, 0, 0.175, 1)');
    expect(vars['--hrms-animation-easing-drawer']).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
    expect(vars['--hrms-animation-easing-soft']).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('keeps every UI duration under the 300ms budget', () => {
    const durations = lightTheme.animation.duration;
    for (const [name, value] of Object.entries(durations)) {
      const seconds = Number.parseFloat(value);
      if (name === 'slow') {
        continue;
      }
      expect(seconds).toBeLessThanOrEqual(0.3);
    }
  });

  it('ships the gentle duration for modals and drawers', () => {
    expect(lightTheme.animation.duration.gentle).toBe('0.24s');
  });

  it('exposes delay, stagger, and layer tokens', () => {
    const vars = themeToCssVariables(lightTheme);
    expect(vars['--hrms-animation-delay-tooltip']).toBe('350ms');
    expect(vars['--hrms-animation-stagger']).toBe('40ms');
    expect(vars['--hrms-z-index-last-layer']).toBe('2147483647');
  });
});
