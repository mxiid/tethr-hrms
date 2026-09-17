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

// A saved entry is only usable while its widget still exists and its size is
// one that widget offers — a layout saved before a widget or size changed
// drops the entry instead of carrying dead state forward.
const isWidgetLayout = (value: unknown): value is WidgetLayout => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const definition =
    typeof candidate.id === 'string'
      ? WIDGET_REGISTRY.find((widget) => widget.id === candidate.id)
      : undefined;
  return (
    definition !== undefined &&
    isWidgetSize(candidate.size) &&
    definition.sizeOptions.includes(candidate.size) &&
    Array.isArray(candidate.fieldIds) &&
    candidate.fieldIds.every((fieldId) => typeof fieldId === 'string') &&
    (candidate.displayMode === 'chart' || candidate.displayMode === 'plain')
  );
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
    const views = state.views
      .map((view): DashboardView | null => {
        const candidate = view as { id?: unknown; name?: unknown; widgets?: unknown };
        if (
          typeof candidate.id !== 'string' ||
          typeof candidate.name !== 'string' ||
          !Array.isArray(candidate.widgets)
        ) {
          return null;
        }
        return { id: candidate.id, name: candidate.name, widgets: candidate.widgets.filter(isWidgetLayout) };
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
