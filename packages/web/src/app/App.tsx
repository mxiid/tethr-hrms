import { ApolloProvider } from '@apollo/client';
import { getDefaultStore, Provider as JotaiProvider } from 'jotai';

import { ConfirmProvider } from '../components/confirm/ConfirmProvider';
import { ThemeProvider } from '../providers/theme/ThemeProvider';

import { apolloClient } from './apollo-client';
import { AppRouter } from './router';

// Composition root: server cache, global atom store, theme, confirmations,
// routing. The provider is given the DEFAULT store explicitly: the Apollo
// expiry link (outside React) writes to `getDefaultStore()`, and a bare
// <JotaiProvider> would create its own store — leaving the mounted app with a
// stale session after a 401 (TET-217 review round).
export const App = () => (
  <JotaiProvider store={getDefaultStore()}>
    <ApolloProvider client={apolloClient}>
      <ThemeProvider>
        <ConfirmProvider>
          <AppRouter />
        </ConfirmProvider>
      </ThemeProvider>
    </ApolloProvider>
  </JotaiProvider>
);
