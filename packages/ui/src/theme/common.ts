// Mode-agnostic tokens — identical in light and dark (design.md §2, §3, §5).
// Sizes, radii, durations, typography scale. Colors live in the *Light/*Dark files.

export const SPACING_MULTIPLIER = 4;

// theme.spacing(2, 4) -> '8px 16px'. The 4px grid drives all spacing (design.md §2.1).
export const spacing = (...multipliers: number[]): string =>
  multipliers.map((multiplier) => `${multiplier * SPACING_MULTIPLIER}px`).join(' ');

export const space = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

// The signature density choice — siblings sit 2px apart (design.md §2.1).
export const betweenSiblingsGap = '2px';

export const borderRadius = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  xl: '20px',
  xxl: '40px',
  pill: '999px',
  rounded: '100%',
} as const;

export const animation = {
  duration: {
    instant: '0.075s',
    fast: '0.15s',
    gentle: '0.24s',
    normal: '0.3s',
    slow: '1.5s',
  },
  // The intent wait before the first tooltip, and the per-item stagger for
  // entrance cascades. Both are consumed in JS and CSS.
  delay: {
    tooltip: '350ms',
  },
  stagger: '40ms',
  // Strong custom curves — the built-in CSS easings are too weak to feel
  // intentional (design.md §2.3). `out` is the default for UI entrances,
  // `inOut` for on-screen movement, `drawer` for sheets, `soft` for fades.
  easing: {
    out: 'cubic-bezier(0.23, 1, 0.32, 1)',
    inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
    drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
    soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  // Default transition for clickable elements (design.md §2.3).
  clickableBackgroundTransition: 'background 0.1s ease',
} as const;

// Int32.MaxValue — reserved for the top-most overlay layer (design.md §2.4).
export const zIndex = {
  lastLayer: 2147483647,
} as const;

export const typography = {
  family: {
    ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    code: "'DM Mono', 'SFMono-Regular', monospace",
  },
  weight: {
    regular: 400,
    medium: 500,
    semiBold: 600,
  },
  size: {
    xxs: '0.625rem',
    xs: '0.85rem',
    sm: '0.92rem',
    md: '1rem',
    lg: '1.23rem',
    xl: '1.54rem',
    xxl: '1.85rem',
  },
  lineHeight: {
    md: '1.1',
    lg: '1.5',
  },
} as const;

// Tabler icon sizing — stroke gets heavier as size scales (design.md §5).
export const icon = {
  size: { sm: 14, md: 16, lg: 20, xl: 24 },
  stroke: { sm: 1.6, md: 2, lg: 2.5 },
} as const;

// Hard layout conventions (design.md §6.2, §6.3, §9).
export const layout = {
  sidebarWidth: '248px',
  topBarHeight: '48px',
  sidePanelWidth: '500px',
  table: {
    horizontalCellMargin: '8px',
    horizontalCellPadding: '8px',
    checkboxColumnWidth: '32px',
    rowHeight: '32px',
    fontSize: '13px',
  },
  modalWidth: {
    sm: '300px',
    md: '400px',
    lg: '53%',
    xl: '1200px',
  },
} as const;
