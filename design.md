# Twenty — Design Language

> A reference for the visual and interaction language used across the product. Source of truth: `packages/ui/src/theme/`.

---

## 1. Design Philosophy

Twenty's design ethos is **functional minimalism** — Linear- and Vercel-adjacent. The product is dense, table-and-sidebar-heavy, and prioritizes clarity over decoration.

Guiding principles:

- **Form follows function.** No gradients, illustrations-as-chrome, or decorative complexity. Visual weight is reserved for hierarchy.
- **Semantic over arbitrary.** Tokens are named for *what they mean* (`danger`, `success`, `accent`, `inverted`) rather than what they look like.
- **Dual-mode parity.** Every token has a Light and Dark counterpart. Dark mode is not an afterthought — it is co-designed.
- **Accessibility-conscious.** Strong focus rings, clear text-tier separation, semantic colors, P3-aware contrast.
- **Composable, not inherited.** Styles are tokenized and re-composed across components. No deep style inheritance.

---

## 2. Foundations

### 2.1 Spacing

A 4px-multiplier grid drives all spacing. `theme.spacing(2, 4)` resolves to `8px 16px`.

| Token | Value |
|---|---|
| `spacingMultiplicator` | `4` |
| `spacing(n)` | `n * 4px` |
| `betweenSiblingsGap` | `2px` |

`betweenSiblingsGap` of `2px` is the signature density choice — components sit tight against each other, giving Twenty its high-information-density feel.

### 2.2 Border Radius

Restrained rounding. Nothing here is "playful" — everything is functional.

| Token | Value | Usage |
|---|---|---|
| `xs` | `2px` | Inline pills, tag corners |
| `sm` | `4px` | Buttons, inputs, default radius |
| `md` | `8px` | Modals, cards, side panels |
| `xl` | `20px` | Large containers |
| `xxl` | `40px` | Hero / marketing surfaces |
| `pill` | `999px` | Capsule buttons, chips |
| `rounded` | `100%` | Avatars, dots |

Source: [common.ts](packages/ui/src/theme/common.ts)

### 2.3 Motion

Fast and subtle. Tokens live in `packages/ui/src/theme/common.ts` and are emitted as
CSS variables (`--hrms-animation-*`). All motion is CSS-first — transitions and
`@starting-style` for entrances, WAAPI only when JavaScript control is needed.
No motion library.

| Duration | Value (s) | Usage |
|---|---|---|
| `instant` | `0.075` | Hover state flips |
| `fast` | `0.15` | Buttons, tooltips, small popovers |
| `gentle` | `0.24` | Modals, drawers, side panel |
| `normal` | `0.3` | Larger on-screen movement |
| `slow` | `1.5` | Marketing-style reveals (rare) |

| Easing | Value | Usage |
|---|---|---|
| `out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entrances and UI interactions (default) |
| `inOut` | `cubic-bezier(0.77, 0, 0.175, 1)` | Elements moving or morphing on screen |
| `drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets and drawers |
| `soft` | `cubic-bezier(0.4, 0, 0.2, 1)` | Opacity / color fades |

Rules: never transition `all`; never use `ease-in` for UI entrances; press
feedback via `transform: scale(0.97)` on `:active`; popovers scale from their
trigger (`transform-origin`), modals stay centered; gate hover motion behind
`@media (hover: hover) and (pointer: fine)`; honour `prefers-reduced-motion`
(keep opacity and color changes, drop movement).

### 2.4 Z-index

`lastLayerZIndex: 2147483647` (`Int32.MaxValue`) is reserved for the top-most overlay layer — toasts, command bar, root portals.

---

## 3. Typography

| Token | Value |
|---|---|
| Font family (UI) | `Inter, sans-serif` |
| Font family (code) | `DM Mono` |
| Weights | `400` regular · `500` medium · `600` semiBold |

Three weights only — disciplined hierarchy.

### Size scale

| Token | Value | ~px |
|---|---|---|
| `xxs` | `0.625rem` | 10 |
| `xs` | `0.85rem` | 13.6 |
| `sm` | `0.92rem` | 14.7 |
| `md` | `1rem` | 16 |
| `lg` | `1.23rem` | 19.7 |
| `xl` | `1.54rem` | 24.6 |
| `xxl` | `1.85rem` | 29.6 |

### Line height

- `md`: `1.1` — tight, for UI labels and table cells
- `lg`: `1.5` — body copy, multi-line text

### Text color tiers (light theme)

| Token | Value | Use for |
|---|---|---|
| `primary` | `gray12` | Headings, primary body |
| `secondary` | `gray11` | Subdued labels |
| `tertiary` | `gray9` | Captions, metadata |
| `light` | `gray8` | Disabled-but-readable |
| `extraLight` | `gray7` | Placeholder text |
| `inverted` | `gray1` | Text on dark/inverted bg |
| `danger` | `red` | Error messaging |

Source: [common.ts](packages/ui/src/theme/common.ts) (scale), [colors-light.ts](packages/ui/src/theme/colors-light.ts) / [colors-dark.ts](packages/ui/src/theme/colors-dark.ts) (tiers)

---

## 4. Color System

Twenty is built on **Radix UI's P3 color tokens** — wide-gamut, accessibility-graded, and modeled around 12-step scales (1=lightest, 12=darkest). The use of `color(display-p3 …)` syntax means colors render with greater saturation on capable displays without sacrificing sRGB fallback.

### 4.1 Grayscale

A 12-step display-p3 ramp from pure white (`gray1`) to near-black (`gray12`). Used for backgrounds, borders, text, and shadows.

| Token | Value |
|---|---|
| `gray1` | `display-p3 1 1 1` (white) |
| `gray2` | `display-p3 0.988 0.988 0.988` |
| `gray4` | `display-p3 0.945 0.945 0.945` |
| `gray6` | `display-p3 0.839 0.839 0.839` |
| `gray9` | `display-p3 0.6 0.6 0.6` |
| `gray11` | `display-p3 0.4 0.4 0.4` |
| `gray12` | `display-p3 0.2 0.2 0.2` |

Source: [colors-light.ts](packages/ui/src/theme/colors-light.ts)

### 4.2 Accent (Primary brand)

**Indigo** (Radix `indigoP3`) is Twenty's accent — a 12-step ramp from `accent1` to `accent12`. Used for primary buttons, focus rings, selection, links.

| Token | Source |
|---|---|
| `accent1`–`accent12` | `RadixColors.indigoP3.indigo1`–`indigo12` |
| `accent9` | Brand reference point |
| `accent11` | Secondary button text |

Source: [colors-light.ts](packages/ui/src/theme/colors-light.ts)

### 4.3 Main color palette (24 hues)

Each named color maps to a Radix P3 `9`-step (the saturated mid-tone) and is used for tags, chips, avatars, and category coloring.

| Family | Colors |
|---|---|
| **Reds** | `red`, `ruby`, `crimson`, `tomato` |
| **Oranges / Yellows** | `orange`, `amber`, `yellow` |
| **Greens** | `lime`, `grass`, `green`, `jade`, `mint` |
| **Cyans / Blues** | `turquoise`, `cyan`, `sky`, `blue` (= indigoP3) |
| **Purples / Pinks** | `iris`, `violet`, `purple`, `plum`, `pink` |
| **Earth tones / Neutrals** | `bronze`, `gold`, `brown`, `gray` |

Source: [colors-light.ts](packages/ui/src/theme/colors-light.ts)

### 4.4 Background hierarchy (light theme)

| Token | Maps to | Use |
|---|---|---|
| `primary` | `gray1` | Main canvas |
| `secondary` | `gray2` | Subtle row striping, panels |
| `tertiary` | `gray4` | Hover surfaces |
| `quaternary` | `gray5` | Pressed / heavy hover |
| `invertedPrimary` | `gray12` | Tooltips, dark chips |
| `invertedSecondary` | `gray11` | Inverted subtle |
| `danger` | `red3` | Destructive surfaces |
| `transparent.*` | alpha tints | Overlays, scrims |
| `overlayPrimary` | gray alpha | Modal scrims |
| `radialGradient` | gray9 → gray10 | Decorative auth/empty states |

Source: [colors-light.ts](packages/ui/src/theme/colors-light.ts)

### 4.5 Border palette

| Token | Maps to | Use |
|---|---|---|
| `strong` | `gray6` | Dividers, separators |
| `medium` | `gray5` | Default input borders |
| `light` | `gray4` | Subtle separators |
| `inverted` | `gray12` | Dark surface borders |
| `danger` | `red5` | Error inputs |
| `blue` | `blue7` | Focus / selected |
| `transparentStrong` | gray4 alpha | Floating panel borders |

Source: [colors-light.ts](packages/ui/src/theme/colors-light.ts)

### 4.6 Shadows

Built from layered gray-alpha tokens — no diffuse colored glows.

| Token | Recipe |
|---|---|
| `light` | `0 2px 4px gray2α, 0 0 4px gray5α` |
| `strong` | `2px 4px 16px gray7α, 0 2px 4px gray5α` |
| `underline` | `0 1px 0 gray9α` |
| `superHeavy` | three-layer (8px + 64px + 56px spreads) — modal lift |

Source: [colors-light.ts](packages/ui/src/theme/colors-light.ts)

---

## 5. Iconography

Library: **[Tabler Icons](https://tabler.io/icons)** (`@tabler/icons-react`). Outline-only, geometric, variable stroke weight.

| Size | Value | Stroke |
|---|---|---|
| `sm` | `14px` | `1.6` |
| `md` | `16px` | `2` |
| `lg` | `20px` | `2.5` |
| `xl` | `24px` | (custom) |

Strokes get *heavier* as size scales up — small icons render lighter to avoid blockiness; large icons hold weight for hierarchy.

Source: [common.ts](packages/ui/src/theme/common.ts)

---

## 6. Component Patterns

### 6.1 Buttons

Three variants × three accents × two sizes — a 3D matrix that covers every state without one-off variants.

| Axis | Values |
|---|---|
| **Variant** | `primary` (filled) · `secondary` (bordered) · `tertiary` (ghost) |
| **Accent** | `default` (neutral) · `blue` (primary action) · `danger` (destructive) |
| **Size** | `small` (24px tall) · `medium` (32px tall) |
| **Position** | `standalone` · `left` · `middle` · `right` (for grouped button bars) |

Additional toggles: `inverted`, `fullWidth`, `disabled`, `focus`, `isLoading`, `soon` (coming-soon stub), `hotkeys`.

Border radius is `sm` (4px). Focus state shows a 3px blue outline. Disabled state uses reduced opacity, not a color swap.

Source: [global.css](packages/web/src/app/global.css)

### 6.2 Modals

| Size | Width | Height |
|---|---|---|
| `sm` | `300px` | auto |
| `md` | `400px` | auto |
| `lg` | `53%` | auto |
| `xl` | `1200px` | `800px` |
| `fullscreen` | `100dvw` | `100dvh` |

- Border radius `md` (8px) on desktop; `0` on mobile (becomes fullscreen)
- `superHeavy` shadow for elevation
- Max-height `90dvh` with overflow scroll
- Scrim uses `overlayPrimary` (gray alpha)

Source: [Modal.tsx](packages/web/src/components/modal/Modal.tsx)

### 6.3 Side panels

Fixed width: `500px`. This is a hard convention — record detail panels, settings sub-panels, contextual editors all share this footprint.

### 6.4 Tables

| Property | Value |
|---|---|
| `horizontalCellMargin` | `8px` |
| `horizontalCellPadding` | `8px` |
| `checkboxColumnWidth` | `32px` |

Dense, spreadsheet-grade tables — Twenty's primary information surface.

### 6.5 Chips & Tags

Variants: `highlighted`, `regular`, `transparent`, `rounded`, `static`. Flex-based alignment. Color comes from the 24-hue main palette (§4.3) — chips are how object categories and statuses get color-coded.

### 6.6 Dashboard tiles

The dashboard is a **fixed-size tile grid**, not a free canvas: a 12-column grid at desktop (8 at tablet, 4 at phone; 16px gutters) with a 36px row track — so two rows equal the **88px tile unit** every height is built on.

Tiles never scroll. Each widget declares the sizes its content is authored to fit, and content caps (fields, legend items, funnel stages) come from the density of that size:

| Size | Geometry | Density | Content contract |
|---|---|---|---|
| `2x1` Strip | 6 cols × 1 unit | strip | title + one headline metric |
| `1x2` Quarter | 3 cols × 2 units | quarter | split legend (typically 2–3 items) + as many inline metrics as fit (≥2 at desktop, wrapping when needed) |
| `2x2` Half | 6 cols × 2 units | half | bar + ≤4 legend items + ≤4 stats |
| `2x3` Half tall | 6 cols × 3 units | halfTall | chart + legend + ≤6 stats |
| `4x2` Full | 12 cols × 2 units | full | bar + inline legend + ≤6 stats |
| `4x3` Full tall | 12 cols × 3 units | fullTall | chart + legend + ≤6 stats |

Interaction: dragging reorders; size is chosen from the widget's allowed set (never free-resized), and **all edit chrome lives in Edit layout mode** — the resting dashboard shows only titles, accent dots, and content. The metrics picker is one ordered list shared by every size: drag the grips (or lift with the keyboard) to set display order, selected metrics beyond what the tile renders read muted, and a single **Enlarge to add** action jumps to the smallest strictly larger size that renders everything selected. Hidden metrics always keep a way back: when no larger size exists, **Show metrics only** drops the chart to free the room, and when even that can't help (already plain, or no chart) a note points at reordering or unselecting — the muted rows themselves are draggable. What renders is **measured, not guessed**: the density caps are starting points, and each tile probes the full selection against its real box, shedding legend items first and metrics one at a time until nothing clips (never below one metric and the chart's key). Controls only exist where they can act — the chart/plain toggle disappears when the size has no chart. Layouts persist per workspace + user, and the signed-in identity owns its layout: a workspace switch or a fresh sign-in loads that identity's dashboard and never reuses or overwrites the previous one. Saved layouts are sanitized against the widget registry on load — unknown widgets, unsupported sizes, retired metrics, and duplicate view/widget ids drop out, so a stale save repairs itself on the next write; a selection whose metrics have all retired falls back to the widget's defaults rather than restoring a blank tile, while an intentionally empty selection stays empty. The tile rhythm and the size-glyph diagrams are tokens (`--hrms-layout-dashboard-*`), never literal dimensions. The active view is **two-way URL state** — deep links apply, deliberate switches push history so Back returns, and a missing or stale `?view=` is corrected in place — and the session's getting-started dismissal survives in-app navigation (a reload starts fresh) while staying scoped to the workspace that chose it: switching workspaces mid-tab still shows the destination's onboarding.

---

## 7. Styling Engine

- **`@hrms/ui` tokens** — spacing, radii, motion, typography, and the light/dark
  palettes live in `packages/ui/src/theme/`. `buildThemeCss()` flattens them into
  `--hrms-*` CSS custom properties, applied by toggling `data-theme` on the root —
  no component re-render to swap modes.
- **One global stylesheet** — `packages/web/src/app/global.css` holds the app's
  styles, written against the CSS variables. Component behavior stays in React;
  visuals stay in the stylesheet.
- **CSS-first motion** — transitions and `@starting-style` for entrances; WAAPI
  only for programmatic control. No animation library.
- **No utility-class framework** (no Tailwind), no CSS-in-JS runtime.

---

## 8. Theme Architecture

```
common.ts (sizes, radii, durations, easing) ──┐
                                              ├─→ theme.ts ──→ css-variables.ts ──→ global.css
colors-light.ts / colors-dark.ts ─────────────┘     (light/darkTheme)   (--hrms-* vars)
```

Three layers:

- `common.ts` — mode-agnostic values (spacing, radii, motion, typography, layout)
- `colors-light.ts` / `colors-dark.ts` — mode color bindings (`ColorTokens`)
- `theme.ts` assembles `lightTheme` / `darkTheme`; `css-variables.ts` flattens the
  string-valued tokens into CSS variables (light on `:root`, dark under
  `[data-theme='dark']`).

This shape makes adding a new color mode (e.g. high-contrast) a matter of authoring
one new color layer — the rest of the system is mode-agnostic.

Source: [packages/ui/src/theme/](packages/ui/src/theme)

---

## 9. Layout Conventions

- **Sidebar-primary navigation** on the left; main canvas to the right.
- **Side panel** (500px) for context-sensitive detail, slides in from the right.
- **Table-first** record views; board and kanban are alternates over the same data.
- **Top bar** is minimal — search, breadcrumb, account. Heavy chrome lives in the sidebar.
- **Empty states** use a single illustration token + a single CTA — never multi-step empty states.

---

## 10. Quick Reference

| Need | Token |
|---|---|
| Standard padding | `theme.spacing(2)` → 8px |
| Card / modal corner | `borderRadius.md` → 8px |
| Button corner | `borderRadius.sm` → 4px |
| Primary action color | `accent` (indigoP3) |
| Body text | `font.color.primary` |
| Subdued text | `font.color.secondary` |
| Default border | `border.color.medium` |
| Hover surface | `background.tertiary` |
| Default icon | `icon.size.md` (16px) · `stroke.md` (2) |
| Modal elevation | `boxShadow.superHeavy` |
| Standard transition | `theme.animation.clickableBackgroundTransition` |

---

## Files of interest

- [packages/ui/src/theme/common.ts](packages/ui/src/theme/common.ts) — mode-agnostic tokens (spacing, radii, motion, typography)
- [packages/ui/src/theme/colors-light.ts](packages/ui/src/theme/colors-light.ts) / [colors-dark.ts](packages/ui/src/theme/colors-dark.ts) — per-mode palette
- [packages/ui/src/theme/theme.ts](packages/ui/src/theme/theme.ts) — light/dark theme assembly
- [packages/ui/src/theme/css-variables.ts](packages/ui/src/theme/css-variables.ts) — `--hrms-*` variable generation
- [packages/web/src/app/global.css](packages/web/src/app/global.css) — the app stylesheet
- [packages/web/src/components/modal/Modal.tsx](packages/web/src/components/modal/Modal.tsx) — overlay primitive
- [packages/web/index.html](packages/web/index.html) — font loading
