import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../../auth/hooks/useAuth';
import {
  dashboardSeededKeyAtom,
  dashboardStorageKey,
  dashboardViewsState,
  type DashboardView,
} from '../states/dashboardViewsState';
import { defaultLayoutFor } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';

export const useDashboardViews = () => {
  const [state, setState] = useAtom(dashboardViewsState);
  const { user } = useAuth();
  const seededKey = useAtomValue(dashboardSeededKeyAtom);
  const [searchParams, setSearchParams] = useSearchParams();

  const storageKey = user !== null ? dashboardStorageKey(user.organizationId, user.id) : null;
  const seeded = storageKey !== null && seededKey === storageKey;

  const activeView =
    state.views.find((view) => view.id === state.activeViewId) ?? state.views[0];

  const writeViewParam = (id: string, options?: { readonly replace?: boolean }): void => {
    const next = new URLSearchParams(searchParams);
    next.set('view', id);
    setSearchParams(next, { replace: options?.replace ?? false });
  };

  // The URL is the other half of the view state: browser Back/forward, shared
  // links, and hand-edited params all arrive here. A valid ?view= becomes the
  // active view; a missing or stale one is corrected (replace) so the address
  // bar never names a view the board isn't showing.
  useEffect(() => {
    if (!seeded) return;
    const paramView = searchParams.get('view');
    if (
      paramView !== null &&
      paramView !== state.activeViewId &&
      state.views.some((view) => view.id === paramView)
    ) {
      setState((current) => ({ ...current, activeViewId: paramView }));
      return;
    }
    if (paramView === null || !state.views.some((view) => view.id === paramView)) {
      const next = new URLSearchParams(searchParams);
      next.set('view', state.activeViewId);
      setSearchParams(next, { replace: true });
    }
  }, [seeded, searchParams, state, setState, setSearchParams]);

  // A deliberate view change pushes history, so Back returns to the previous
  // view; corrections (a deleted active view) replace instead.
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
        writeViewParam(activeViewId, { replace: true });
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
