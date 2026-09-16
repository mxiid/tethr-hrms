import type { EmploymentStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconChevronDown,
  IconChevronRight,
  IconFocusCentered,
  IconUserPlus,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { prefersCoarsePointer } from '../../../components/form/pointer';
import { Tooltip } from '../../../components/tooltip/Tooltip';
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
  readonly workEmail: string | null;
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
  /** Directory search: matching cards are highlighted and revealed, never hidden. */
  readonly searchTerm?: string;
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

// Smooth scrolling is motion too — reduced-motion users get an instant jump.
const scrollMatchIntoView = (match: Element | null | undefined): void => {
  if (!(match instanceof HTMLElement)) {
    return;
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  match.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'center',
    inline: 'center',
  });
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const clampZoom = (value: number): number =>
  Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100;

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

type OrgChildrenProps = {
  readonly open: boolean;
  readonly children: ReactNode;
};

/**
 * Auto-height expand/collapse for a node's reports: the grid row animates
 * 0fr → 1fr and the item clips only while closed or mid-transition, so card
 * popovers are never cut off at rest. Children stay mounted — that is what
 * lets the collapse animate too.
 */
const OrgChildren = ({ open, children }: OrgChildrenProps) => {
  const [settledOpen, setSettledOpen] = useState(open);
  const animating = open !== settledOpen;
  const innerRef = useRef<HTMLDivElement | null>(null);

  // Children stay mounted so the collapse can animate; keep the hidden subtree
  // out of the tab order and the accessibility tree while it is closed.
  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    if (open) {
      element.removeAttribute('inert');
    } else {
      element.setAttribute('inert', '');
    }
  }, [open]);

  return (
    <div
      aria-hidden={open ? undefined : true}
      className={`org-children${open ? ' is-open' : ''}`}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === 'grid-template-rows'
        ) {
          setSettledOpen(open);
        }
      }}
    >
      <div
        className={`org-children-inner${animating ? ' is-clipped' : ''}`}
        ref={innerRef}
      >
        {children}
      </div>
    </div>
  );
};

const matchesSearch = (employee: OrgChartEmployee, needle: string): boolean =>
  [
    fullName(employee),
    employee.employeeNumber,
    employee.workEmail ?? '',
    employee.roleTitle ?? '',
    employee.currentAssignment?.positionTitle ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);

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
  searchTerm = '',
}: OrgChartProps) => {
  const { theme } = useTheme();
  const forest = useMemo(() => buildForest(employees), [employees]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Which node has its manager picker open. Drag-and-drop is the fast path;
  // this is the one that works on touch and by keyboard.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  // The canvas's natural (100%) size. The scroll area is sized to this times
  // the zoom, so the viewport genuinely grows and shrinks with the content
  // instead of scaling cards inside a fixed frame.
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const canEdit = Boolean(onReassign);
  const needle = searchTerm.trim().toLowerCase();
  const isSearching = needle !== '';

  // --- Search: highlight and reveal, never hide ---------------------------------
  const matchedIds = useMemo(
    () =>
      isSearching
        ? new Set(
            employees
              .filter((employee) => matchesSearch(employee, needle))
              .map((employee) => employee.id),
          )
        : new Set<string>(),
    [employees, isSearching, needle],
  );
  const hasMatches = matchedIds.size > 0;

  // Ancestors of every match, so a collapsed branch opens to reveal it without
  // discarding the user's own collapse state — clearing the search restores it.
  const revealIds = useMemo(() => {
    if (matchedIds.size === 0) return new Set<string>();
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    const reveal = new Set<string>();
    for (const matchId of matchedIds) {
      let current = byId.get(matchId);
      let guard = 0;
      while (current !== undefined && guard <= employees.length) {
        const managerId = current.currentAssignment?.reportsToEmployeeId ?? null;
        if (!managerId || managerId === current.id) break;
        reveal.add(managerId);
        current = byId.get(managerId);
        guard += 1;
      }
    }
    return reveal;
  }, [employees, matchedIds]);

  // Bring the first match into view once the tree has re-rendered with its
  // ancestors expanded.
  useEffect(() => {
    if (!isSearching || matchedIds.size === 0) return undefined;
    const timer = window.setTimeout(() => {
      scrollMatchIntoView(scrollRef.current?.querySelector('.org-node.is-match'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isSearching, matchedIds]);

  // A wide tree is centred, so it opens scrolled to one edge with the root off
  // screen. Start in the middle, where the root is. The sizer only gains its
  // scroll extent after the canvas has been measured, so the recentre waits for
  // that measurement — and only runs for a fresh tree: expanding or collapsing
  // a branch resizes the canvas too, and must not yank the viewport sideways.
  const centerPendingRef = useRef(true);
  useEffect(() => {
    centerPendingRef.current = true;
  }, [forest]);

  // Measure the untransformed canvas; ResizeObserver keeps it in step with
  // content, font, and collapse changes.
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const measure = (): void => {
      setCanvasSize({ width: element.offsetWidth, height: element.offsetHeight });
    };
    measure();
    // A same-size tree has no measurement left to wait for, so drop the
    // pending recentre rather than letting it fire on an unrelated later resize.
    if (element.offsetWidth === canvasSize.width && element.offsetHeight === canvasSize.height) {
      centerPendingRef.current = false;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [forest]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !centerPendingRef.current || canvasSize.width === 0) return;
    centerPendingRef.current = false;
    node.scrollLeft = Math.max(0, (node.scrollWidth - node.clientWidth) / 2);
  }, [canvasSize.width, canvasSize.height]);

  // Anchor for the next zoom step: the pointer's position inside the viewport
  // (set by pinch/Ctrl+wheel) or null to scale around the viewport centre.
  const zoomAnchorRef = useRef<{ viewportX: number; viewportY: number } | null>(null);

  // Keep the anchored point — the cursor during a pinch, the viewport centre
  // for the buttons — steady while zooming, the way a diagram tool does.
  const previousZoomRef = useRef(zoom);
  useEffect(() => {
    const node = scrollRef.current;
    const previous = previousZoomRef.current;
    previousZoomRef.current = zoom;
    if (!node || previous === zoom) return;
    const ratio = zoom / previous;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    const viewportX = anchor ? anchor.viewportX : node.clientWidth / 2;
    const viewportY = anchor ? anchor.viewportY : node.clientHeight / 2;
    node.scrollLeft = (node.scrollLeft + viewportX) * ratio - viewportX;
    node.scrollTop = (node.scrollTop + viewportY) * ratio - viewportY;
  }, [zoom, canvasSize.width, canvasSize.height]);

  // Pinch to zoom (a trackpad pinch arrives as a wheel event with ctrlKey), and
  // Ctrl+wheel for a mouse. Plain wheel keeps scrolling the canvas. Re-attached
  // when the tree first renders, since the chart element does not exist while
  // the query is still loading.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomAnchorRef.current = {
        viewportX: event.clientX - rect.left,
        viewportY: event.clientY - rect.top,
      };
      setZoom((current) => clampZoom(current * Math.exp(-event.deltaY * 0.005)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [forest]);

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
    const isCollapsed = collapsed.has(employee.id) && !revealIds.has(employee.id);
    const hasReports = reports.length > 0;
    const isMatch = isSearching && matchedIds.has(employee.id);
    const isDimmed = isSearching && hasMatches && !isMatch;
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
            }${isDropTarget ? ' is-drop-target' : ''}${rejectsDrop ? ' is-drop-blocked' : ''}${
              isMatch ? ' is-match' : ''
            }${isDimmed ? ' is-dimmed' : ''}`}
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
              <IconUserPlus aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            </button>
          ) : null}

          {pickerFor === employee.id ? (
            <div className="org-node-picker">
              <div className="org-node-picker-title">
                {fullName(employee)} reports to
              </div>
              <input
                autoFocus={!prefersCoarsePointer()}
                className="org-node-picker-search"
                name="manager-search"
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
                  <IconChevronRight aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                  {totalReports}
                </>
              ) : (
                <IconChevronDown aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
              )}
            </button>
          ) : null}
        </div>

        {hasReports ? (
          <OrgChildren open={!isCollapsed}>
            <ul>{reports.map(renderNode)}</ul>
          </OrgChildren>
        ) : null}
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
    <div className="org-chart-frame">
      <div aria-label="Zoom" className="org-chart-zoom" role="group">
        <Tooltip label="Zoom out" side="top">
          <button
            aria-label="Zoom out"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => {
              zoomAnchorRef.current = null;
              setZoom((current) => clampZoom(current - ZOOM_STEP));
            }}
            type="button"
          >
            <IconZoomOut aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </button>
        </Tooltip>
        <Tooltip label="Reset zoom" side="top">
          <button
            aria-label={`Reset zoom (currently ${Math.round(zoom * 100)}%)`}
            className="org-chart-zoom-value"
            disabled={zoom === 1}
            onClick={() => {
              zoomAnchorRef.current = null;
              setZoom(1);
            }}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
        </Tooltip>
        <Tooltip label="Zoom in" side="top">
          <button
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => {
              zoomAnchorRef.current = null;
              setZoom((current) => clampZoom(current + ZOOM_STEP));
            }}
            type="button"
          >
            <IconZoomIn aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </button>
        </Tooltip>
        <Tooltip label="Centre on the first match" side="top">
          <button
            aria-label="Centre on the first match"
            disabled={!isSearching || !hasMatches}
            onClick={() => {
              scrollMatchIntoView(scrollRef.current?.querySelector('.org-node.is-match'));
            }}
            type="button"
          >
            <IconFocusCentered aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </button>
        </Tooltip>
      </div>
      <div className="org-chart" ref={scrollRef}>
        <div
          className="org-chart-sizer"
          style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom }}
        >
          <div
            className="org-chart-canvas"
            ref={canvasRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            <ul className="org-tree org-tree-root">{forest.map(renderNode)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
};
