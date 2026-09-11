import type { EmploymentStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import { IconChevronDown, IconChevronRight, IconUserPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';

type OrgChartAssignment = {
  readonly positionTitle: string | null;
  readonly reportsToEmployeeId: string | null;
};

type OrgChartEmployee = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roleTitle: string | null;
  readonly employmentStatus: EmploymentStatus;
  readonly currentAssignment: OrgChartAssignment | null;
};

type OrgChartProps = {
  readonly employees: readonly OrgChartEmployee[];
  readonly selectedId: string | null;
  readonly onSelect: (employeeId: string) => void;
  /** Omitted for viewers who cannot restructure — the chart then stays read-only. */
  readonly onReassign?: (employeeId: string, managerId: string | null) => void;
  readonly reassigning?: boolean;
};

type OrgNode = {
  readonly employee: OrgChartEmployee;
  readonly reports: readonly OrgNode[];
  readonly totalReports: number;
};

type ChipVarStyle = CSSProperties & { readonly '--chip-color': string };

const AVATAR_COLORS: readonly MainColorName[] = [
  'blue',
  'green',
  'violet',
  'amber',
  'tomato',
  'jade',
  'plum',
  'cyan',
];

const statusColors: Record<EmploymentStatus, MainColorName> = {
  active: 'green',
  onLeave: 'amber',
  suspended: 'tomato',
  terminated: 'gray',
};

const statusLabels: Record<EmploymentStatus, string> = {
  active: 'Active',
  onLeave: 'On leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

const fullName = (employee: OrgChartEmployee): string =>
  `${employee.firstName} ${employee.lastName}`.trim();

const initials = (employee: OrgChartEmployee): string =>
  `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();

const colorFor = (id: string): MainColorName => {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? 'blue';
};

const chipVar = (color: MainColorName): ChipVarStyle => ({
  '--chip-color': `var(--hrms-color-tag-${color})`,
});

// Turn the flat employee list into a reporting forest using each employee's
// `reportsToEmployeeId`. Anyone whose manager is missing (or is themselves)
// becomes a root; a cycle is broken by never revisiting an ancestor.
const buildForest = (employees: readonly OrgChartEmployee[]): readonly OrgNode[] => {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const reportsByManager = new Map<string, OrgChartEmployee[]>();
  const roots: OrgChartEmployee[] = [];

  for (const employee of employees) {
    const managerId = employee.currentAssignment?.reportsToEmployeeId ?? null;
    if (managerId && managerId !== employee.id && byId.has(managerId)) {
      const bucket = reportsByManager.get(managerId) ?? [];
      bucket.push(employee);
      reportsByManager.set(managerId, bucket);
    } else {
      roots.push(employee);
    }
  }

  const byName = (a: OrgChartEmployee, b: OrgChartEmployee): number =>
    fullName(a).localeCompare(fullName(b));

  const ancestors = new Set<string>();
  const toNode = (employee: OrgChartEmployee): OrgNode => {
    ancestors.add(employee.id);
    const reports = [...(reportsByManager.get(employee.id) ?? [])]
      .filter((report) => !ancestors.has(report.id))
      .sort(byName)
      .map(toNode);
    ancestors.delete(employee.id);
    const totalReports = reports.reduce((sum, node) => sum + 1 + node.totalReports, 0);
    return { employee, reports, totalReports };
  };

  return [...roots].sort(byName).map(toNode);
};

export const EmployeeOrgChart = ({
  employees,
  selectedId,
  onSelect,
  onReassign,
  reassigning = false,
}: OrgChartProps) => {
  const { theme } = useTheme();
  const forest = useMemo(() => buildForest(employees), [employees]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // A wide tree is centred, so it opens scrolled to one edge with the root off
  // screen. Start in the middle, where the root is.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollLeft = Math.max(0, (node.scrollWidth - node.clientWidth) / 2);
  }, [forest]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Which node has its manager picker open. Drag-and-drop is the fast path;
  // this is the one that works on touch and by keyboard.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  const canEdit = Boolean(onReassign);

  // Everyone below a node, so a manager cannot be dropped onto their own report.
  // The server refuses cycles too; this is what stops the drop looking legal.
  const descendantsOf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const walk = (node: OrgNode): Set<string> => {
      const below = new Set<string>();
      for (const report of node.reports) {
        below.add(report.employee.id);
        for (const id of walk(report)) below.add(id);
      }
      map.set(node.employee.id, below);
      return below;
    };
    forest.forEach(walk);
    return map;
  }, [forest]);

  const canDrop = (draggedId: string, targetId: string): boolean =>
    draggedId !== targetId && !(descendantsOf.get(draggedId)?.has(targetId) ?? false);

  const applyReassign = (employeeId: string, managerId: string | null): void => {
    setPickerFor(null);
    setPickerQuery('');
    setDragging(null);
    setDropTarget(null);
    onReassign?.(employeeId, managerId);
  };

  const toggle = (employeeId: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });

  const renderNode = (node: OrgNode): JSX.Element => {
    const { employee, reports, totalReports } = node;
    const isSelected = selectedId === employee.id;
    const isCollapsed = collapsed.has(employee.id);
    const hasReports = reports.length > 0;
    const subtitle =
      employee.roleTitle ?? employee.currentAssignment?.positionTitle ?? employee.employeeNumber;

    const isDropTarget = dropTarget === employee.id;
    const isDragging = dragging === employee.id;
    const rejectsDrop = dragging !== null && !canDrop(dragging, employee.id);

    return (
      <li key={employee.id}>
        <div className="org-node-wrap">
          <button
            aria-pressed={isSelected}
            className={`org-node${isSelected ? ' is-selected' : ''}${
              isDragging ? ' is-dragging' : ''
            }${isDropTarget ? ' is-drop-target' : ''}${rejectsDrop ? ' is-drop-blocked' : ''}`}
            draggable={canEdit && !reassigning}
            type="button"
            onClick={() => onSelect(employee.id)}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDragLeave={() => setDropTarget((current) => (current === employee.id ? null : current))}
            onDragOver={(event) => {
              if (!dragging || !canDrop(dragging, employee.id)) return;
              // Only preventDefault on a legal target, so an illegal one shows
              // the browser's "no drop" cursor rather than silently failing.
              event.preventDefault();
              setDropTarget(employee.id);
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', employee.id);
              setDragging(employee.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const draggedId = event.dataTransfer.getData('text/plain') || dragging;
              if (draggedId && canDrop(draggedId, employee.id)) {
                applyReassign(draggedId, employee.id);
              }
            }}
          >
            <span className="employee-avatar org-node-avatar" style={chipVar(colorFor(employee.id))}>
              {initials(employee)}
            </span>
            <span className="org-node-body">
              <span className="org-node-name truncate">{fullName(employee)}</span>
              <span className="org-node-role truncate">{subtitle}</span>
            </span>
            <span
              aria-label={statusLabels[employee.employmentStatus]}
              className="org-node-status"
              style={chipVar(statusColors[employee.employmentStatus])}
              title={statusLabels[employee.employmentStatus]}
            />
          </button>

          {canEdit ? (
            <button
              aria-label={`Change who ${fullName(employee)} reports to`}
              className="org-node-edit"
              disabled={reassigning}
              title="Change manager"
              type="button"
              onClick={() => {
                setPickerQuery('');
                setPickerFor((current) => (current === employee.id ? null : employee.id));
              }}
            >
              <IconUserPlus size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            </button>
          ) : null}

          {pickerFor === employee.id ? (
            <div className="org-node-picker">
              <div className="org-node-picker-title">
                {fullName(employee)} reports to
              </div>
              <input
                autoFocus
                className="org-node-picker-search"
                placeholder="Search people"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
              />
              <div className="org-node-picker-list">
                <button
                  className="org-node-picker-option"
                  type="button"
                  onClick={() => applyReassign(employee.id, null)}
                >
                  No manager (top of the chart)
                </button>
                {employees
                  .filter((candidate) => canDrop(employee.id, candidate.id))
                  .filter((candidate) =>
                    `${fullName(candidate)} ${candidate.roleTitle ?? ''}`
                      .toLowerCase()
                      .includes(pickerQuery.trim().toLowerCase()),
                  )
                  .slice(0, 40)
                  .map((candidate) => (
                    <button
                      className="org-node-picker-option"
                      key={candidate.id}
                      type="button"
                      onClick={() => applyReassign(employee.id, candidate.id)}
                    >
                      <span className="org-node-picker-name">{fullName(candidate)}</span>
                      {candidate.roleTitle ? (
                        <span className="org-node-picker-role">{candidate.roleTitle}</span>
                      ) : null}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          {hasReports ? (
            <button
              aria-expanded={!isCollapsed}
              aria-label={
                isCollapsed
                  ? `Show ${totalReports} report${totalReports === 1 ? '' : 's'}`
                  : 'Hide reports'
              }
              className="org-node-toggle"
              type="button"
              onClick={() => toggle(employee.id)}
            >
              {isCollapsed ? (
                <>
                  <IconChevronRight size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                  {totalReports}
                </>
              ) : (
                <IconChevronDown size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
              )}
            </button>
          ) : null}
        </div>

        {hasReports && !isCollapsed ? <ul>{reports.map(renderNode)}</ul> : null}
      </li>
    );
  };

  if (forest.length === 0) {
    return (
      <p className="org-chart-empty">
        No reporting lines yet — set a manager on an employee&rsquo;s assignment to build the chart.
      </p>
    );
  }

  return (
    <div className="org-chart" ref={scrollRef}>
      <ul className="org-tree org-tree-root">{forest.map(renderNode)}</ul>
    </div>
  );
};
