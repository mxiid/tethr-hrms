import { useAtom } from 'jotai';
import { useSearchParams } from 'react-router-dom';

import { dashboardViewsState, type DashboardView } from '../states/dashboardViewsState';
import { defaultLayoutFor } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';

export const useDashboardViews = () => {
  const [state, setState] = useAtom(dashboardViewsState);
  const [searchParams, setSearchParams] = useSearchParams();

  const activeView =
    state.views.find((view) => view.id === state.activeViewId) ?? state.views[0];

  // The active view is shareable state, so it rides in the URL (`?view=`).
  const writeViewParam = (id: string): void => {
    const next = new URLSearchParams(searchParams);
    next.set('view', id);
    setSearchParams(next, { replace: true });
  };

  const switchView = (id: string): void => {
    setState((current) => ({ ...current, activeViewId: id }));
    writeViewParam(id);
  };

  const createView = (name: string, widgetIds: readonly WidgetId[]): void => {
    const id = crypto.randomUUID();
    const view: DashboardView = { id, name, widgets: widgetIds.map(defaultLayoutFor) };
    setState((current) => ({ views: [...current.views, view], activeViewId: id }));
    writeViewParam(id);
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
      if (activeViewId !== current.activeViewId) {
        writeViewParam(activeViewId);
      }
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
