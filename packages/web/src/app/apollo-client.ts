import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { getDefaultStore } from 'jotai';

import {
  authState,
  clearStoredSession,
} from '../modules/auth/states/authState';

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:3000/graphql',
});

// Attach the bearer token (if signed in) to every request. The token carries the
// tenant, so no `x-organization-id` header is needed once authenticated. Read
// from the mounted Jotai store (App passes it `getDefaultStore()`): the atom is
// authoritative even when localStorage is unavailable, so an in-memory session
// still authenticates.
const authLink = setContext((_request, previousContext) => {
  const token = getDefaultStore().get(authState)?.token;
  const headers = (previousContext.headers ?? {}) as Record<string, string>;
  return { headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers };
});

// An expired/invalid session must not leave the app half-alive (cached profile
// in the header, every query failing). The API rejects bad bearer tokens before
// any tenant context exists, surfacing as TENANT_CONTEXT_MISSING/UNAUTHENTICATED
// GraphQL errors over HTTP 200 — so inspect codes, not just status.
//
// The session is dropped from both storage and the Jotai atom (the default
// store, since this link lives outside React). On /login there is no redirect
// to perform, so clearing the atom is what re-renders the page as signed out;
// elsewhere the redirect reloads the app, which rebuilds every atom anyway.
const sessionExpiryLink = onError(({ graphQLErrors, networkError }) => {
  const code = graphQLErrors?.[0]?.extensions?.code;
  const status =
    networkError && 'statusCode' in networkError ? networkError.statusCode : undefined;
  if (
    code === 'TENANT_CONTEXT_MISSING' ||
    code === 'UNAUTHENTICATED' ||
    status === 401 ||
    status === 403
  ) {
    clearStoredSession();
    getDefaultStore().set(authState, null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }
});

// The GraphQL/HTTP cache. Server data lives here — never duplicated into atoms
// (architecture.md §5.2).
export const apolloClient = new ApolloClient({
  link: sessionExpiryLink.concat(authLink.concat(httpLink)),
  cache: new InMemoryCache(),
});
