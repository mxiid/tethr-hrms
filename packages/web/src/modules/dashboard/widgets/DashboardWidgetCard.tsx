import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkspaceBrandColor } from '@hrms/shared';
import { IconChartBar, IconGripVertical, IconListDetails, IconX } from '@tabler/icons-react';
import { type CSSProperties, useRef } from 'react';

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
import { useFittedContent } from './useFittedContent';
import {
  WIDGET_DENSITY_LIMITS,
  WIDGET_SIZE_DENSITY,
  WIDGET_SIZE_LABELS,
  type WidgetSize,
} from './widgetSizes';
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
  readonly onReorderFields: (fieldIds: readonly string[]) => void;
  /** Present when a larger allowed size would render everything selected. */
  readonly onEnlarge?: () => void;
  readonly onToggleDisplayMode: () => void;
  readonly onToggleField: (fieldId: string, enabled: boolean) => void;
};

/**
 * One dashboard tile. Its size comes from the fixed catalog (widgetSizes.ts) —
 * geometry is a CSS class, while what renders is measured at runtime against
 * the real box (useFittedContent), so the content always fits without
 * scrolling: the density caps are starting points, not verdicts.
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
  onReorderFields,
  onEnlarge,
  onToggleDisplayMode,
  onToggleField,
}: DashboardWidgetCardProps) => {
  const { theme } = useTheme();
  const { loading, error, values, breakdown, points, formatPointValue } = useData();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const density = WIDGET_SIZE_DENSITY[size];
  const limits = WIDGET_DENSITY_LIMITS[density];
  const canShowChart = chartKind !== undefined && density !== 'strip';
  const showChart = displayMode === 'chart' && canShowChart;
  // Strip stays a single headline; every other size probes the full selection
  // and lets measurement decide what actually fits (the caps are hints, never
  // verdicts — at least one metric and the chart's key always render).
  const probeCount =
    density === 'strip' ? Math.min(selectedFieldIds.length, limits.fields) : selectedFieldIds.length;
  const legendProposal =
    canShowChart && showChart && chartKind === 'share' && breakdown
      ? Math.min(limits.legend, breakdown.length)
      : 0;
  const { fieldCount: fittedCount, legendCount: fittedLegendCount } = useFittedContent({
    bodyRef,
    contentRef,
    proposedFields: probeCount,
    minimumFields: 1,
    proposedLegend: legendProposal,
    minimumLegend: Math.min(legendProposal, 2),
    resetKey: `${size}:${displayMode}`,
  });

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
        {editing && canShowChart ? (
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
            onEnlarge={onEnlarge}
            onReorderFields={onReorderFields}
            onShowPlain={canShowChart && showChart ? onToggleDisplayMode : undefined}
            onToggleField={onToggleField}
            selectedFieldIds={selectedFieldIds}
            sizeLabel={WIDGET_SIZE_LABELS[size]}
            title={title}
            visibleCount={fittedCount}
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
      <div className="dashboard-widget-body" ref={bodyRef}>
        <div className="dashboard-widget-content" ref={contentRef}>
          {showChart && !error && !loading && chartKind === 'share' && breakdown ? (
            <StackedShareBar maxLegendItems={fittedLegendCount} segments={breakdown} />
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
            limit={fittedCount}
            loading={loading}
            selectedFieldIds={selectedFieldIds}
            values={values}
          />
        </div>
      </div>
    </div>
  );
};
