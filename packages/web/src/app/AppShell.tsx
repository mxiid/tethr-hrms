import { useLazyQuery, useQuery } from '@apollo/client';
import type { PortalKind, WorkspaceBrandColor } from '@hrms/shared';
import {
  IconArrowsRightLeft,
  IconBriefcase,
  IconBuildingCommunity,
  IconChevronDown,
  IconClock,
  IconCurrencyDollar,
  IconFileInvoice,
  IconFileText,
  IconHome,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconMessageCircle,
  IconMoon,
  IconPlaneDeparture,
  IconReceipt,
  IconReportMoney,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconSpeakerphone,
  IconSun,
  IconUserCircle,
  IconUserPlus,
  IconCalendarEvent,
  IconListCheck,
  IconUsers,
  IconUsersGroup,
  IconX,
  type TablerIcon,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import {
  HAS_OTHER_WORKSPACES_QUERY,
  SWITCHABLE_WORKSPACES_QUERY,
} from '../modules/auth/graphql/auth.operations';
import { useAuth, type WorkspaceOption } from '../modules/auth/hooks/useAuth';
import { EMPLOYEES_QUERY } from '../modules/employees/graphql/employee.operations';
import { INVOICES_JUMP_QUERY } from '../modules/finance/billing/graphql/billing.operations';
import { PAYROLL_RUNS_QUERY } from '../modules/finance/payroll/graphql/payroll.operations';
import { MY_ORGANIZATION_QUERY } from '../modules/organization/graphql/organization.operations';
import { visibleSettingsTabs } from '../modules/settings/settingsTabs';
import { useTheme } from '../providers/theme/useTheme';

import { portalHome, portalLabel } from './portal';

type NavigationItem = {
  readonly label: string;
  readonly to: string;
  readonly icon: TablerIcon;
};

type NavigationLinkEntry = NavigationItem & { readonly kind: 'link' };

type NavigationGroupEntry = {
  readonly kind: 'group';
  readonly label: string;
  readonly icon: TablerIcon;
  readonly items: readonly NavigationItem[];
};

// A top-level entry is either a standalone pill (link) or a labeled
// dropdown (group) — related pages cluster under one pill (e.g. "People")
// instead of spilling into a flat, generic "More" catch-all.
type NavigationEntry = NavigationLinkEntry | NavigationGroupEntry;

type MyOrganization = {
  readonly id: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly brandColor: string;
};
type MyOrganizationData = { readonly myOrganization: MyOrganization };

const tethrNavigation: readonly NavigationEntry[] = [
  { kind: 'link', label: 'Dashboard', to: '/dashboard', icon: IconLayoutDashboard },
  { kind: 'link', label: 'Clients', to: '/clients', icon: IconBuildingCommunity },
  {
    kind: 'group',
    label: 'People',
    icon: IconUsersGroup,
    items: [
      { label: 'Employees', to: '/employees', icon: IconUsersGroup },
      { label: 'Org chart', to: '/employees/org-chart', icon: IconSitemap },
      { label: 'Time & attendance', to: '/attendance', icon: IconClock },
      { label: 'Leave triage', to: '/leave', icon: IconPlaneDeparture },
    ],
  },
  {
    kind: 'group',
    label: 'Hiring',
    icon: IconBriefcase,
    items: [
      { label: 'Requests', to: '/hiring', icon: IconBriefcase },
      { label: 'Candidates', to: '/hiring/candidates', icon: IconUsers },
      { label: 'Shortlists', to: '/hiring/shortlists', icon: IconListCheck },
      { label: 'Interviews', to: '/hiring/interviews', icon: IconCalendarEvent },
    ],
  },
  {
    kind: 'group',
    label: 'Finance',
    icon: IconReportMoney,
    items: [
      { label: 'Pay', to: '/compensation', icon: IconCurrencyDollar },
      { label: 'Payroll', to: '/payroll', icon: IconReportMoney },
      { label: 'Billing', to: '/billing', icon: IconFileInvoice },
      { label: 'Expenses', to: '/expenses', icon: IconReceipt },
    ],
  },
  {
    kind: 'group',
    label: 'Engage',
    icon: IconSpeakerphone,
    items: [
      { label: 'Announcements', to: '/announcements', icon: IconSpeakerphone },
      { label: 'Feedback', to: '/feedback', icon: IconMessageCircle },
    ],
  },
];

const clientNavigation: readonly NavigationEntry[] = [
  { kind: 'link', label: 'Overview', to: '/client', icon: IconBuildingCommunity },
  {
    kind: 'group',
    label: 'People',
    icon: IconUsersGroup,
    items: [
      { label: 'Employees', to: '/employees', icon: IconUsersGroup },
      { label: 'Org chart', to: '/employees/org-chart', icon: IconSitemap },
      { label: 'Time & attendance', to: '/attendance', icon: IconClock },
      { label: 'Leave requests', to: '/leave', icon: IconPlaneDeparture },
    ],
  },
  // Clients only have the requests page — no ATS tabs — so it is a plain pill
  // rather than a one-item group.
  { kind: 'link', label: 'Hiring', to: '/hiring', icon: IconBriefcase },
  { kind: 'link', label: 'Pay', to: '/compensation', icon: IconCurrencyDollar },
  { kind: 'link', label: 'Expenses', to: '/expenses', icon: IconReceipt },
  { kind: 'link', label: 'Announcements', to: '/announcements', icon: IconSpeakerphone },
];

// Deliberately five leaf destinations and no groups: an employee sees only their
// own screens, never the shape of the rest of the product. The same five render
// as top pills on a desktop and as the bottom bar on a phone.
const employeeNavigation: readonly NavigationEntry[] = [
  { kind: 'link', label: 'Home', to: '/me', icon: IconHome },
  { kind: 'link', label: 'Attendance', to: '/me/attendance', icon: IconClock },
  { kind: 'link', label: 'Leave', to: '/me/leave', icon: IconPlaneDeparture },
  { kind: 'link', label: 'Payslips', to: '/me/payslips', icon: IconFileText },
  { kind: 'link', label: 'Profile', to: '/me/profile', icon: IconUserCircle },
];

// A destination matches a detail route too, so the group's sub-nav strip stays
// visible on `/payroll/:runId`, `/employees/:employeeId`, `/billing/:invoiceId`.
const isWithinPath = (pathname: string, to: string): boolean =>
  pathname === to || pathname.startsWith(`${to}/`);

// Most specific match wins: an entry is active when it matches the path and no
// sibling matches a longer destination. Without this, "Employees" stays lit on
// `/employees/org-chart` — and on any future pair where one route prefixes
// another (`/payroll` vs `/payroll/:runId` is deliberate; siblings must not be).
const isEntryActive = (pathname: string, to: string, siblings: readonly string[]): boolean =>
  isWithinPath(pathname, to) &&
  !siblings.some(
    (other) => other !== to && other.startsWith(`${to}/`) && isWithinPath(pathname, other),
  );

const NAV_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

type JumpResult = {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly to: string;
};


export const AppShell = () => {
  const { theme, toggle } = useTheme();
  const { user, logout, switchWorkspace, isBusy: authBusy } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // Phone navigation is a drawer, not the pill row — see the mobile block in
  // global.css. Kept as separate state so the two never fight for the same menu.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const topnavRef = useRef<HTMLElement | null>(null);
  const subnavRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Clicking anywhere outside the top bar dismisses the workspace dropdown and
  // folds the section strip back up. `topnavRef` covers the pills, the workspace
  // menu, and the search; the strip is its own sibling element.
  useEffect(() => {
    const isOutsideChrome = (target: Node): boolean =>
      !topnavRef.current?.contains(target) && !subnavRef.current?.contains(target);
    // The dropdown is an overlay, so closing it on mousedown is fine.
    const onMouseDown = (event: MouseEvent): void => {
      if (isOutsideChrome(event.target as Node)) setOpenMenu(null);
    };
    // The strip is in normal flow: folding it on mousedown shifts the content
    // up before mouseup, so the element under the pointer changes and the click
    // is swallowed. Fold after the click has been dispatched instead.
    const onClick = (event: MouseEvent): void => {
      if (!isOutsideChrome(event.target as Node)) return;
      setSubnavMode((current) => (current.mode === 'closed' ? current : { mode: 'closed' }));
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // Cmd+K (Mac) / Ctrl+K (everywhere else) jumps straight to the search
  // field, the same shortcut every modern SaaS app trains people to reach for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // navRef wraps every pill, including plain links, so clicking one doesn't
  // count as "outside" and close a sibling dropdown — this effect is what
  // actually closes it, by reacting to the resulting route change instead.
  useEffect(() => {
    setOpenMenu(null);
    setMobileNavOpen(false);
  }, [pathname]);

  // Remember the last app page, so closing the full-screen settings surface
  // returns there instead of stepping back through settings history.
  useEffect(() => {
    if (!pathname.startsWith('/settings')) {
      window.sessionStorage.setItem('hrms.lastAppPath', pathname);
    }
  }, [pathname]);

  // The workspace switcher is two steps now — trigger -> pick a workspace —
  // with no password step: the picker loads the caller's other workspaces and
  // entering one mints a session straight from the current one. Reset whenever
  // the dropdown isn't the open one so it always restarts fresh.
  const [switchStep, setSwitchStep] = useState<'trigger' | 'picker'>('trigger');
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [loadSwitchableWorkspaces, { data: switchableData, loading: loadingSwitchable }] =
    useLazyQuery<{ readonly switchableWorkspaces: readonly WorkspaceOption[] }>(
      SWITCHABLE_WORKSPACES_QUERY,
      { fetchPolicy: 'network-only' },
    );
  const switchableWorkspaces = switchableData?.switchableWorkspaces ?? [];

  useEffect(() => {
    if (openMenu !== 'workspace') {
      setSwitchStep('trigger');
      setSwitchError(null);
    }
  }, [openMenu]);

  const { data: orgData } = useQuery<MyOrganizationData>(MY_ORGANIZATION_QUERY);
  const { data: workspacesData } = useQuery<{ readonly hasOtherWorkspaces: boolean }>(
    HAS_OTHER_WORKSPACES_QUERY,
  );
  const hasOtherWorkspaces = workspacesData?.hasOtherWorkspaces ?? false;

  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const ThemeIcon = theme.name === 'light' ? IconMoon : IconSun;
  const portal = user?.portal ?? 'none';
  const navigation =
    portal === 'tethr'
      ? tethrNavigation
      : portal === 'client'
        ? clientNavigation
        : employeeNavigation;
  // The employee portal is a different kind of surface: five of their own
  // screens and nothing else. It drops the search field and the drawer, and on a
  // phone its nav becomes a fixed bottom bar instead of a hamburger.
  const isEmployeePortal = portal === 'employee';
  const canManagePayroll =
    user?.roleKeys?.includes('tethrAdmin') === true ||
    user?.roleKeys?.includes('tethrFinance') === true;
  // Compensation ("Pay") is a third gate inside the Finance group. Keep this
  // role list aligned with the /compensation route's RequirePortal gate so the
  // nav never shows a link the route would reject — and never hides one it
  // admits. Gate per item, never per group: a whole-group Finance gate would
  // hide Pay from tethrHr/tethrFinance.
  const canViewCompensation =
    user?.roleKeys?.includes('tethrAdmin') === true ||
    user?.roleKeys?.includes('tethrHr') === true ||
    user?.roleKeys?.includes('tethrFinance') === true ||
    user?.roleKeys?.includes('clientAdmin') === true;
  const canManageClients = user?.roleKeys?.includes('tethrAdmin') === true;
  // The workspace banner is the workspace-level menu (Twenty's shape): settings
  // for anyone with a settings section, and an invite shortcut for user admins.
  const canOpenSettings = visibleSettingsTabs(user).length > 0;
  const canInviteUsers =
    user?.roleKeys?.includes('tethrAdmin') === true ||
    user?.roleKeys?.includes('clientAdmin') === true;
  const isVisibleItem = (item: NavigationItem): boolean => {
    if (item.to === '/compensation') return canViewCompensation;
    if (item.to === '/payroll' || item.to === '/billing') return canManagePayroll;
    // Expense claims: Tethr's HR/Finance review and pay; client roles approve
    // their own workspace's claims. The route gate carries the same list.
    if (item.to === '/expenses') {
      return Boolean(
        user?.roleKeys.includes('tethrAdmin') ||
          user?.roleKeys.includes('tethrHr') ||
          user?.roleKeys.includes('tethrFinance') ||
          user?.roleKeys.includes('clientAdmin') ||
          user?.roleKeys.includes('clientMember'),
      );
    }
    // The candidate pool, shortlists and interviews are Tethr-only data.
    if (
      item.to === '/hiring/candidates' ||
      item.to === '/hiring/shortlists' ||
      item.to === '/hiring/interviews'
    ) {
      return Boolean(
        user?.roleKeys.includes('tethrAdmin') || user?.roleKeys.includes('tethrHr'),
      );
    }
    // Hiring requests need hiring-request:read; tethrFinance holds neither that
    // nor the Tethr ATS permissions, so the item is hidden for them.
    if (item.to === '/hiring') {
      if (user?.portal !== 'tethr') return true;
      return Boolean(
        user?.roleKeys.includes('tethrAdmin') || user?.roleKeys.includes('tethrHr'),
      );
    }
    return true;
  };
  const visibleNavigation: readonly NavigationEntry[] = navigation
    .filter((entry) => entry.kind !== 'link' || entry.to !== '/clients' || canManageClients)
    .filter((entry) => entry.kind !== 'link' || entry.to !== '/compensation' || canViewCompensation)
    .map((entry): NavigationEntry => {
      if (entry.kind === 'link') return entry;
      // Workspace users live in /settings/members now, not in the People strip.
      const items = entry.items.filter(isVisibleItem);
      return { ...entry, items };
    })
    // A group whose items all filtered out disappears entirely.
    .filter((entry) => entry.kind === 'link' || entry.items.length > 0);

  // Every destination in the visible nav, for the most-specific-match rule.
  const navigationPaths: readonly string[] = visibleNavigation.flatMap((entry) =>
    entry.kind === 'link' ? [entry.to] : entry.items.map((item) => item.to),
  );

  // The group whose own sub-pages the user is currently on, if any.
  const activeGroupEntry = visibleNavigation.find(
    (entry): entry is NavigationGroupEntry =>
      entry.kind === 'group' && entry.items.some((item) => isWithinPath(pathname, item.to)),
  );

  // The strip below the pills shows one group's sections. By default that is
  // the group you're inside; clicking another group's pill expands its sections
  // there (no dropdown), clicking the shown one folds the strip away, and any
  // navigation snaps back to the destination's own group.
  const [subnavMode, setSubnavMode] = useState<
    { readonly mode: 'auto' } | { readonly mode: 'open'; readonly label: string } | { readonly mode: 'closed' }
  >({ mode: 'auto' });
  const displayedGroup =
    subnavMode.mode === 'open'
      ? (visibleNavigation.find(
          (entry): entry is NavigationGroupEntry =>
            entry.kind === 'group' && entry.label === subnavMode.label,
        ) ?? activeGroupEntry)
      : subnavMode.mode === 'closed'
        ? null
        : activeGroupEntry;

  // The tab row stays mounted while the strip folds so the height can animate
  // down; it is simply inert once hidden. Keyed by label, not the entry object,
  // because `visibleNavigation` rebuilds identities every render.
  const displayedLabel = displayedGroup?.label ?? null;
  const [lastGroupLabel, setLastGroupLabel] = useState<string | null>(displayedLabel);
  const subnavInnerRef = useRef<HTMLDivElement | null>(null);
  const tabsGroup =
    visibleNavigation.find(
      (entry): entry is NavigationGroupEntry =>
        entry.kind === 'group' && entry.label === (displayedLabel ?? lastGroupLabel),
    ) ?? null;

  useEffect(() => {
    if (displayedLabel !== null) setLastGroupLabel(displayedLabel);
  }, [displayedLabel]);

  useEffect(() => {
    const element = subnavInnerRef.current;
    if (!element) return;
    if (displayedLabel !== null) {
      element.removeAttribute('inert');
    } else {
      element.setAttribute('inert', '');
    }
  }, [displayedLabel]);

  // Landing on a new route always snaps the strip back to that section's group.
  useEffect(() => {
    setSubnavMode({ mode: 'auto' });
  }, [pathname]);

  const onGroupClick = (label: string): void => {
    setSubnavMode(
      displayedGroup?.label === label ? { mode: 'closed' } : { mode: 'open', label },
    );
  };

  // --- Jump-to (⌘K) ---
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: jumpEmployeesData } = useQuery<{
    readonly employees: readonly {
      readonly id: string;
      readonly employeeNumber: string;
      readonly firstName: string;
      readonly lastName: string;
    }[];
  }>(EMPLOYEES_QUERY, { skip: isEmployeePortal || !searchOpen });
  const [loadJumpRuns, { data: jumpRunsData }] = useLazyQuery<{
    readonly payrollRuns: readonly {
      readonly id: string;
      readonly periodYear: number;
      readonly periodMonth: number;
      readonly status: string;
    }[];
  }>(PAYROLL_RUNS_QUERY);
  const [loadJumpInvoices, { data: jumpInvoicesData }] = useLazyQuery<{
    readonly invoices: readonly {
      readonly id: string;
      readonly number: string | null;
      readonly status: string;
      readonly serviceYear: number;
      readonly serviceMonth: number;
      readonly totalAmount: number;
    }[];
  }>(INVOICES_JUMP_QUERY);

  const openSearch = (): void => {
    setSearchOpen(true);
    if (canManagePayroll) {
      // Jump results are a convenience; a failed load leaves the sections empty
      // rather than surfacing an error, but it must never reject unhandled.
      void loadJumpRuns().catch(() => undefined);
      void loadJumpInvoices().catch(() => undefined);
    }
  };

  const onLogout = async (): Promise<void> => {
    try {
      await logout();
    } finally {
      // Even a failed cache clear must not strand the user in a signed-out shell.
      navigate('/login', { replace: true });
    }
  };

  const jumpResults = useMemo<readonly JumpResult[]>(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return [];
    }
    const results: JumpResult[] = [];
    for (const entry of visibleNavigation) {
      const items = entry.kind === 'link' ? [entry] : entry.items;
      for (const item of items) {
        if (item.label.toLowerCase().includes(query)) {
          results.push({ key: `nav:${item.to}`, label: item.label, hint: 'Page', to: item.to });
        }
      }
    }
    for (const employee of jumpEmployeesData?.employees ?? []) {
      const name = `${employee.firstName} ${employee.lastName}`;
      if (
        name.toLowerCase().includes(query) ||
        employee.employeeNumber.toLowerCase().includes(query)
      ) {
        results.push({
          key: `emp:${employee.id}`,
          label: name,
          hint: employee.employeeNumber,
          to: `/employees/${employee.id}`,
        });
      }
    }
    if (canManagePayroll) {
      for (const run of jumpRunsData?.payrollRuns ?? []) {
        const label = `${NAV_MONTHS[run.periodMonth - 1] ?? run.periodMonth} ${run.periodYear}`;
        if (
          label.toLowerCase().includes(query) ||
          `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`.includes(query)
        ) {
          results.push({
            key: `run:${run.id}`,
            label,
            hint: `Payroll run · ${run.status}`,
            to: `/payroll/${run.id}`,
          });
        }
      }
      for (const invoice of jumpInvoicesData?.invoices ?? []) {
        const label =
          invoice.number ??
          `Invoice ${invoice.serviceYear}-${String(invoice.serviceMonth).padStart(2, '0')}`;
        if (label.toLowerCase().includes(query) || invoice.status.includes(query)) {
          results.push({
            key: `inv:${invoice.id}`,
            label,
            hint: `Invoice · ${invoice.status}`,
            to: `/billing/${invoice.id}`,
          });
        }
      }
    }
    return results.slice(0, 8);
  }, [
    search,
    visibleNavigation,
    jumpEmployeesData,
    jumpRunsData,
    jumpInvoicesData,
    canManagePayroll,
  ]);

  const onJump = (to: string): void => {
    setSearch('');
    setSearchOpen(false);
    navigate(to);
  };

  const organization = orgData?.myOrganization;
  const brandColor = (organization?.brandColor ?? 'gray') as WorkspaceBrandColor;
  const chipColorVar = { '--chip-color': `var(--hrms-color-tag-${brandColor})` } as CSSProperties;

  // Switches in place instead of bouncing out to /login, with no password
  // step: the caller already holds a valid session and every workspace in the
  // picker is one of their own accounts (same email), so `switchWorkspace`
  // mints the new session straight from the current one. The hook clears the
  // Apollo cache before installing the new session, so navigating here can
  // never render the previous workspace's cached queries (TET-217).
  const finishWorkspaceSwitch = (portal: PortalKind): void => {
    setOpenMenu(null);
    navigate(portalHome(portal), { replace: true });
  };

  const openWorkspacePicker = (): void => {
    setSwitchError(null);
    setSwitchStep('picker');
    void loadSwitchableWorkspaces().catch(() => {
      setSwitchError('Could not load your workspaces');
    });
  };

  const onPickSwitchWorkspace = async (organizationId: string): Promise<void> => {
    setSwitchError(null);
    try {
      const session = await switchWorkspace(organizationId);
      finishWorkspaceSwitch(session.user.portal);
    } catch (caught) {
      setSwitchError(caught instanceof Error ? caught.message : 'Could not open that workspace');
    }
  };

  const renderPill = (item: NavigationItem) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.label}
        className={({ isActive }) => `nav-pill${isActive ? ' is-active' : ''}`}
        end={isEmployeePortal}
        to={item.to}
      >
        <Icon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const renderGroup = (entry: NavigationGroupEntry) => {
    const Icon = entry.icon;
    const isOpen = displayedGroup?.label === entry.label;
    const isActive = entry.items.some((item) => isWithinPath(pathname, item.to));
    return (
      <button
        aria-expanded={isOpen}
        className={`nav-pill nav-pill-group${isActive ? ' is-active' : ''}${isOpen ? ' is-open' : ''}`}
        key={entry.label}
        onClick={() => onGroupClick(entry.label)}
        type="button"
      >
        <Icon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        <span>{entry.label}</span>
        <IconChevronDown aria-hidden="true"
          className="nav-pill-caret"
          size={theme.icon.size.sm}
          stroke={theme.icon.stroke.sm}
        />
      </button>
    );
  };

  return (
    <div
      className={`app-shell${isEmployeePortal ? ' app-shell-employee' : ''}`}
      style={chipColorVar}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-topnav" ref={topnavRef}>
        <div className="topnav-left">
          {isEmployeePortal ? null : (
            <button
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="mobile-nav-toggle"
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? (
                <IconX aria-hidden="true" size={theme.icon.size.lg} stroke={theme.icon.stroke.md} />
              ) : (
                <IconMenu2 aria-hidden="true" size={theme.icon.size.lg} stroke={theme.icon.stroke.md} />
              )}
            </button>
          )}
          <div className="topnav-brand" aria-hidden="true">
            H
          </div>
          <div className="dropdown-anchor">
            <button
              aria-expanded={openMenu === 'workspace'}
              className="workspace-chip workspace-chip-button"
              onClick={() =>
                setOpenMenu((current) => (current === 'workspace' ? null : 'workspace'))
              }
              title={organization?.legalName}
              type="button"
            >
              <span className="workspace-chip-dot" aria-hidden="true" />
              <span className="workspace-chip-name truncate">
                {organization?.displayName ?? 'Workspace'}
              </span>
              <IconChevronDown aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            </button>
            {openMenu === 'workspace' ? (
              <div
                aria-label={organization?.displayName ?? 'Workspace'}
                className="dropdown-panel dropdown-panel-workspace"
                role="group"
              >
                {switchStep === 'trigger' ? (
                  <>
                    <div className="workspace-menu-header">
                      <div className="account-dropdown-email truncate">
                        {organization?.legalName ?? 'Workspace'}
                      </div>
                      <div className="account-dropdown-portal">
                        {portalLabel(portal)} workspace
                      </div>
                    </div>
                    <button
                      className="dropdown-nav-item"
                      onClick={() => {
                        setOpenMenu(null);
                        toggle();
                      }}
                      type="button"
                    >
                      <ThemeIcon aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                      <span>Theme · {theme.name === 'light' ? 'Light' : 'Dark'}</span>
                    </button>
                    {canInviteUsers ? (
                      <Link
                        className="dropdown-nav-item"
                        onClick={() => setOpenMenu(null)}
                        to="/settings/members"
                      >
                        <IconUserPlus aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                        <span>Invite user</span>
                      </Link>
                    ) : null}
                    {canOpenSettings ? (
                      <Link
                        className="dropdown-nav-item"
                        onClick={() => setOpenMenu(null)}
                        to="/settings"
                      >
                        <IconSettings aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                        <span>Settings</span>
                      </Link>
                    ) : null}
                    {hasOtherWorkspaces ? (
                      <button className="dropdown-nav-item" onClick={openWorkspacePicker} type="button">
                        <IconArrowsRightLeft aria-hidden="true"
                          size={theme.icon.size.sm}
                          stroke={theme.icon.stroke.sm}
                        />
                        <span>Switch workspace</span>
                      </button>
                    ) : null}
                    <button
                      className="dropdown-nav-item dropdown-nav-item-danger"
                      onClick={() => {
                        setOpenMenu(null);
                        void onLogout();
                      }}
                      type="button"
                    >
                      <IconLogout aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                      <span>Log out</span>
                    </button>
                  </>
                ) : null}

                {switchStep === 'picker' ? (
                  <div>
                    <p className="account-dropdown-hint">Choose a workspace to switch to.</p>
                    {switchError ? (
                      <p className="auth-error" role="alert">
                        {switchError}
                      </p>
                    ) : null}
                    {loadingSwitchable ? (
                      <p className="account-dropdown-hint">Loading…</p>
                    ) : switchableWorkspaces.length === 0 ? (
                      <p className="account-dropdown-hint">You have no other workspaces.</p>
                    ) : (
                      <div className="workspace-option-list">
                        {switchableWorkspaces.map((workspace) => (
                          <button
                            key={workspace.organizationId}
                            className="button button-secondary button-full"
                            disabled={authBusy}
                            type="button"
                            onClick={() => void onPickSwitchWorkspace(workspace.organizationId)}
                          >
                            {workspace.organizationName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <nav className="topnav-pills" aria-label="Primary navigation">
          {visibleNavigation.map((entry) =>
            entry.kind === 'link' ? renderPill(entry) : renderGroup(entry),
          )}
        </nav>

        <div className="topnav-right">
          {isEmployeePortal ? null : (
            <div className="topbar-search-anchor">
              <label className="topbar-search">
                <IconSearch aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                <input
                  aria-label="Search"
                  autoComplete="off"
                  name="global-search"
                  onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    openSearch();
                  }}
                  onFocus={openSearch}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && jumpResults[0]) {
                      onJump(jumpResults[0].to);
                    } else if (event.key === 'Escape') {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search"
                  ref={searchInputRef}
                  spellCheck={false}
                  type="search"
                  value={search}
                />
                <kbd className="topbar-search-kbd">{isMac ? '⌘\u00A0K' : 'Ctrl\u00A0K'}</kbd>
              </label>
              {searchOpen && search.trim() ? (
                <div className="topbar-search-results">
                  {jumpResults.length === 0 ? (
                    <div className="topbar-search-empty">No matches</div>
                  ) : (
                    jumpResults.map((result) => (
                      <button
                        className="topbar-search-result"
                        key={result.key}
                        onClick={() => onJump(result.to)}
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                      >
                        <span>{result.label}</span>
                        <span className="employee-secondary">{result.hint}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {/* Phone navigation. The pill row and sub-nav are display:none below the
          breakpoint; this drawer carries the same destinations, flattened so a
          group's pages are reachable in one tap instead of two. */}
      {mobileNavOpen ? (
        <>
          <button
            aria-label="Close menu"
            className="mobile-nav-scrim"
            tabIndex={-1}
            type="button"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="mobile-nav" aria-label="Primary navigation">
            {visibleNavigation.map((entry) => {
              if (entry.kind === 'link') {
                const Icon = entry.icon;
                const linkIsActive = isEntryActive(pathname, entry.to, navigationPaths);
                return (
                  <Link
                    aria-current={linkIsActive ? 'page' : undefined}
                    key={entry.label}
                    className={`mobile-nav-item${linkIsActive ? ' is-active' : ''}`}
                    to={entry.to}
                  >
                    <Icon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    <span>{entry.label}</span>
                  </Link>
                );
              }
              const groupPaths = entry.items.map((item) => item.to);
              return (
                <section className="mobile-nav-group" key={entry.label}>
                  <div className="mobile-nav-group-label">{entry.label}</div>
                  {entry.items.map((item) => {
                    const ItemIcon = item.icon;
                    const itemIsActive = isEntryActive(pathname, item.to, groupPaths);
                    return (
                      <Link
                        aria-current={itemIsActive ? 'page' : undefined}
                        key={item.label}
                        className={`mobile-nav-item${itemIsActive ? ' is-active' : ''}`}
                        to={item.to}
                      >
                        <ItemIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </section>
              );
            })}

            <section className="mobile-nav-group">
              <div className="mobile-nav-group-label">Account</div>
              <button
                className="mobile-nav-item"
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  void onLogout();
                }}
              >
                <IconLogout aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                <span>Sign out</span>
              </button>
            </section>
          </nav>
        </>
      ) : null}

      <nav
        aria-hidden={displayedGroup === null ? true : undefined}
        aria-label={tabsGroup ? `${tabsGroup.label} sections` : 'Sections'}
        className={`app-subnav${displayedGroup ? ' is-open' : ''}`}
        ref={subnavRef}
      >
        <div className="app-subnav-inner" ref={subnavInnerRef}>
          {tabsGroup ? (
            <div className="app-subnav-tabs" key={tabsGroup.label}>
              {tabsGroup.items.map((item) => {
                const ItemIcon = item.icon;
                const itemIsActive = isEntryActive(
                  pathname,
                  item.to,
                  tabsGroup.items.map((entryItem) => entryItem.to),
                );
                return (
                  <Link
                    aria-current={itemIsActive ? 'page' : undefined}
                    className={`subnav-tab${itemIsActive ? ' is-active' : ''}`}
                    key={item.label}
                    to={item.to}
                  >
                    <ItemIcon aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>

      <main className="app-content" id="main-content">
        <Outlet />
      </main>

      {/* Phone navigation for the employee portal: the same five destinations as
          the pill row, moved to thumb reach and carrying the workspace's own
          color on whichever pill is open. Hidden above the phone breakpoint,
          where the pill row is already visible. */}
      {isEmployeePortal ? (
        <nav className="bottom-nav" aria-label="Employee navigation">
          {visibleNavigation.map((entry) => {
            if (entry.kind !== 'link') return null;
            const Icon = entry.icon;
            return (
              <NavLink
                key={entry.label}
                className={({ isActive }) => `bottom-nav-item${isActive ? ' is-active' : ''}`}
                end
                to={entry.to}
              >
                <span className="bottom-nav-pill">
                  <Icon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                </span>
                <span className="bottom-nav-label">{entry.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
};

