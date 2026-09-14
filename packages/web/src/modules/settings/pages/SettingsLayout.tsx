import { IconLogout, IconMoon, IconSun, IconX } from '@tabler/icons-react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { portalHome } from '../../../app/portal';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import { visibleSettingsTabs } from '../settingsTabs';

/**
 * Workspace settings open as their own full-screen surface (Twenty's shape):
 * a grouped left sidebar with the workspace sections, and the active section on
 * the right under a breadcrumb. The surface replaces the app shell entirely, so
 * the sidebar carries the close action, the theme switch, and log out.
 */
export const SettingsLayout = () => {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tabs = visibleSettingsTabs(user);
  const activeTab =
    tabs.find(
      (tab) => pathname === `/settings/${tab.key}` || pathname.startsWith(`/settings/${tab.key}/`),
    ) ?? null;
  const ThemeIcon = theme.name === 'light' ? IconMoon : IconSun;

  const close = (): void => {
    // Leave the surface entirely — back to the last app page, not the previous
    // settings tab (the shell records it in sessionStorage).
    const lastAppPath = window.sessionStorage.getItem('hrms.lastAppPath');
    if (lastAppPath && !lastAppPath.startsWith('/settings')) {
      navigate(lastAppPath);
      return;
    }
    navigate(portalHome(user?.portal ?? 'none'));
  };

  const onLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="settings-surface">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <h1 className="settings-sidebar-title">Settings</h1>
          <button
            aria-label="Close settings"
            className="icon-button"
            onClick={close}
            title="Close settings"
            type="button"
          >
            <IconX size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          </button>
        </div>

        <nav aria-label="Settings sections" className="settings-sidebar-nav">
          <div className="settings-sidebar-group-label">Workspace</div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                className={({ isActive }) => `settings-nav-item${isActive ? ' is-active' : ''}`}
                key={tab.key}
                to={`/settings/${tab.key}`}
              >
                <Icon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="settings-sidebar-footer">
          <button className="settings-nav-item" onClick={toggle} type="button">
            <ThemeIcon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            <span>Theme · {theme.name === 'light' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            className="settings-nav-item settings-nav-item-signout"
            onClick={() => void onLogout()}
            type="button"
          >
            <IconLogout size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <section className="settings-content">
        <div className="settings-content-header">
          <div className="settings-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true" className="settings-breadcrumb-separator">
              /
            </span>
            <span className="settings-breadcrumb-current">{activeTab?.label ?? 'Settings'}</span>
          </div>
        </div>
        <Outlet />
      </section>
    </div>
  );
};

// `/settings` has no page of its own: send the visitor to the first tab their
// role can actually open instead of a fixed one that may be gated.
export const SettingsIndexRedirect = () => {
  const { user } = useAuth();
  const firstTab = visibleSettingsTabs(user)[0];
  return (
    <Navigate
      to={firstTab ? `/settings/${firstTab.key}` : portalHome(user?.portal ?? 'none')}
      replace
    />
  );
};
