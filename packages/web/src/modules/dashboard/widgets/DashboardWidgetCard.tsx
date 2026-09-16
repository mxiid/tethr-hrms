import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkspaceBrandColor } from '@hrms/shared';
import { IconChartBar, IconGripVertical, IconListDetails, IconX } from '@tabler/icons-react';
import { type CSSProperties } from 'react';

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
import { WIDGET_DENSITY_LIMITS, WIDGET_SIZE_DENSITY, type WidgetSize } from './widgetSizes';
import { WidgetSizeMenu } from './WidgetSizeMenu';

type DashboardWidgetCardProps = {
  readonly id: WidgetId;
  readonly title: string;
  readonly size: WidgetSize;
  readonly sizeOptions: readonly WidgetSize[];
  /** Edit layout mode: chrome (drag, size, fields, remove) only shows here. */
  readonly editing: boolean;
  readonly accentColor: WorkspaceBrandColor;
  readonly fields: readonly WidgetFieldDefinition[];
  readonly selectedFieldIds: readonly string[];
  readonly chartKind?: WidgetChartKind;
  readonly displayMode: WidgetDisplayMode;
  readonly useData: () => WidgetData;
  readonly onChangeSize: (size: WidgetSize) => void;
  readonly onRemove: () => void;
  readonly onToggleDisplayMode: () => void;
  readonly onToggleField: (fieldId: string, enabled: boolean) => void;
};

/**
 * One dashboard tile. Its size comes from the fixed catalog (widgetSizes.ts) —
 * geometry is a CSS class, and the density derived from that size caps what
 * renders so the content always fits the box without scrolling.
 */
export const DashboardWidgetCard = ({
  id,
  title,
  size,
  sizeOptions,
  editing,
  accentColor,
  fields,
  selectedFieldIds,
  chartKind,
  displayMode,
  useData,
  onChangeSize,
  onRemove,
  onToggleDisplayMode,
  onToggleField,
}: DashboardWidgetCardProps) => {
  const { theme } = useTheme();
  const { loading, error, values, breakdown, points, formatPointValue } = useData();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });

  const density = WIDGET_SIZE_DENSITY[size];
  const limits = WIDGET_DENSITY_LIMITS[density];
  const showChart = displayMode === 'chart' && chartKind !== undefined && density !== 'strip';

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className={`dashboard-widget widget-size-${size} widget-density-${density}${
        isDragging ? ' is-dragging' : ''
      }`}
      ref={setNodeRef}
      style={style}
    >
      <div className="dashboard-widget-header">
        <span
          aria-hidden="true"
          className="dashboard-widget-accent"
          style={{ background: `var(--hrms-color-tag-${accentColor})` }}
        />
        {editing ? (
          <button
            aria-label="Drag to reorder"
            className="icon-button dashboard-widget-drag-handle"
            type="button"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </button>
        ) : null}
        <h2 className="panel-title dashboard-widget-title">{title}</h2>
        {editing && chartKind !== undefined ? (
          <button
            aria-label={displayMode === 'chart' ? 'Switch to plain view' : 'Switch to chart view'}
            className="icon-button"
            onClick={onToggleDisplayMode}
            type="button"
          >
            {displayMode === 'chart' ? (
              <IconListDetails aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            ) : (
              <IconChartBar aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            )}
          </button>
        ) : null}
        {editing ? (
          <WidgetSizeMenu onChange={onChangeSize} options={sizeOptions} size={size} title={title} />
        ) : null}
        {editing ? (
          <WidgetFieldPicker
            fields={fields}
            onToggleField={onToggleField}
            selectedFieldIds={selectedFieldIds}
            title={title}
          />
        ) : null}
        {editing ? (
          <button
            aria-label={`Remove ${title} widget`}
            className="icon-button"
            onClick={onRemove}
            type="button"
          >
            <IconX aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </button>
        ) : null}
      </div>
      <div className="dashboard-widget-body">
        {showChart && !error && !loading && chartKind === 'share' && breakdown ? (
          <StackedShareBar maxLegendItems={limits.legend} segments={breakdown} />
        ) : null}
        {showChart && !error && !loading && chartKind === 'ordinal' && breakdown ? (
          <OrdinalStageBars maxStages={limits.stages} stages={breakdown} />
        ) : null}
        {showChart && !error && !loading && chartKind === 'trend' && points ? (
          <BarTrendChart formatValue={formatPointValue} points={points} />
        ) : null}
        <WidgetFieldRow
          error={error}
          fields={fields}
          limit={limits.fields}
          loading={loading}
          selectedFieldIds={selectedFieldIds}
          values={values}
        />
      </div>
    </div>
  );
};
