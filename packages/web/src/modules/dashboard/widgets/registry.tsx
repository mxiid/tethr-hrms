import type { AuthUser } from '../../auth/states/authState';

import { ANNOUNCEMENTS_FIELDS, useAnnouncementsData } from './AnnouncementsWidget';
import { CLIENT_PORTFOLIO_FIELDS, useClientPortfolioData } from './ClientPortfolioWidget';
import { EMPLOYEE_COUNTS_FIELDS, useEmployeeCountsData } from './EmployeeCountsWidget';
import { FEEDBACK_INBOX_FIELDS, useFeedbackInboxData } from './FeedbackInboxWidget';
import { HIRING_PIPELINE_FIELDS, useHiringPipelineData } from './HiringPipelineWidget';
import { LEAVE_OVERVIEW_FIELDS, useLeaveOverviewData } from './LeaveOverviewWidget';
import { MY_EMPLOYMENT_SUMMARY_FIELDS, useMyEmploymentSummaryData } from './MyEmploymentSummaryWidget';
import { MY_LEAVE_BALANCE_FIELDS, useMyLeaveBalanceData } from './MyLeaveBalanceWidget';
import { MY_PAY_HISTORY_FIELDS, useMyPayHistoryData } from './MyPayHistoryWidget';
import { MY_TIME_OFF_FIELDS, useMyTimeOffData } from './MyTimeOffWidget';
import { PAYROLL_SNAPSHOT_FIELDS, usePayrollSnapshotData } from './PayrollSnapshotWidget';
import { PAYROLL_TREND_FIELDS, usePayrollTrendData } from './PayrollTrendWidget';
import type { WidgetDefinition, WidgetId, WidgetLayout, WidgetPortal } from './types';
import { UPCOMING_HOLIDAYS_FIELDS, useUpcomingHolidaysData } from './UpcomingHolidaysWidget';
import { WORKSPACE_INFO_FIELDS, useWorkspaceInfoData } from './WorkspaceInfoWidget';

const roleKeysOf = (user: AuthUser | null): readonly string[] => user?.roleKeys ?? [];
const hasAnyRole = (user: AuthUser | null, ...keys: readonly string[]): boolean =>
  keys.some((key) => roleKeysOf(user).includes(key));

const canManagePayroll = (user: AuthUser | null): boolean =>
  hasAnyRole(user, 'tethrAdmin', 'tethrFinance');
const canManageTethrHr = (user: AuthUser | null): boolean =>
  hasAnyRole(user, 'tethrAdmin', 'tethrHr');
const canManageClients = (user: AuthUser | null): boolean => hasAnyRole(user, 'tethrAdmin');

const DEFAULT_ROW_SPAN = 3;
const CHART_ROW_SPAN = 5;
const SHARE_CHART_ROW_SPAN = 4;

export const WIDGET_REGISTRY: readonly WidgetDefinition[] = [
  {
    id: 'employeeCounts',
    title: 'Employee counts',
    portals: ['tethr', 'client'],
    defaultColSpan: 1,
    defaultRowSpan: SHARE_CHART_ROW_SPAN,
    accentColor: 'blue',
    defaultEnabled: true,
    isVisible: () => true,
    fields: EMPLOYEE_COUNTS_FIELDS,
    defaultFieldIds: ['total', 'active', 'onLeave'],
    chartKind: 'share',
    useData: useEmployeeCountsData,
  },
  {
    id: 'leaveOverview',
    title: 'Leave overview',
    portals: ['tethr', 'client'],
    defaultColSpan: 1,
    defaultRowSpan: SHARE_CHART_ROW_SPAN,
    accentColor: 'green',
    defaultEnabled: true,
    isVisible: () => true,
    fields: LEAVE_OVERVIEW_FIELDS,
    defaultFieldIds: ['leaveTypes', 'pending'],
    chartKind: 'share',
    useData: useLeaveOverviewData,
  },
  {
    id: 'hiringPipeline',
    title: 'Hiring pipeline',
    portals: ['tethr', 'client'],
    defaultColSpan: 2,
    defaultRowSpan: CHART_ROW_SPAN,
    accentColor: 'cyan',
    defaultEnabled: false,
    isVisible: (user) => hasAnyRole(user, 'tethrAdmin', 'tethrHr', 'clientAdmin', 'clientMember'),
    fields: HIRING_PIPELINE_FIELDS,
    defaultFieldIds: ['total', 'active'],
    chartKind: 'ordinal',
    useData: useHiringPipelineData,
  },
  {
    id: 'announcements',
    title: 'Announcements',
    portals: ['tethr', 'client', 'employee'],
    defaultColSpan: 1,
    defaultRowSpan: SHARE_CHART_ROW_SPAN,
    accentColor: 'pink',
    defaultEnabled: false,
    isVisible: (user) =>
      hasAnyRole(user, 'tethrAdmin', 'tethrHr', 'clientAdmin', 'clientMember', 'employee'),
    fields: ANNOUNCEMENTS_FIELDS,
    defaultFieldIds: ['total', 'pinned'],
    chartKind: 'share',
    useData: useAnnouncementsData,
  },
  {
    id: 'workspaceInfo',
    title: 'Workspace info',
    portals: ['tethr', 'client'],
    defaultColSpan: 1,
    defaultRowSpan: DEFAULT_ROW_SPAN,
    accentColor: 'gray',
    defaultEnabled: false,
    isVisible: () => true,
    fields: WORKSPACE_INFO_FIELDS,
    defaultFieldIds: ['workspaceName', 'legalName'],
    useData: useWorkspaceInfoData,
  },
  {
    id: 'payrollSnapshot',
    title: 'Payroll snapshot',
    portals: ['tethr'],
    defaultColSpan: 2,
    defaultRowSpan: DEFAULT_ROW_SPAN,
    accentColor: 'violet',
    defaultEnabled: false,
    isVisible: canManagePayroll,
    fields: PAYROLL_SNAPSHOT_FIELDS,
    defaultFieldIds: ['totalRuns', 'finalizedRuns', 'latestNetPay'],
    useData: usePayrollSnapshotData,
  },
  {
    id: 'payrollTrend',
    title: 'Payroll trend',
    portals: ['tethr'],
    defaultColSpan: 2,
    defaultRowSpan: CHART_ROW_SPAN,
    accentColor: 'violet',
    defaultEnabled: false,
    isVisible: canManagePayroll,
    fields: PAYROLL_TREND_FIELDS,
    defaultFieldIds: ['latestNetPay'],
    chartKind: 'trend',
    useData: usePayrollTrendData,
  },
  {
    id: 'feedbackInbox',
    title: 'Feedback inbox',
    portals: ['tethr'],
    defaultColSpan: 1,
    defaultRowSpan: SHARE_CHART_ROW_SPAN,
    accentColor: 'amber',
    defaultEnabled: false,
    isVisible: canManageTethrHr,
    fields: FEEDBACK_INBOX_FIELDS,
    defaultFieldIds: ['total', 'open'],
    chartKind: 'share',
    useData: useFeedbackInboxData,
  },
  {
    id: 'clientPortfolio',
    title: 'Client portfolio',
    portals: ['tethr'],
    defaultColSpan: 1,
    defaultRowSpan: DEFAULT_ROW_SPAN,
    accentColor: 'iris',
    defaultEnabled: false,
    isVisible: canManageClients,
    fields: CLIENT_PORTFOLIO_FIELDS,
    defaultFieldIds: ['total'],
    useData: useClientPortfolioData,
  },
  {
    id: 'myLeaveBalance',
    title: 'My leave balance',
    portals: ['employee'],
    defaultColSpan: 1,
    defaultRowSpan: SHARE_CHART_ROW_SPAN,
    accentColor: 'jade',
    defaultEnabled: true,
    isVisible: () => true,
    fields: MY_LEAVE_BALANCE_FIELDS,
    defaultFieldIds: ['available', 'entitled', 'used'],
    chartKind: 'share',
    useData: useMyLeaveBalanceData,
  },
  {
    id: 'myPayHistory',
    title: 'My pay history',
    portals: ['employee'],
    defaultColSpan: 2,
    defaultRowSpan: CHART_ROW_SPAN,
    accentColor: 'violet',
    defaultEnabled: true,
    isVisible: () => true,
    fields: MY_PAY_HISTORY_FIELDS,
    defaultFieldIds: ['latestNetPay', 'latestPayDate', 'payslips'],
    chartKind: 'trend',
    useData: useMyPayHistoryData,
  },
  {
    id: 'myEmploymentSummary',
    title: 'My employment',
    portals: ['employee'],
    defaultColSpan: 2,
    defaultRowSpan: DEFAULT_ROW_SPAN,
    accentColor: 'blue',
    defaultEnabled: true,
    isVisible: () => true,
    fields: MY_EMPLOYMENT_SUMMARY_FIELDS,
    defaultFieldIds: ['status', 'workerType', 'tenure', 'annualSalary'],
    useData: useMyEmploymentSummaryData,
  },
  {
    id: 'myTimeOff',
    title: 'My time off',
    portals: ['employee'],
    defaultColSpan: 1,
    defaultRowSpan: SHARE_CHART_ROW_SPAN,
    accentColor: 'amber',
    defaultEnabled: false,
    isVisible: () => true,
    fields: MY_TIME_OFF_FIELDS,
    defaultFieldIds: ['pending', 'approved', 'daysThisYear'],
    chartKind: 'share',
    useData: useMyTimeOffData,
  },
  {
    id: 'upcomingHolidays',
    title: 'Upcoming holidays',
    portals: ['employee'],
    defaultColSpan: 1,
    defaultRowSpan: DEFAULT_ROW_SPAN,
    accentColor: 'pink',
    defaultEnabled: false,
    isVisible: () => true,
    fields: UPCOMING_HOLIDAYS_FIELDS,
    defaultFieldIds: ['nextHoliday', 'nextDate', 'daysAway'],
    useData: useUpcomingHolidaysData,
  },
];

export const defaultLayoutFor = (id: WidgetId): WidgetLayout => {
  const widget = WIDGET_REGISTRY.find((entry) => entry.id === id);
  return {
    id,
    colSpan: widget?.defaultColSpan ?? 1,
    rowSpan: widget?.defaultRowSpan ?? DEFAULT_ROW_SPAN,
    fieldIds: widget?.defaultFieldIds ?? [],
    displayMode: 'chart',
  };
};

// The catalog a given user may pick from: gated first by portal (so a widget's
// query is never issued by a role that can't read it), then by role.
export const visibleWidgetsFor = (user: AuthUser | null): readonly WidgetDefinition[] => {
  const portal = user?.portal;
  if (!portal || portal === 'none') return [];
  return WIDGET_REGISTRY.filter(
    (widget) => widget.portals.includes(portal as WidgetPortal) && widget.isVisible(user),
  );
};

export const defaultWidgetsForPortal = (portal: WidgetPortal): readonly WidgetLayout[] =>
  WIDGET_REGISTRY.filter(
    (widget) => widget.defaultEnabled && widget.portals.includes(portal),
  ).map((widget) => defaultLayoutFor(widget.id));
