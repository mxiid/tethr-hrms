import type { PortalKind, WorkspaceBrandColor } from '@hrms/shared';

import type { AuthUser } from '../../auth/states/authState';

import type { WidgetSize } from './widgetSizes';

export type WidgetId =
  | 'employeeCounts'
  | 'leaveOverview'
  | 'payrollSnapshot'
  | 'payrollTrend'
  | 'workspaceInfo'
  | 'hiringPipeline'
  | 'announcements'
  | 'feedbackInbox'
  | 'clientPortfolio'
  | 'myLeaveBalance'
  | 'myPayHistory'
  | 'myEmploymentSummary'
  | 'myTimeOff'
  | 'upcomingHolidays';

export type WidgetDisplayMode = 'chart' | 'plain';

export type WidgetPortal = Exclude<PortalKind, 'none'>;

export type WidgetLayout = {
  readonly id: WidgetId;
  readonly size: WidgetSize;
  readonly fieldIds: readonly string[];
  readonly displayMode: WidgetDisplayMode;
};

export type WidgetFieldDefinition = {
  readonly id: string;
  readonly label: string;
};

export type WidgetFieldValues = Readonly<Record<string, string | number>>;

type ChartSegment = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
};

type ChartPoint = {
  readonly label: string;
  readonly value: number;
};

export type WidgetData = {
  readonly loading: boolean;
  readonly error: boolean;
  readonly values: WidgetFieldValues;
  readonly breakdown?: readonly ChartSegment[];
  readonly points?: readonly ChartPoint[];
  readonly formatPointValue?: (value: number) => string;
};

// Which chart, if any, DashboardWidgetCard renders above the numeric field
// row — 'share' for part-to-whole (StackedShareBar, reads `breakdown`),
// 'ordinal' for ordered stages (OrdinalStageBars, reads `breakdown`), 'trend'
// for a time series (BarTrendChart, reads `points`).
export type WidgetChartKind = 'share' | 'ordinal' | 'trend';

export type WidgetDefinition = {
  readonly id: WidgetId;
  readonly title: string;
  // Which portals may add this widget. The catalog is filtered by this before
  // isVisible runs, so a portal is never offered a widget its role can't load.
  readonly portals: readonly WidgetPortal[];
  /** The tile sizes this widget's content is authored to fit. */
  readonly sizeOptions: readonly WidgetSize[];
  readonly defaultSize: WidgetSize;
  readonly accentColor: WorkspaceBrandColor;
  readonly defaultEnabled: boolean;
  readonly isVisible: (user: AuthUser | null) => boolean;
  readonly fields: readonly WidgetFieldDefinition[];
  readonly defaultFieldIds: readonly string[];
  readonly chartKind?: WidgetChartKind;
  readonly useData: () => WidgetData;
};
