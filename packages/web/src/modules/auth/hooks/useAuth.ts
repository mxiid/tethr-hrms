import { useApolloClient, useMutation } from '@apollo/client';
import { useAtom, useSetAtom } from 'jotai';

import { resetDashboardViewsAtom } from '../../dashboard/states/dashboardViewsState';
import {
  LOGIN_MUTATION,
  SELECT_WORKSPACE_MUTATION,
  SIGN_UP_MUTATION,
  SWITCH_WORKSPACE_MUTATION,
} from '../graphql/auth.operations';
import { rememberWorkspace } from '../lastWorkspace';
import { authState, clearStoredSession, type AuthSession } from '../states/authState';

export type WorkspaceOption = {
  readonly organizationId: string;
  readonly organizationName: string;
};

type LoginOutcome =
  | { readonly kind: 'authenticated'; readonly session: AuthSession }
  | {
      readonly kind: 'selectWorkspace';
      readonly selectionToken: string;
      readonly workspaces: readonly WorkspaceOption[];
    };

type LoginVars = { input: { email: string; password: string } };
type LoginData = {
  login: {
    readonly token: string | null;
    readonly user: AuthSession['user'] | null;
    readonly workspaceSelectionToken: string | null;
    readonly workspaces: readonly WorkspaceOption[] | null;
  };
};
type SelectWorkspaceVars = { input: { selectionToken: string; organizationId: string } };
type SelectWorkspaceData = { selectWorkspace: AuthSession };
type SwitchWorkspaceVars = { organizationId: string };
type SwitchWorkspaceData = { switchWorkspace: AuthSession };
type SignUpVars = { input: { organizationName: string; email: string; password: string } };
type SignUpData = { signUp: AuthSession };

// Every path that establishes a session records the workspace it landed in, so
// the next sign-in for this email can skip the picker.
const applyRememberedWorkspace = (session: AuthSession): AuthSession => {
  rememberWorkspace(session.user.email, session.user.organizationId);
  return session;
};

export const useAuth = () => {
  const [session, setSession] = useAtom(authState);
  const apollo = useApolloClient();
  const resetDashboardViews = useSetAtom(resetDashboardViewsAtom);
  const [loginMutation, { loading: loggingIn }] = useMutation<LoginData, LoginVars>(LOGIN_MUTATION);
  const [selectWorkspaceMutation, { loading: selectingWorkspace }] = useMutation<
    SelectWorkspaceData,
    SelectWorkspaceVars
  >(SELECT_WORKSPACE_MUTATION);
  const [switchWorkspaceMutation, { loading: switchingWorkspace }] = useMutation<
    SwitchWorkspaceData,
    SwitchWorkspaceVars
  >(SWITCH_WORKSPACE_MUTATION);
  const [signUpMutation, { loading: signingUp }] = useMutation<SignUpData, SignUpVars>(
    SIGN_UP_MUTATION,
  );

  const login = async (email: string, password: string): Promise<LoginOutcome> => {
    const { data } = await loginMutation({ variables: { input: { email, password } } });
    if (!data) {
      throw new Error('Sign in did not return a result');
    }
    if (data.login.workspaceSelectionToken && data.login.workspaces) {
      return {
        kind: 'selectWorkspace',
        selectionToken: data.login.workspaceSelectionToken,
        workspaces: data.login.workspaces,
      };
    }
    if (data.login.token && data.login.user) {
      const authenticatedSession: AuthSession = { token: data.login.token, user: data.login.user };
      // Same ordering rule as switching: never render another identity's cache.
      await apollo.clearStore();
      setSession(applyRememberedWorkspace(authenticatedSession));
      return { kind: 'authenticated', session: authenticatedSession };
    }
    throw new Error('Sign in did not return a session');
  };

  const selectWorkspace = async (
    selectionToken: string,
    organizationId: string,
  ): Promise<AuthSession> => {
    const { data } = await selectWorkspaceMutation({
      variables: { input: { selectionToken, organizationId } },
    });
    if (!data) {
      throw new Error('Workspace selection did not return a session');
    }
    await apollo.clearStore();
    setSession(applyRememberedWorkspace(data.selectWorkspace));
    return data.selectWorkspace;
  };

  // In-app workspace switch: no password, straight from the current session.
  // The Apollo cache is cleared BEFORE the new session lands in the atom, so
  // the destination page can never render the previous workspace's cached
  // queries — the cross-tenant stale-data window (TET-217). clearStore (not
  // resetStore) is deliberate: no active queries may refetch under the old
  // identity mid-switch; pages fetch their own data on mount.
  const switchWorkspace = async (organizationId: string): Promise<AuthSession> => {
    const { data } = await switchWorkspaceMutation({ variables: { organizationId } });
    if (!data) {
      throw new Error('Workspace switch did not return a session');
    }
    await apollo.clearStore();
    setSession(applyRememberedWorkspace(data.switchWorkspace));
    return data.switchWorkspace;
  };

  const signUp = async (
    organizationName: string,
    email: string,
    password: string,
  ): Promise<AuthSession> => {
    const { data } = await signUpMutation({
      variables: { input: { organizationName, email, password } },
    });
    if (!data) {
      throw new Error('Sign up did not return a session');
    }
    await apollo.clearStore();
    setSession(data.signUp);
    return data.signUp;
  };

  const logout = async (): Promise<void> => {
    setSession(null);
    clearStoredSession();
    resetDashboardViews();
    await apollo.clearStore();
  };

  return {
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.token),
    isBusy: loggingIn || signingUp || selectingWorkspace || switchingWorkspace,
    login,
    selectWorkspace,
    switchWorkspace,
    signUp,
    logout,
  };
};
