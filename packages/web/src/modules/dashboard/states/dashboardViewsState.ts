import { atom } from 'jotai';

import type { WidgetLayout } from '../widgets/types';

export type DashboardView = {
  readonly id: string;
  readonly name: string;
  readonly widgets: readonly WidgetLayout[];
};

type DashboardViewsState = {
  readonly views: readonly DashboardView[];
  readonly activeViewId: string;
};

const DEFAULT_VIEW_ID = 'overview';

// The atom starts empty; DashboardPage seeds the active view once per session
// from `defaultWidgetsForPortal(user.portal)` (see `dashboardSeededAtom`). The
// dashboard is code-defined and in-memory only — identical for every workspace
// and user, and a refresh resets everyone to their portal's default layout.
const DEFAULT_STATE: DashboardViewsState = {
  views: [{ id: DEFAULT_VIEW_ID, name: 'Overview', widgets: [] }],
  activeViewId: DEFAULT_VIEW_ID,
};

export const dashboardViewsState = atom<DashboardViewsState>(DEFAULT_STATE);

// Flipped true after DashboardPage has seeded the portal's default layout, so
// navigating away and back keeps in-session customizations instead of reseeding.
export const dashboardSeededAtom = atom(false);

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
