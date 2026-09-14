import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { useAtom, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';

import { useAuth } from '../../auth/hooks/useAuth';
import {
  activeViewWidgetsAtom,
  dashboardSeededAtom,
  dashboardViewsState,
} from '../states/dashboardViewsState';
import { DashboardWidgetCard } from '../widgets/DashboardWidgetCard';
import { defaultWidgetsForPortal, WIDGET_REGISTRY } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';

import { CustomizeDashboardMenu } from './CustomizeDashboardMenu';
import { DashboardViewTabs } from './DashboardViewTabs';

type DashboardWidgetBoardProps = {
  // The Tethr Dashboard is the whole page, so it gets the full chrome (named
  // views + Customize). Embedded in another page (client "People overview")
  // the multi-view UI is noise — just the Customize menu.
  readonly showViewTabs?: boolean;
};

// The customizable widget board: view tabs, the Customize menu, and the
// drag-to-reorder / resize grid. Mounted by the Tethr Dashboard and, in a
// section, by the client "People overview" — both seed their own portal's
// default layout from the same shared atoms.
export const DashboardWidgetBoard = ({ showViewTabs = true }: DashboardWidgetBoardProps) => {
  const { user } = useAuth();
  const [layout, setLayout] = useAtom(activeViewWidgetsAtom);
  const [seeded, setSeeded] = useAtom(dashboardSeededAtom);
  const setViews = useSetAtom(dashboardViewsState);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Seed the active view once per session from the portal's default layout.
  // Navigating away and back keeps in-session edits; a refresh reseeds.
  useEffect(() => {
    if (seeded || !user || user.portal === 'none') return;
    setViews({
      views: [{ id: 'overview', name: 'Overview', widgets: defaultWidgetsForPortal(user.portal) }],
      activeViewId: 'overview',
    });
    setSeeded(true);
  }, [seeded, user, setViews, setSeeded]);

  const visibleWidgets = layout
    .map((entry) => {
      const definition = WIDGET_REGISTRY.find((widget) => widget.id === entry.id);
      return definition ? { ...entry, definition } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.definition.isVisible(user));

  const removeWidget = (id: WidgetId): void => {
    setLayout((current) => current.filter((widget) => widget.id !== id));
  };

  const resizeWidget = (id: WidgetId, colSpan: number, rowSpan: number): void => {
    setLayout((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, colSpan, rowSpan } : widget)),
    );
  };

  const toggleWidgetField = (id: WidgetId, fieldId: string, enabled: boolean): void => {
    setLayout((current) =>
      current.map((widget) =>
        widget.id === id
          ? {
              ...widget,
              fieldIds: enabled
                ? [...widget.fieldIds, fieldId]
                : widget.fieldIds.filter((existingFieldId) => existingFieldId !== fieldId),
            }
          : widget,
      ),
    );
  };

  const toggleDisplayMode = (id: WidgetId): void => {
    setLayout((current) =>
      current.map((widget) =>
        widget.id === id
          ? { ...widget, displayMode: widget.displayMode === 'chart' ? 'plain' : 'chart' }
          : widget,
      ),
    );
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLayout((current) => {
      const oldIndex = current.findIndex((widget) => widget.id === active.id);
      const newIndex = current.findIndex((widget) => widget.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove([...current], oldIndex, newIndex);
    });
  };

  // One frame while the portal's default layout is seeded — avoids flashing the
  // empty state before the effect runs.
  if (!seeded) return null;

  return (
    <div className="dashboard-board">
      <div className={`dashboard-board-toolbar${showViewTabs ? '' : ' is-compact'}`}>
        {showViewTabs ? <DashboardViewTabs /> : <span />}
        <CustomizeDashboardMenu />
      </div>

      {visibleWidgets.length === 0 ? (
        <div className="dashboard-widget-empty">
          <p className="panel-title">No widgets on this view</p>
          <p>Open Customize to add employee, leave, hiring, or workspace widgets.</p>
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext
            items={visibleWidgets.map((widget) => widget.id)}
            strategy={rectSortingStrategy}
          >
            <div className="dashboard-widget-grid" ref={gridRef}>
              {visibleWidgets.map((widget) => (
                <DashboardWidgetCard
                  accentColor={widget.definition.accentColor}
                  chartKind={widget.definition.chartKind}
                  colSpan={widget.colSpan}
                  displayMode={widget.displayMode}
                  fields={widget.definition.fields}
                  gridRef={gridRef}
                  id={widget.id}
                  key={widget.id}
                  onRemove={() => removeWidget(widget.id)}
                  onResize={(colSpan, rowSpan) => resizeWidget(widget.id, colSpan, rowSpan)}
                  onToggleDisplayMode={() => toggleDisplayMode(widget.id)}
                  onToggleField={(fieldId, enabled) => toggleWidgetField(widget.id, fieldId, enabled)}
                  rowSpan={widget.rowSpan}
                  selectedFieldIds={widget.fieldIds}
                  title={widget.definition.title}
                  useData={widget.definition.useData}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
