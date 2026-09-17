import { atom } from 'jotai';

import { WIDGET_REGISTRY } from '../widgets/registry';
import type { WidgetLayout } from '../widgets/types';
import { isWidgetSize } from '../widgets/widgetSizes';

export type DashboardView = {
  readonly id: string;
  readonly name: string;
  readonly widgets: readonly WidgetLayout[];
};

export type DashboardViewsState = {
  readonly views: readonly DashboardView[];
  readonly activeViewId: string;
};

const DEFAULT_VIEW_ID = 'overview';

// The atom starts empty; DashboardWidgetBoard seeds the active view once per
// workspace + user — from this browser's saved layout when one exists,
// otherwise from `defaultWidgetsForPortal(user.portal)` (see
// `dashboardSeededKeyAtom`). Saved layouts persist per workspace + user in
// localStorage; a refresh restores them, and corrupt or legacy data falls back
// to the portal defaults.
const DEFAULT_STATE: DashboardViewsState = {
  views: [{ id: DEFAULT_VIEW_ID, name: 'Overview', widgets: [] }],
  activeViewId: DEFAULT_VIEW_ID,
};

export const dashboardViewsState = atom<DashboardViewsState>(DEFAULT_STATE);

// The storage key the board has seeded for, or null before any seeding. A key
// (not a boolean) because the signed-in workspace + user can change without a
// reload — switching workspaces, logging out — and each identity needs its own
// seed + persistence, never the previous identity's layout.
export const dashboardSeededKeyAtom = atom<string | null>(null);

// The widget layout list of whichever view is currently active. Reading/writing
// through this keeps the widget grid's own logic (add/remove/reorder/resize)
// exactly as simple as it was before views existed — it just no longer has to
// know which view it's operating on.
export const activeViewWidgetsAtom = atom(
  (get) => {
    const state = get(dashboardViewsState);
    return state.views.find((view) => view.id === state.activeViewId)?.widgets ?? [];
  },
  (_get, set, updater: (current: readonly WidgetLayout[]) => readonly WidgetLayout[]) => {
    set(dashboardViewsState, (state) => ({
      ...state,
      views: state.views.map((view) =>
        view.id === state.activeViewId ? { ...view, widgets: updater(view.widgets) } : view,
      ),
    }));
  },
);

const STORAGE_VERSION = 1;

export const dashboardStorageKey = (organizationId: string, userId: string): string =>
  `hrms.dashboard.views.${organizationId}.${userId}`;

// Validates a saved entry and prunes it on the way in. A saved layout is only
// usable while its widget still exists, its size is one that widget offers, and
// its metrics still exist — retired metric ids are dropped here so they never
// reach state (fitting and enlargement count only what can render), and the
// next save writes the repaired layout back. A selection whose metrics have all
// retired falls back to the widget's defaults instead of restoring a blank
// tile; a selection the user deliberately emptied stays empty.
const parseWidgetLayout = (value: unknown): WidgetLayout | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const definition =
    typeof candidate.id === 'string'
      ? WIDGET_REGISTRY.find((widget) => widget.id === candidate.id)
      : undefined;
  if (
    definition === undefined ||
    !isWidgetSize(candidate.size) ||
    !definition.sizeOptions.includes(candidate.size) ||
    !Array.isArray(candidate.fieldIds) ||
    !candidate.fieldIds.every((fieldId) => typeof fieldId === 'string') ||
    (candidate.displayMode !== 'chart' && candidate.displayMode !== 'plain')
  ) {
    return null;
  }
  const knownFieldIds = new Set(definition.fields.map((field) => field.id));
  const savedFieldIds = candidate.fieldIds.filter((fieldId) => knownFieldIds.has(fieldId));
  const allRetired = candidate.fieldIds.length > 0 && savedFieldIds.length === 0;
  return {
    id: definition.id,
    size: candidate.size,
    fieldIds: allRetired ? definition.defaultFieldIds : savedFieldIds,
    displayMode: candidate.displayMode,
  };
};

// One entry per widget id, first saved wins — the widget grid and the drag
// handlers match by id, so duplicates would make one edit touch several tiles.
const parseWidgetList = (values: readonly unknown[]): readonly WidgetLayout[] => {
  const seenIds = new Set<string>();
  const widgets: WidgetLayout[] = [];
  for (const value of values) {
    const parsed = parseWidgetLayout(value);
    if (parsed === null || seenIds.has(parsed.id)) {
      continue;
    }
    seenIds.add(parsed.id);
    widgets.push(parsed);
  }
  return widgets;
};

/**
 * Reads this browser's saved dashboard for the key, dropping anything that no
 * longer matches the current shape. Returns null when there is nothing usable,
 * so the caller seeds the portal defaults instead.
 */
export const loadDashboardViews = (key: string): DashboardViewsState | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const envelope = parsed as { v?: unknown; state?: unknown };
    if (envelope.v !== STORAGE_VERSION || typeof envelope.state !== 'object' || envelope.state === null) {
      return null;
    }
    const state = envelope.state as { views?: unknown; activeViewId?: unknown };
    if (!Array.isArray(state.views) || state.views.length === 0) {
      return null;
    }
    // One view per id, first saved wins — the widget atom updates every view
    // whose id matches the active one, so duplicates would fan one edit out to
    // several saved views.
    const seenViewIds = new Set<string>();
    const views = state.views
      .map((view): DashboardView | null => {
        const candidate = view as { id?: unknown; name?: unknown; widgets?: unknown };
        if (
          typeof candidate.id !== 'string' ||
          typeof candidate.name !== 'string' ||
          !Array.isArray(candidate.widgets) ||
          seenViewIds.has(candidate.id)
        ) {
          return null;
        }
        seenViewIds.add(candidate.id);
        return { id: candidate.id, name: candidate.name, widgets: parseWidgetList(candidate.widgets) };
      })
      .filter((view): view is DashboardView => view !== null);
    if (views.length === 0) {
      return null;
    }
    const activeViewId =
      typeof state.activeViewId === 'string' && views.some((view) => view.id === state.activeViewId)
        ? state.activeViewId
        : views[0].id;
    return { views, activeViewId };
  } catch {
    return null;
  }
};

export const saveDashboardViews = (key: string, state: DashboardViewsState): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify({ v: STORAGE_VERSION, state }));
  } catch {
    // Storage disabled or full: the in-memory state stays authoritative.
  }
};
