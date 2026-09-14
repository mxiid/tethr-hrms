import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkspaceBrandColor } from '@hrms/shared';
import { IconChartBar, IconGripVertical, IconListDetails, IconX } from '@tabler/icons-react';
import {
  useState,
  type CSSProperties,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { useTheme } from '../../../providers/theme/useTheme';
import { BarTrendChart } from '../charts/BarTrendChart';
import { OrdinalStageBars } from '../charts/OrdinalStageBars';
import { StackedShareBar } from '../charts/StackedShareBar';

import type {
  WidgetChartKind,
  WidgetData,
  WidgetDisplayMode,
  WidgetFieldDefinition,
  WidgetId,
} from './types';
import { WidgetFieldPicker } from './WidgetFieldPicker';
import { WidgetFieldRow } from './WidgetFieldRow';

const MIN_ROW_SPAN = 2;
const MAX_ROW_SPAN = 8;

type LiveSpan = { readonly colSpan: number; readonly rowSpan: number };

type DashboardWidgetCardProps = {
  readonly id: WidgetId;
  readonly title: string;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly accentColor: WorkspaceBrandColor;
  readonly gridRef: RefObject<HTMLDivElement | null>;
  readonly fields: readonly WidgetFieldDefinition[];
  readonly selectedFieldIds: readonly string[];
  readonly chartKind?: WidgetChartKind;
  readonly displayMode: WidgetDisplayMode;
  readonly useData: () => WidgetData;
  readonly onRemove: () => void;
  readonly onResize: (colSpan: number, rowSpan: number) => void;
  readonly onToggleDisplayMode: () => void;
  readonly onToggleField: (fieldId: string, enabled: boolean) => void;
};

export const DashboardWidgetCard = ({
  id,
  title,
  colSpan,
  rowSpan,
  accentColor,
  gridRef,
  fields,
  selectedFieldIds,
  chartKind,
  displayMode,
  useData,
  onRemove,
  onResize,
  onToggleDisplayMode,
  onToggleField,
}: DashboardWidgetCardProps) => {
  const { theme } = useTheme();
  const { loading, error, values, breakdown, points, formatPointValue } = useData();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [liveSpan, setLiveSpan] = useState<LiveSpan | null>(null);

  const effectiveColSpan = liveSpan?.colSpan ?? colSpan;
  const effectiveRowSpan = liveSpan?.rowSpan ?? rowSpan;

  const onResizePointerDown = (event: ReactPointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;

    const gridStyle = getComputedStyle(grid);
    const columnWidths = gridStyle.gridTemplateColumns.split(' ').map((value) => parseFloat(value));
    const columnUnit = (columnWidths[0] ?? 260) + parseFloat(gridStyle.columnGap || '0');
    const rowUnit = parseFloat(gridStyle.gridAutoRows || '40') + parseFloat(gridStyle.rowGap || '0');
    const maxColSpan = columnWidths.length;
    const startX = event.clientX;
    const startY = event.clientY;

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const deltaCols = Math.round((moveEvent.clientX - startX) / columnUnit);
      const deltaRows = Math.round((moveEvent.clientY - startY) / rowUnit);
      setLiveSpan({
        colSpan: Math.min(maxColSpan, Math.max(1, colSpan + deltaCols)),
        rowSpan: Math.min(MAX_ROW_SPAN, Math.max(MIN_ROW_SPAN, rowSpan + deltaRows)),
      });
    };

    const onPointerUp = (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setLiveSpan((current) => {
        if (current) onResize(current.colSpan, current.rowSpan);
        return null;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${effectiveColSpan}`,
    gridRow: `span ${effectiveRowSpan}`,
  };

  return (
    <div
      className={`dashboard-widget${isDragging ? ' is-dragging' : ''}${liveSpan ? ' is-resizing' : ''}`}
      ref={setNodeRef}
      style={style}
    >
      <div className="dashboard-widget-header">
        <span
          aria-hidden="true"
          className="dashboard-widget-accent"
          style={{ background: `var(--hrms-color-tag-${accentColor})` }}
        />
        <button
          aria-label="Drag to reorder"
          className="icon-button dashboard-widget-drag-handle"
          type="button"
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        </button>
        <h2 className="panel-title dashboard-widget-title">{title}</h2>
        {chartKind ? (
          <button
            aria-label={displayMode === 'chart' ? 'Switch to plain view' : 'Switch to chart view'}
            className="icon-button"
            onClick={onToggleDisplayMode}
            type="button"
          >
            {displayMode === 'chart' ? (
              <IconListDetails size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            ) : (
              <IconChartBar size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            )}
          </button>
        ) : null}
        <WidgetFieldPicker
          fields={fields}
          onToggleField={onToggleField}
          selectedFieldIds={selectedFieldIds}
          title={title}
        />
        <button
          aria-label={`Remove ${title} widget`}
          className="icon-button"
          onClick={onRemove}
          type="button"
        >
          <IconX size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        </button>
      </div>
      <div className="dashboard-widget-body">
        {!error && !loading && displayMode === 'chart' && chartKind === 'share' && breakdown ? (
          <StackedShareBar segments={breakdown} />
        ) : null}
        {!error && !loading && displayMode === 'chart' && chartKind === 'ordinal' && breakdown ? (
          <OrdinalStageBars stages={breakdown} />
        ) : null}
        {!error && !loading && displayMode === 'chart' && chartKind === 'trend' && points ? (
          <BarTrendChart formatValue={formatPointValue} points={points} />
        ) : null}
        <WidgetFieldRow
          error={error}
          fields={fields}
          loading={loading}
          selectedFieldIds={selectedFieldIds}
          values={values}
        />
      </div>
      <span
        aria-label={`Resize ${title} widget`}
        className="dashboard-widget-resize-handle"
        onPointerDown={onResizePointerDown}
        role="button"
        tabIndex={-1}
      />
    </div>
  );
};
