import { Navigate, NavLink, Outlet } from 'react-router-dom';

import { portalHome } from '../../../app/portal';
import { useAuth } from '../../auth/hooks/useAuth';
import { visibleSettingsTabs } from '../settingsTabs';

// A settings-scoped sub-nav, deliberately separate from the primary nav: the
// drawer question is still open, and this slots into a left sidebar later.
// Tabs are filtered by the same portal/role gates the router enforces, so the
// nav never offers a section the visitor would be bounced out of.
export const SettingsLayout = () => {
  const { user } = useAuth();
  return (
    <>
      <div className="settings-subnav">
        <nav aria-label="Settings sections" className="profile-tabs settings-subnav-inner">
          {visibleSettingsTabs(user).map((tab) => (
            <NavLink
              className={({ isActive }) => `profile-tab${isActive ? ' is-active' : ''}`}
              key={tab.key}
              to={`/settings/${tab.key}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
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
