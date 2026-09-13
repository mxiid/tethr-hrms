import { useApolloClient } from '@apollo/client';
import { useState, type ChangeEvent, type FocusEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { portalHome } from '../../../app/portal';
import { Skeleton } from '../../../components/skeleton/Skeleton';
import {
  HAS_CREATED_WORKSPACE_QUERY,
  LEGAL_NAME_IS_ALREADY_USED_QUERY,
} from '../graphql/auth.operations';
import { useAuth } from '../hooks/useAuth';

type CreatorCheckData = { readonly hasCreatedWorkspace: boolean };
type CreatorCheckVars = { readonly email: string };
type NameCheckData = { readonly legalNameIsAlreadyUsed: boolean };
type NameCheckVars = { readonly legalName: string };

export const SignUpPage = () => {
  const navigate = useNavigate();
  const { signUp, isBusy } = useAuth();
  const apollo = useApolloClient();
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Workspace names are unique and one email can found only one workspace —
  // both are hard blocks, not warnings, so there's no "acknowledge and
  // proceed anyway" here. The value each check applies to — plain state,
  // checked imperatively via client.query() rather than a subscribed
  // useQuery. A query fired mid-lifecycle (on blur, not at mount) can race
  // React 18 StrictMode's dev-only mount/unmount/remount and never deliver
  // its result to the "wrong" hook instance; a one-off promise sidesteps
  // that entirely.
  const [emailAlreadyFoundedWorkspace, setEmailAlreadyFoundedWorkspace] = useState<string | null>(
    null,
  );
  const [usedNameWarning, setUsedNameWarning] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  const onEmailChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setEmail(event.target.value);
  };

  const onOrganizationNameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setOrganizationName(event.target.value);
  };

  const onEmailBlur = async (event: FocusEvent<HTMLInputElement>): Promise<void> => {
    const value = event.target.value.trim();
    if (!value || !event.target.validity.valid) return;
    setCheckingEmail(true);
    try {
      const { data } = await apollo.query<CreatorCheckData, CreatorCheckVars>({
        query: HAS_CREATED_WORKSPACE_QUERY,
        variables: { email: value },
        fetchPolicy: 'network-only',
      });
      setEmailAlreadyFoundedWorkspace(data.hasCreatedWorkspace ? value : null);
    } catch {
      setEmailAlreadyFoundedWorkspace(null);
    } finally {
      setCheckingEmail(false);
    }
  };

  const onOrganizationNameBlur = async (event: FocusEvent<HTMLInputElement>): Promise<void> => {
    const value = event.target.value.trim();
    if (!value) return;
    setCheckingName(true);
    try {
      const { data } = await apollo.query<NameCheckData, NameCheckVars>({
        query: LEGAL_NAME_IS_ALREADY_USED_QUERY,
        variables: { legalName: value },
        fetchPolicy: 'network-only',
      });
      setUsedNameWarning(data.legalNameIsAlreadyUsed ? value : null);
    } catch {
      setUsedNameWarning(null);
    } finally {
      setCheckingName(false);
    }
  };

  const emailBlocked =
    emailAlreadyFoundedWorkspace !== null && emailAlreadyFoundedWorkspace === email.trim();
  const legalNameAlreadyUsed = usedNameWarning !== null && usedNameWarning === organizationName.trim();

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      const session = await signUp(organizationName, email, password);
      navigate(portalHome(session.user.portal), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign up failed');
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand-lockup" style={{ marginBottom: 'var(--hrms-space-5)' }}>
          <div className="brand-mark" aria-hidden="true">
            H
          </div>
          <div className="brand-name">HRMS</div>
        </div>
        <h1 className="auth-title">Create your workspace</h1>
        <p className="auth-subtitle">Start a new company account.</p>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="signup-org">Company name</label>
          <input
            id="signup-org"
            type="text"
            value={organizationName}
            onChange={onOrganizationNameChange}
            onBlur={onOrganizationNameBlur}
            required
          />
          {checkingName ? (
            <div aria-label="Checking workspace name…" role="status">
              <Skeleton height="xs" width="65%" style={{ marginTop: 'var(--hrms-space-2)' }} />
            </div>
          ) : legalNameAlreadyUsed ? (
            <p className="field-hint field-hint-warning">
              A workspace named &quot;{organizationName.trim()}&quot; already exists. Workspace
              names are unique — try a different name.
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="signup-email">Work email</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={onEmailChange}
            onBlur={onEmailBlur}
            required
          />
          {checkingEmail ? (
            <div aria-label="Checking email…" role="status">
              <Skeleton height="xs" width="65%" style={{ marginTop: 'var(--hrms-space-2)' }} />
            </div>
          ) : emailBlocked ? (
            <p className="field-hint field-hint-warning">
              This email has already created a workspace. <Link to="/login">Sign in</Link> instead,
              or ask an admin to invite you into another one.
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button
          className="button button-primary button-full"
          type="submit"
          disabled={isBusy || emailBlocked || legalNameAlreadyUsed}
        >
          {isBusy ? 'Creating…' : 'Create workspace'}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
};
