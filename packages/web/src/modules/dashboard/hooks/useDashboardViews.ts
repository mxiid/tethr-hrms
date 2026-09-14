import { useAtom } from 'jotai';

import { dashboardViewsState, type DashboardView } from '../states/dashboardViewsState';
import { defaultLayoutFor } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';

export const useDashboardViews = () => {
  const [state, setState] = useAtom(dashboardViewsState);

  const activeView =
    state.views.find((view) => view.id === state.activeViewId) ?? state.views[0];

  const switchView = (id: string): void => {
    setState((current) => ({ ...current, activeViewId: id }));
  };

  const createView = (name: string, widgetIds: readonly WidgetId[]): void => {
    const id = crypto.randomUUID();
    const view: DashboardView = { id, name, widgets: widgetIds.map(defaultLayoutFor) };
    setState((current) => ({ views: [...current.views, view], activeViewId: id }));
  };

  const renameView = (id: string, name: string): void => {
    setState((current) => ({
      ...current,
      views: current.views.map((view) => (view.id === id ? { ...view, name } : view)),
    }));
  };

  const deleteView = (id: string): void => {
    setState((current) => {
      if (current.views.length === 1) return current;
      const views = current.views.filter((view) => view.id !== id);
      const activeViewId = current.activeViewId === id ? views[0].id : current.activeViewId;
      return { views, activeViewId };
    });
  };

  return {
    views: state.views,
    activeView,
    activeViewId: state.activeViewId,
    switchView,
    createView,
    renameView,
    deleteView,
  };
};
