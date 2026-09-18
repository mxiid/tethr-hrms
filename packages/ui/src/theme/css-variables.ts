import { darkTheme, lightTheme, type Theme } from './theme';

// Themes are exposed as CSS custom properties so styles can swap light/dark by
// toggling a `data-theme` attribute — no component re-render needed (design.md §7).

export type CssVariableMap = Readonly<Record<string, string>>;

const toKebabCase = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const flatten = (value: unknown, path: readonly string[], out: Record<string, string>): void => {
  if (typeof value === 'string' || typeof value === 'number') {
    out[`--hrms-${path.map(toKebabCase).join('-')}`] = String(value);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, [...path, key], out);
    }
  }
};

// Flatten the themeable (string-valued) tokens of a theme into CSS variables.
// Functions (e.g. spacing) are skipped — they stay in JS.
// boxShadow is lifted out of the color family so the elevation tokens keep
// their authored names (`--hrms-box-shadow-*`, design.md §4.6) instead of
// inheriting the `--hrms-color-` prefix.
export const themeToCssVariables = (theme: Theme): CssVariableMap => {
  const out: Record<string, string> = {};
  const { boxShadow, ...colors } = theme.color;
  flatten(colors, ['color'], out);
  flatten(boxShadow, ['box-shadow'], out);
  flatten(theme.space, ['space'], out);
  flatten(theme.betweenSiblingsGap, ['between-siblings-gap'], out);
  flatten(theme.borderRadius, ['radius'], out);
  flatten(theme.animation, ['animation'], out);
  flatten(theme.zIndex, ['z-index'], out);
  flatten(theme.layout, ['layout'], out);
  flatten(theme.typography.family, ['font-family'], out);
  flatten(theme.typography.size, ['font-size'], out);
  flatten(theme.typography.weight, ['font-weight'], out);
  flatten(theme.typography.lineHeight, ['line-height'], out);
  return out;
};

const renderBlock = (selector: string, variables: CssVariableMap): string => {
  const body = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
};

// Full stylesheet: light variables on :root, dark variables under [data-theme='dark'].
export const buildThemeCss = (): string =>
  [
    renderBlock(':root', themeToCssVariables(lightTheme)),
    renderBlock("[data-theme='dark']", themeToCssVariables(darkTheme)),
  ].join('\n\n');
