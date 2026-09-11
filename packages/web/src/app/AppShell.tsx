import { useApolloClient, useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { WORKSPACE_BRAND_COLORS, type PortalKind, type WorkspaceBrandColor } from '@hrms/shared';
import {
  IconArrowsRightLeft,
  IconBell,
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
  IconReportMoney,
  IconSearch,
  IconSitemap,
  IconSpeakerphone,
  IconSun,
  IconUserCircle,
  IconUserCog,
  IconUsersGroup,
  IconX,
  type TablerIcon,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import {
  HAS_OTHER_WORKSPACES_QUERY,
  SWITCHABLE_WORKSPACES_QUERY,
} from '../modules/auth/graphql/auth.operations';
import { useAuth, type WorkspaceOption } from '../modules/auth/hooks/useAuth';
import { EMPLOYEES_QUERY } from '../modules/employees/graphql/employee.operations';
import { INVOICES_JUMP_QUERY } from '../modules/finance/billing/graphql/billing.operations';
import { PAYROLL_RUNS_QUERY } from '../modules/finance/payroll/graphql/payroll.operations';
import {
  MY_ORGANIZATION_QUERY,
  UPDATE_MY_ORGANIZATION_BRAND_COLOR_MUTATION,
} from '../modules/organization/graphql/organization.operations';
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
      { label: 'Hiring requests', to: '/hiring', icon: IconBriefcase },
      { label: 'Leave triage', to: '/leave', icon: IconPlaneDeparture },
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
      { label: 'Hiring requests', to: '/hiring', icon: IconBriefcase },
      { label: 'Leave requests', to: '/leave', icon: IconPlaneDeparture },
    ],
  },
  { kind: 'link', label: 'Pay', to: '/compensation', icon: IconCurrencyDollar },
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

const workspaceUsersItem: NavigationItem = { label: 'Users', to: '/users', icon: IconUserCog };

// A destination matches a detail route too, so the group's sub-nav strip stays
// visible on `/payroll/:runId`, `/employees/:employeeId`, `/billing/:invoiceId`.
const isWithinPath = (pathname: string, to: string): boolean =>
  pathname === to || pathname.startsWith(`${to}/`);

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
  const apolloClient = useApolloClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // Phone navigation is a drawer, not the pill row — see the mobile block in
  // global.css. Kept as separate state so the two never fight for the same menu.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (
        navRef.current?.contains(target) ||
        accountRef.current?.contains(target) ||
        workspaceRef.current?.contains(target)
      ) {
        return;
      }
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Cmd+K (Mac) / Ctrl+K (everywhere else) jumps straight to the search
  // field, the same shortcut every modern SaaS app trains people to reach for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
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
  const [updateBrandColor, { loading: savingColor }] = useMutation(
    UPDATE_MY_ORGANIZATION_BRAND_COLOR_MUTATION,
    { refetchQueries: [{ query: MY_ORGANIZATION_QUERY }] },
  );
  const { data: workspacesData } = useQuery<{ readonly hasOtherWorkspaces: boolean }>(
    HAS_OTHER_WORKSPACES_QUERY,
  );
  const hasOtherWorkspaces = workspacesData?.hasOtherWorkspaces ?? false;

  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const ThemeIcon = theme.name === 'light' ? IconMoon : IconSun;
  const accountInitials = (user?.email ?? '?').slice(0, 2).toUpperCase();
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
  const canManageUsers =
    user?.roleKeys?.includes('tethrAdmin') || user?.roleKeys?.includes('clientAdmin');
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
  const canManageOrganization =
    user?.roleKeys?.includes('tethrAdmin') || user?.roleKeys?.includes('clientAdmin');
  const isVisibleItem = (item: NavigationItem): boolean => {
    if (item.to === '/compensation') return canViewCompensation;
    if (item.to === '/payroll' || item.to === '/billing') return canManagePayroll;
    return true;
  };
  const visibleNavigation: readonly NavigationEntry[] = navigation
    .filter((entry) => entry.kind !== 'link' || entry.to !== '/clients' || canManageClients)
    .filter((entry) => entry.kind !== 'link' || entry.to !== '/compensation' || canViewCompensation)
    .map((entry): NavigationEntry => {
      if (entry.kind === 'link') return entry;
      const items = [
        ...entry.items.filter(isVisibleItem),
        ...(entry.label === 'People' && canManageUsers ? [workspaceUsersItem] : []),
      ];
      return { ...entry, items };
    })
    // A group whose items all filtered out disappears entirely.
    .filter((entry) => entry.kind === 'link' || entry.items.length > 0);

  // The group whose own sub-pages the user is currently on, if any — drives
  // the persistent second-row tab strip so switching between a group's
  // pages doesn't require reopening the pill's dropdown each time.
  const activeGroupEntry = visibleNavigation.find(
    (entry): entry is NavigationGroupEntry =>
      entry.kind === 'group' && entry.items.some((item) => isWithinPath(pathname, item.to)),
  );

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
      void loadJumpRuns();
      void loadJumpInvoices();
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

  const onSelectColor = async (color: WorkspaceBrandColor): Promise<void> => {
    if (!canManageOrganization || savingColor || color === brandColor) return;
    await updateBrandColor({ variables: { input: { brandColor: color } } });
  };

  const onLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Switches in place instead of bouncing out to /login, with no password
  // step: the caller already holds a valid session and every workspace in the
  // picker is one of their own accounts (same email), so `switchWorkspace`
  // mints the new session straight from the current one.
  const finishWorkspaceSwitch = async (portal: PortalKind): Promise<void> => {
    setOpenMenu(null);
    navigate(portalHome(portal), { replace: true });
    // Runs after navigating away, not before: resetting first would briefly
    // refetch the page we're leaving under the new org's identity.
    await apolloClient.resetStore();
  };

  const openWorkspacePicker = (): void => {
    setSwitchError(null);
    setSwitchStep('picker');
    void loadSwitchableWorkspaces();
  };

  const onPickSwitchWorkspace = async (organizationId: string): Promise<void> => {
    setSwitchError(null);
    try {
      const session = await switchWorkspace(organizationId);
      await finishWorkspaceSwitch(session.user.portal);
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
    const isOpen = openMenu === entry.label;
    const isActive = entry.items.some((item) => isWithinPath(pathname, item.to));
    return (
      <div className="dropdown-anchor" key={entry.label}>
        <button
          className={`nav-pill nav-pill-group${isActive ? ' is-active' : ''}${isOpen ? ' is-open' : ''}`}
          onClick={() => setOpenMenu((current) => (current === entry.label ? null : entry.label))}
          type="button"
        >
          <Icon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          <span>{entry.label}</span>
          <IconChevronDown size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        </button>
        {isOpen ? (
          <div className="dropdown-panel dropdown-panel-more" role="menu">
            {entry.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  className={({ isActive: linkIsActive }) =>
                    `dropdown-nav-item${linkIsActive ? ' is-active' : ''}`
                  }
                  to={item.to}
                  onClick={() => setOpenMenu(null)}
                >
                  <ItemIcon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={`app-shell${isEmployeePortal ? ' app-shell-employee' : ''}`}
      style={chipColorVar}
    >
      <header className="app-topnav">
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
                <IconX size={theme.icon.size.lg} stroke={theme.icon.stroke.md} />
              ) : (
                <IconMenu2 size={theme.icon.size.lg} stroke={theme.icon.stroke.md} />
              )}
            </button>
          )}
          <div className="topnav-brand" aria-hidden="true">
            H
          </div>
          {hasOtherWorkspaces ? (
            <div className="dropdown-anchor" ref={workspaceRef}>
              <button
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
                <IconChevronDown size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
              </button>
              {openMenu === 'workspace' ? (
                <div className="dropdown-panel dropdown-panel-workspace" role="menu">
                  {switchStep === 'trigger' ? (
                    <button
                      className="dropdown-nav-item"
                      onClick={openWorkspacePicker}
                      type="button"
                    >
                      <IconArrowsRightLeft size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                      <span>Switch workspace</span>
                    </button>
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
          ) : (
            <div className="workspace-chip" title={organization?.legalName}>
              <span className="workspace-chip-dot" aria-hidden="true" />
              <span className="workspace-chip-name truncate">
                {organization?.displayName ?? 'Workspace'}
              </span>
            </div>
          )}
        </div>

        <nav className="topnav-pills" aria-label="Primary navigation" ref={navRef}>
          {visibleNavigation.map((entry) =>
            entry.kind === 'link' ? renderPill(entry) : renderGroup(entry),
          )}
        </nav>

        <div className="topnav-right">
          {isEmployeePortal ? null : (
            <div className="topbar-search-anchor">
              <label className="topbar-search">
                <IconSearch size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                <input
                  aria-label="Search"
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
                  type="search"
                  value={search}
                />
                <kbd className="topbar-search-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
              </label>
              {searchOpen && search.trim() ? (
                <div className="topbar-search-results" role="listbox">
                  {jumpResults.length === 0 ? (
                    <div className="topbar-search-empty">No matches</div>
                  ) : (
                    jumpResults.map((result) => (
                      <button
                        className="topbar-search-result"
                        key={result.key}
                        onMouseDown={() => onJump(result.to)}
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

          <div className="topbar-actions">
            <button className="icon-button" title="Notifications" type="button">
              <IconBell size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            </button>
            <button
              className="icon-button"
              onClick={toggle}
              title={`Switch to ${theme.name === 'light' ? 'dark' : 'light'} theme`}
              type="button"
            >
              <ThemeIcon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            </button>

            <div className="dropdown-anchor" ref={accountRef}>
              <button
                className="account-button"
                onClick={() =>
                  setOpenMenu((current) => (current === 'account' ? null : 'account'))
                }
                title={user?.email ?? undefined}
                type="button"
              >
                <span className="account-avatar">{accountInitials}</span>
              </button>
              {openMenu === 'account' ? (
                <div className="dropdown-panel dropdown-panel-account" role="menu">
                  <div className="account-dropdown-header">
                    <span className="account-avatar account-avatar-lg">{accountInitials}</span>
                    <div className="account-dropdown-identity">
                      <div className="account-dropdown-email truncate">
                        {user?.email ?? 'Account'}
                      </div>
                      <div className="account-dropdown-portal">
                        {portalLabel(portal)} workspace
                      </div>
                    </div>
                  </div>

                  {/* Only admins can repaint the workspace, so the swatches are
                      hidden outright for everyone else rather than shown greyed
                      out next to a note explaining why they don't work. */}
                  {canManageOrganization ? (
                    <div className="account-dropdown-section">
                      <div className="account-dropdown-label">Workspace color</div>
                      <div className="color-swatch-grid">
                        {WORKSPACE_BRAND_COLORS.map((color) => (
                          <button
                            key={color}
                            aria-label={color}
                            aria-pressed={brandColor === color}
                            className={`color-swatch${brandColor === color ? ' is-selected' : ''}`}
                            disabled={savingColor}
                            style={
                              { '--swatch-color': `var(--hrms-color-tag-${color})` } as CSSProperties
                            }
                            title={color}
                            type="button"
                            onClick={() => void onSelectColor(color)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <button
                    className="account-dropdown-signout"
                    onClick={() => void onLogout()}
                    type="button"
                  >
                    <IconLogout size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
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
                return (
                  <NavLink
                    key={entry.label}
                    className={({ isActive }) =>
                      `mobile-nav-item${isActive ? ' is-active' : ''}`
                    }
                    to={entry.to}
                  >
                    <Icon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    <span>{entry.label}</span>
                  </NavLink>
                );
              }
              return (
                <section className="mobile-nav-group" key={entry.label}>
                  <div className="mobile-nav-group-label">{entry.label}</div>
                  {entry.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.label}
                        className={({ isActive }) =>
                          `mobile-nav-item${isActive ? ' is-active' : ''}`
                        }
                        to={item.to}
                      >
                        <ItemIcon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                        <span>{item.label}</span>
                      </NavLink>
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
                <IconLogout size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                <span>Sign out</span>
              </button>
            </section>
          </nav>
        </>
      ) : null}

      {activeGroupEntry ? (
        <nav className="app-subnav" aria-label={`${activeGroupEntry.label} sections`}>
          {activeGroupEntry.items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={item.label}
                className={({ isActive }) => `subnav-tab${isActive ? ' is-active' : ''}`}
                to={item.to}
              >
                <ItemIcon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}

      <main className="app-content">
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

