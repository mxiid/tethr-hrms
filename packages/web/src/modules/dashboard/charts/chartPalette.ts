import type { WorkspaceBrandColor } from '@hrms/shared';

// Fixed categorical order, validated with the dataviz skill's
// validate_palette.js against both the light and dark chart surfaces (all six
// checks pass; cyan<->pink carries a CVD floor-band warning, mitigated by
// always shipping a legend + direct labels alongside it). Never reorder this
// per chart, and never cycle past it — a 7th series folds into "Other".
const CATEGORICAL_ORDER: readonly WorkspaceBrandColor[] = [
  'blue',
  'green',
  'tomato',
  'iris',
  'pink',
  'cyan',
];

const categoricalColorAt = (index: number): WorkspaceBrandColor =>
  CATEGORICAL_ORDER[index % CATEGORICAL_ORDER.length] ?? 'gray';

export const categoricalColorVarAt = (index: number): string =>
  `var(--hrms-color-tag-${categoricalColorAt(index)})`;

// Ordinal (ordered-stage) ramp: one hue — the app's own indigo accent — light
// to dark by stage order, read as a CSS variable so light/dark mode is
// automatic (the accent ramp is already co-designed per mode).
const ORDINAL_ACCENT_STEPS: readonly number[] = [4, 5, 6, 7, 8, 9];

export const ordinalAccentVarAt = (index: number): string => {
  const step = ORDINAL_ACCENT_STEPS[Math.min(index, ORDINAL_ACCENT_STEPS.length - 1)];
  return `var(--hrms-color-accent-accent${step})`;
};

// Rounds a magnitude up to a "clean" number for axis ticks (0 / 1,000 / 2,000
// style rounding), scaled to the value's own order of magnitude.
export const roundToNiceStep = (value: number): number => {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
};
