import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { IconLayoutGrid } from '@tabler/icons-react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';

import { useConfirm } from '../../../components/confirm/ConfirmProvider';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  activeViewWidgetsAtom,
  dashboardSeededKeyAtom,
  dashboardStorageKey,
  dashboardViewsState,
  loadDashboardViews,
  saveDashboardViews,
} from '../states/dashboardViewsState';
import { DashboardWidgetCard } from '../widgets/DashboardWidgetCard';
import { defaultWidgetsForPortal, WIDGET_REGISTRY } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';
import {
  WIDGET_DENSITY_LIMITS,
  WIDGET_SIZE_DENSITY,
  WIDGET_SIZE_GEOMETRY,
  WIDGET_SIZE_LABELS,
  type WidgetSize,
} from '../widgets/widgetSizes';

import { CustomizeDashboardMenu } from './CustomizeDashboardMenu';
import { DashboardViewTabs } from './DashboardViewTabs';

type DashboardWidgetBoardProps = {
  // The Tethr Dashboard is the whole page, so it gets the full chrome (named
  // views + Customize). Embedded in another page (client "People overview")
  // the multi-view UI is noise — just the Customize menu.
  readonly showViewTabs?: boolean;
};

// The customizable widget board: view tabs, the Customize menu, the Edit layout
// toggle, and the fixed-size widget grid. Mounted by the Tethr Dashboard and, in
// a section, by the client "People overview" — both seed their own portal's
// default layout from the same shared atoms.
export const DashboardWidgetBoard = ({ showViewTabs = true }: DashboardWidgetBoardProps) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [layout, setLayout] = useAtom(activeViewWidgetsAtom);
  const viewsState = useAtomValue(dashboardViewsState);
  const [seededKey, setSeededKey] = useAtom(dashboardSeededKeyAtom);
  const setViews = useSetAtom(dashboardViewsState);
  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const storageKey = user !== null ? dashboardStorageKey(user.organizationId, user.id) : null;

  // Seed once per storage key: this browser's saved layout when one exists,
  // otherwise the portal's defaults. A ?view= link wins over the stored view.
  // Tracking the key (not a boolean) keeps a workspace switch or a login as a
  // different user from reusing — or overwriting — the previous identity's
  // layout.
  useEffect(() => {
    if (user === null || user.portal === 'none' || storageKey === null) return;
    if (seededKey === storageKey) return;
    const stored = loadDashboardViews(storageKey);
    const base = stored ?? {
      views: [{ id: 'overview', name: 'Overview', widgets: defaultWidgetsForPortal(user.portal) }],
      activeViewId: 'overview',
    };
    const paramView = new URLSearchParams(window.location.search).get('view');
    const activeViewId =
      paramView !== null && base.views.some((view) => view.id === paramView)
        ? paramView
        : base.activeViewId;
    setViews({ ...base, activeViewId });
    setSeededKey(storageKey);
  }, [seededKey, user, storageKey, setViews, setSeededKey]);

  // Persist every layout or view change for this workspace + user — and only
  // once this key is the one that seeded the state, so a key change never
  // writes the previous identity's layout.
  useEffect(() => {
    if (storageKey === null || seededKey !== storageKey) return;
    saveDashboardViews(storageKey, viewsState);
  }, [seededKey, storageKey, viewsState]);

  const visibleWidgets = layout
    .map((entry) => {
      const definition = WIDGET_REGISTRY.find((widget) => widget.id === entry.id);
      return definition ? { ...entry, definition } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.definition.isVisible(user));

  const removeWidget = async (id: WidgetId): Promise<void> => {
    const confirmed = await confirm({
      title: 'Remove this widget?',
      body: 'The widget will be removed from this dashboard view.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    setLayout((current) => current.filter((widget) => widget.id !== id));
  };

  const changeSize = (id: WidgetId, size: WidgetSize): void => {
    const definition = WIDGET_REGISTRY.find((widget) => widget.id === id);
    if (!definition || !definition.sizeOptions.includes(size)) return;
    setLayout((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, size } : widget)),
    );
    setAnnouncement(`${definition.title} resized to ${WIDGET_SIZE_LABELS[size]}.`);
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

  const reorderWidgetFields = (id: WidgetId, fieldIds: readonly string[]): void => {
    setLayout((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, fieldIds } : widget)),
    );
  };

  // The enlarge target: the smallest allowed size that is strictly larger than
  // the current one and whose metric count covers the selection. Measurement
  // decides when the action is offered — the picker only shows it when the tile
  // actually hides a selected metric, so a size the current box already
  // satisfies is never a target.
  const enlargeTarget = (id: WidgetId): WidgetSize | null => {
    const definition = WIDGET_REGISTRY.find((widget) => widget.id === id);
    const entry = layout.find((widget) => widget.id === id);
    if (!definition || !entry) return null;
    const currentArea = WIDGET_SIZE_GEOMETRY[entry.size].columns * WIDGET_SIZE_GEOMETRY[entry.size].rows;
    const fitting = definition.sizeOptions
      .filter((option) => {
        const geometry = WIDGET_SIZE_GEOMETRY[option];
        return (
          geometry.columns * geometry.rows > currentArea &&
          WIDGET_DENSITY_LIMITS[WIDGET_SIZE_DENSITY[option]].fields >= entry.fieldIds.length
        );
      })
      .sort((left, right) => {
        const leftGeometry = WIDGET_SIZE_GEOMETRY[left];
        const rightGeometry = WIDGET_SIZE_GEOMETRY[right];
        return leftGeometry.columns * leftGeometry.rows - rightGeometry.columns * rightGeometry.rows;
      })[0];
    return fitting ?? null;
  };

  const enlargeWidget = (id: WidgetId): void => {
    const target = enlargeTarget(id);
    if (target !== null) {
      changeSize(id, target);
    }
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

  // One frame while the layout is seeding — avoids flashing the empty state
  // before the effect runs, and hides the board entirely while the signed-in
  // identity is still switching (storageKey !== the seeded key).
  if (storageKey === null || seededKey !== storageKey) return null;

  return (
    <div className="dashboard-board">
      <div className={`dashboard-board-toolbar${showViewTabs ? '' : ' is-compact'}`}>
        {showViewTabs ? <DashboardViewTabs /> : <span />}
        <div className="dashboard-board-actions">
          <button
            aria-pressed={editing}
            className="button button-secondary"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            <IconLayoutGrid aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            {editing ? 'Done' : 'Edit layout'}
          </button>
          <CustomizeDashboardMenu />
        </div>
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      {visibleWidgets.length === 0 ? (
        <div className="dashboard-widget-empty">
          <p className="panel-title">No widgets on this view</p>
          <p>Use Customize to add widgets, then Edit layout to resize and reorder them.</p>
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext
            items={visibleWidgets.map((widget) => widget.id)}
            strategy={rectSortingStrategy}
          >
            <div className={`dashboard-widget-grid${editing ? ' is-editing' : ''}`}>
              {visibleWidgets.map((widget) => (
                <DashboardWidgetCard
                  accentColor={widget.definition.accentColor}
                  chartKind={widget.definition.chartKind}
                  displayMode={widget.displayMode}
                  editing={editing}
                  fields={widget.definition.fields}
                  id={widget.id}
                  key={widget.id}
                  onChangeSize={(size) => changeSize(widget.id, size)}
                  onEnlarge={
                    enlargeTarget(widget.id) !== null ? () => enlargeWidget(widget.id) : undefined
                  }
                  onRemove={() => void removeWidget(widget.id)}
                  onReorderFields={(fieldIds) => reorderWidgetFields(widget.id, fieldIds)}
                  onToggleDisplayMode={() => toggleDisplayMode(widget.id)}
                  onToggleField={(fieldId, enabled) => toggleWidgetField(widget.id, fieldId, enabled)}
                  selectedFieldIds={widget.fieldIds}
                  size={widget.size}
                  sizeOptions={widget.definition.sizeOptions}
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
