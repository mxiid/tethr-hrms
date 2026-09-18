import { ApolloProvider } from '@apollo/client';
import { Provider as JotaiProvider } from 'jotai';

import { ConfirmProvider } from '../components/confirm/ConfirmProvider';
import { ThemeProvider } from '../providers/theme/ThemeProvider';

import { apolloClient } from './apollo-client';
import { AppRouter } from './router';

// Composition root: server cache, global atom store, theme, confirmations,
// routing.
export const App = () => (
  <JotaiProvider>
    <ApolloProvider client={apolloClient}>
      <ThemeProvider>
        <ConfirmProvider>
          <AppRouter />
        </ConfirmProvider>
      </ThemeProvider>
    </ApolloProvider>
  </JotaiProvider>
);
