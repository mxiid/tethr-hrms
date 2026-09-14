import type { PortalKind } from '@hrms/shared';

// One home per portal, no duplication. Tethr manages many clients and has no
// hand-built overview, so the customizable widget Dashboard is its home. Client
// and employee each have a purpose-built landing page instead.
export const portalHome = (portal: PortalKind): string => {
  if (portal === 'tethr') return '/dashboard';
  if (portal === 'client') return '/client';
  if (portal === 'employee') return '/me';
  return '/access';
};

export const portalLabel = (portal: PortalKind): string => {
  if (portal === 'tethr') return 'Tethr';
  if (portal === 'client') return 'Client';
  if (portal === 'employee') return 'Employee';
  return 'Access';
};
