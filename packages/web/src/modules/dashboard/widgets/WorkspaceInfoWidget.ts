import { useQuery } from '@apollo/client';

import { MY_ORGANIZATION_QUERY } from '../../organization/graphql/organization.operations';

import type { WidgetData, WidgetFieldDefinition } from './types';

type MyOrganization = {
  readonly id: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly brandColor: string;
};
type MyOrganizationData = { readonly myOrganization: MyOrganization };

export const WORKSPACE_INFO_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'workspaceName', label: 'Workspace' },
  { id: 'legalName', label: 'Legal name' },
  { id: 'brandColor', label: 'Brand color' },
];

export const useWorkspaceInfoData = (): WidgetData => {
  const { data, loading, error } = useQuery<MyOrganizationData>(MY_ORGANIZATION_QUERY);
  const organization = data?.myOrganization;

  return {
    loading,
    error: Boolean(error),
    values: {
      workspaceName: organization?.displayName ?? '—',
      legalName: organization?.legalName ?? '—',
      brandColor: organization?.brandColor ?? '—',
    },
  };
};
