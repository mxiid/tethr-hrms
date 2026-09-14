import type { PortalKind, SystemRoleKey } from '@hrms/shared';
import { Navigate, Outlet } from 'react-router-dom';

import { portalHome } from './portal';
import { useAuth } from '../modules/auth/hooks/useAuth';

type RequirePortalProps = {
  readonly portals: readonly Exclude<PortalKind, 'none'>[];
  readonly roleKeys?: readonly SystemRoleKey[];
};

export const RequirePortal = ({ portals, roleKeys }: RequirePortalProps) => {
  const { user } = useAuth();
  if (!user || user.portal === 'none') {
    return <Navigate to="/access" replace />;
  }
  if (!portals.includes(user.portal)) {
    return <Navigate to={portalHome(user.portal)} replace />;
  }
  if (roleKeys && !roleKeys.some((roleKey) => user.roleKeys?.includes(roleKey))) {
    return <Navigate to={portalHome(user.portal)} replace />;
  }
  return <Outlet />;
};
