import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const CLIENT_PORTFOLIO_QUERY = gql`
  query DashboardClientPortfolio {
    clients {
      id
    }
  }
`;

type ClientPortfolioData = {
  clients: ReadonlyArray<{ id: string }>;
};

export const CLIENT_PORTFOLIO_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'total', label: 'Clients' },
];

export const useClientPortfolioData = (): WidgetData => {
  const { data, loading, error } = useQuery<ClientPortfolioData>(CLIENT_PORTFOLIO_QUERY);

  return {
    loading,
    error: Boolean(error),
    values: {
      total: data?.clients.length ?? 0,
    },
  };
};
