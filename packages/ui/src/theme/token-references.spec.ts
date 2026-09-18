import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { themeToCssVariables } from './css-variables';
import { lightTheme } from './theme';

// Every `var(--hrms-*)` in a package's CSS must be emitted by the theme. An
// undefined reference silently discards its declaration at computed-value
// time, so a typo never surfaces at build, typecheck, or runtime — this test
// is the only place it gets caught. It walks the sibling packages generically
// rather than naming one consumer, so the contract is repo-wide.
const PACKAGES_DIR = resolve(__dirname, '../../..');

const collectCssFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : collectCssFiles(path);
    }
    return entry.name.endsWith('.css') ? [path] : [];
  });

const referencePattern = /var\(\s*(--hrms-[a-z0-9-]+)\s*[,)]/g;

describe('token references in package CSS', () => {
  it('resolves every var(--hrms-*) against the emitted theme variables', () => {
    const defined = new Set(Object.keys(themeToCssVariables(lightTheme)));
    const missing = new Map<string, string[]>();
    for (const file of collectCssFiles(PACKAGES_DIR)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(referencePattern)) {
        if (!defined.has(match[1])) {
          const files = missing.get(match[1]) ?? [];
          files.push(file.replace(`${PACKAGES_DIR}/`, '').replace(/\\/g, '/'));
          missing.set(match[1], files);
        }
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });

  it('carries the dashboard geometry tokens at their authored values', () => {
    const vars = themeToCssVariables(lightTheme);
    expect({
      rowUnit: vars['--hrms-layout-dashboard-row-unit'],
      glyphWidth: vars['--hrms-layout-dashboard-glyph-width'],
      glyphHeight: vars['--hrms-layout-dashboard-glyph-height'],
      glyphHalf: vars['--hrms-layout-dashboard-glyph-half'],
      glyphTall: vars['--hrms-layout-dashboard-glyph-tall'],
      glyphWide: vars['--hrms-layout-dashboard-glyph-wide'],
      trendPlotHeight: vars['--hrms-layout-dashboard-trend-plot-height'],
      trendPlotCompactHeight: vars['--hrms-layout-dashboard-trend-plot-compact-height'],
      ordinalLabelWidth: vars['--hrms-layout-dashboard-ordinal-label-width'],
      ordinalTrackHeight: vars['--hrms-layout-dashboard-ordinal-track-height'],
    }).toEqual({
      rowUnit: '36px',
      glyphWidth: '18px',
      glyphHeight: '14px',
      glyphHalf: '9px',
      glyphTall: '26px',
      glyphWide: '34px',
      trendPlotHeight: '120px',
      trendPlotCompactHeight: '72px',
      ordinalLabelWidth: '84px',
      ordinalTrackHeight: '10px',
    });
  });
});
