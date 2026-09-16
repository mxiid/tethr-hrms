// The dashboard's fixed tile-size catalog. Sizes are whole multiples of the
// 12-column grid (at desktop) and two grid rows, so every tile lands on the
// same rhythm and its content is authored to fit its density — no inner
// scrolling, ever (see design.md §6.6).

export type WidgetSize = '2x1' | '1x2' | '2x2' | '2x3' | '4x2' | '4x3';

export type WidgetSizeGeometry = {
  /** Columns spanned on the 12-column desktop grid. */
  readonly columns: number;
  /** Grid rows spanned; 2 rows = 1 visual unit = 88px. */
  readonly rows: number;
};

export const WIDGET_SIZE_GEOMETRY: Readonly<Record<WidgetSize, WidgetSizeGeometry>> = {
  '2x1': { columns: 6, rows: 2 },
  '1x2': { columns: 3, rows: 4 },
  '2x2': { columns: 6, rows: 4 },
  '2x3': { columns: 6, rows: 6 },
  '4x2': { columns: 12, rows: 4 },
  '4x3': { columns: 12, rows: 6 },
};

export const WIDGET_SIZE_LABELS: Readonly<Record<WidgetSize, string>> = {
  '2x1': 'Strip',
  '1x2': 'Quarter',
  '2x2': 'Half',
  '2x3': 'Half tall',
  '4x2': 'Full',
  '4x3': 'Full tall',
};

// Content density drives which parts of a widget render: the caps here are
// starting points — what each size is authored for, and what the fit matrix
// exercises — while useFittedContent measures the real box at runtime and
// trims from there (the picker's Enlarge flow also reasons in these counts).
// The caps are hints, never verdicts.
export type WidgetDensity = 'strip' | 'quarter' | 'half' | 'halfTall' | 'full' | 'fullTall';

export const WIDGET_SIZE_DENSITY: Readonly<Record<WidgetSize, WidgetDensity>> = {
  '2x1': 'strip',
  '1x2': 'quarter',
  '2x2': 'half',
  '2x3': 'halfTall',
  '4x2': 'full',
  '4x3': 'fullTall',
};

export type WidgetDensityLimits = {
  /** Metrics the size is authored for; measurement may render more or fewer. */
  readonly fields: number;
  readonly legend: number;
  /** Ordinal stages a funnel may render (0 hides the stage list). */
  readonly stages: number;
};

export const WIDGET_DENSITY_LIMITS: Readonly<Record<WidgetDensity, WidgetDensityLimits>> = {
  strip: { fields: 1, legend: 0, stages: 0 },
  quarter: { fields: 2, legend: 3, stages: 3 },
  half: { fields: 4, legend: 4, stages: 3 },
  halfTall: { fields: 6, legend: 6, stages: 4 },
  full: { fields: 6, legend: 6, stages: 3 },
  fullTall: { fields: 6, legend: 6, stages: 5 },
};

export const isWidgetSize = (value: unknown): value is WidgetSize =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(WIDGET_SIZE_GEOMETRY, value);
