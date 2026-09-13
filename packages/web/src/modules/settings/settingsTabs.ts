import type { PortalKind, SystemRoleKey } from '@hrms/shared';

export type SettingsTabKey = 'general' | 'members' | 'billing' | 'payroll' | 'pay';

type SettingsPortal = Exclude<PortalKind, 'none' | 'employee'>;

export type SettingsTab = {
  readonly key: SettingsTabKey;
  readonly label: string;
  readonly portals: readonly SettingsPortal[];
  readonly roleKeys: readonly SystemRoleKey[];
};

// Which roles reach each tab mirrors the API permission the page's queries and
// mutations require — keep in lockstep with the resolvers:
//   general  organization:manage  (tethrAdmin, clientAdmin)
//   members  user:manage          (tethrAdmin, clientAdmin)
//   billing  billing:write        (tethrAdmin, tethrFinance)
//   payroll  payroll:write        (tethrAdmin, tethrFinance)
//   pay      compensation:write   (tethrAdmin, tethrHr, clientAdmin)
export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    key: 'general',
    label: 'General',
    portals: ['tethr', 'client'],
    roleKeys: ['tethrAdmin', 'clientAdmin'],
  },
  {
    key: 'members',
    label: 'Members',
    portals: ['tethr', 'client'],
    roleKeys: ['tethrAdmin', 'clientAdmin'],
  },
  {
    key: 'billing',
    label: 'Billing',
    portals: ['tethr'],
    roleKeys: ['tethrAdmin', 'tethrFinance'],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    portals: ['tethr'],
    roleKeys: ['tethrAdmin', 'tethrFinance'],
  },
  {
    key: 'pay',
    label: 'Pay',
    portals: ['tethr', 'client'],
    roleKeys: ['tethrAdmin', 'tethrHr', 'clientAdmin'],
  },
];

// Wide enough to let the router's settings branch through; each tab narrows
// further with its own guard.
export const SETTINGS_ROLE_KEYS: readonly SystemRoleKey[] = [
  ...new Set(SETTINGS_TABS.flatMap((tab) => [...tab.roleKeys])),
];

type SettingsViewer = {
  readonly portal: PortalKind;
  readonly roleKeys: readonly string[];
};

export const visibleSettingsTabs = (viewer: SettingsViewer | null): readonly SettingsTab[] => {
  if (viewer === null) return [];
  const { portal } = viewer;
  if (portal !== 'tethr' && portal !== 'client') return [];
  return SETTINGS_TABS.filter(
    (tab) =>
      tab.portals.includes(portal) &&
      tab.roleKeys.some((roleKey) => viewer.roleKeys.includes(roleKey)),
  );
};
