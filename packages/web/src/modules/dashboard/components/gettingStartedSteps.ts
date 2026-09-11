import { gql, useQuery } from '@apollo/client';
import {
  IconBriefcase,
  IconBuildingCommunity,
  IconReportMoney,
  IconUserPlus,
  type TablerIcon,
} from '@tabler/icons-react';

import { useAuth } from '../../auth/hooks/useAuth';

// A single "explore the product" step: a titled, linked action whose completion
// is computed from real workspace data. `locked` steps render disabled.
type GettingStartedStep = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly to: string;
  readonly icon: TablerIcon;
  readonly complete: boolean;
  readonly locked?: boolean;
};

type GettingStartedSteps = {
  readonly steps: readonly GettingStartedStep[];
  readonly loading: boolean;
  readonly error: boolean;
};

// The widget Dashboard is the Tethr portal's home; client and employee portals
// have their own purpose-built landing pages (/client, /me) that carry their
// own onboarding checklists, so this panel is Tethr-only.
const TETHR_QUERY = gql`
  query DashboardGettingStartedTethr {
    clients {
      id
    }
    hiringRequests {
      id
      status
    }
    payrollRuns {
      id
      status
    }
  }
`;

type StepsData = {
  readonly clients?: readonly { readonly id: string }[];
  readonly hiringRequests?: readonly { readonly id: string; readonly status: string }[];
  readonly payrollRuns?: readonly { readonly id: string; readonly status: string }[];
};

const count = (list: readonly unknown[] | undefined): number => list?.length ?? 0;

const tethrSteps = (data: StepsData | undefined, isAdmin: boolean): readonly GettingStartedStep[] => [
  {
    id: 'add-client',
    title: 'Add your first client',
    detail: count(data?.clients) > 0 ? `${count(data?.clients)} in portfolio` : 'Onboard a company you manage',
    to: '/clients',
    icon: IconBuildingCommunity,
    complete: count(data?.clients) > 0,
  },
  {
    id: 'post-hiring',
    title: 'Post a hiring request',
    detail: count(data?.hiringRequests) > 0 ? `${count(data?.hiringRequests)} tracked` : 'Kick off an intake for a client role',
    to: '/hiring',
    icon: IconBriefcase,
    complete: count(data?.hiringRequests) > 0,
  },
  {
    id: 'run-payroll',
    title: 'Run a payroll cycle',
    detail: (data?.payrollRuns ?? []).some((run) => run.status === 'finalized')
      ? 'A run has been finalized'
      : 'Draft, review and finalize a pay run',
    to: '/payroll',
    icon: IconReportMoney,
    complete: (data?.payrollRuns ?? []).some((run) => run.status === 'finalized'),
  },
  {
    id: 'invite-teammate',
    title: 'Invite a teammate',
    detail: isAdmin ? 'Add Tethr staff to this workspace' : 'Workspace admin only',
    to: '/users',
    icon: IconUserPlus,
    complete: isAdmin,
    locked: !isAdmin,
  },
];

// The tethr walkthrough touches admin-only data (clients, payroll), so it is
// only offered to tethr admins; other tethr roles get no panel (empty steps).
export const useGettingStartedSteps = (): GettingStartedSteps => {
  const { user } = useAuth();
  const roleKeys = user?.roleKeys ?? [];
  const supported = user?.portal === 'tethr' && roleKeys.includes('tethrAdmin');

  const { data, loading, error } = useQuery<StepsData>(TETHR_QUERY, {
    fetchPolicy: 'cache-and-network',
    skip: !supported,
  });

  if (!supported) {
    return { steps: [], loading: false, error: false };
  }

  return { steps: tethrSteps(data, true), loading, error: Boolean(error) };
};
