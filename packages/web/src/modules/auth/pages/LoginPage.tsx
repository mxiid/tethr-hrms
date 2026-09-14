import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth, type WorkspaceOption } from '../hooks/useAuth';
import { resolveWorkspaceChoice } from '../lastWorkspace';
import { portalHome } from '../../../app/portal';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, selectWorkspace, isBusy } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    readonly selectionToken: string;
    readonly workspaces: readonly WorkspaceOption[];
  } | null>(null);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      const outcome = await login(email, password);
      if (outcome.kind === 'selectWorkspace') {
        // Don't stop on a picker: open the workspace this email last used, or
        // the first one otherwise. Switching workspaces is already a one-click
        // action from the header once you are in.
        const target = resolveWorkspaceChoice(email, outcome.workspaces);
        if (target) {
          try {
            const session = await selectWorkspace(outcome.selectionToken, target);
            navigate(portalHome(session.user.portal), { replace: true });
            return;
          } catch {
            // The remembered workspace may no longer be reachable — fall through
            // to the picker rather than dead-ending on an error.
          }
        }
        setPendingSelection({
          selectionToken: outcome.selectionToken,
          workspaces: outcome.workspaces,
        });
        return;
      }
      navigate(portalHome(outcome.session.user.portal), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed');
    }
  };

  const onSelectWorkspace = async (organizationId: string): Promise<void> => {
    if (!pendingSelection) return;
    setError(null);
    try {
      const session = await selectWorkspace(pendingSelection.selectionToken, organizationId);
      navigate(portalHome(session.user.portal), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open that workspace');
      setPendingSelection(null);
    }
  };

  if (pendingSelection) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-lockup" style={{ marginBottom: 'var(--hrms-space-5)' }}>
            <div className="brand-mark" aria-hidden="true">
              H
            </div>
            <div className="brand-name">HRMS</div>
          </div>
          <h1 className="auth-title">Choose a workspace</h1>
          <p className="auth-subtitle">This email is signed into more than one workspace.</p>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="workspace-option-list">
            {pendingSelection.workspaces.map((workspace) => (
              <button
                key={workspace.organizationId}
                className="button button-secondary button-full"
                type="button"
                disabled={isBusy}
                onClick={() => void onSelectWorkspace(workspace.organizationId)}
              >
                {workspace.organizationName}
              </button>
            ))}
          </div>
          <p className="auth-switch">
            Wrong account?{' '}
            <button
              className="link-button"
              type="button"
              onClick={() => setPendingSelection(null)}
            >
              Start over
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand-lockup" style={{ marginBottom: 'var(--hrms-space-5)' }}>
          <div className="brand-mark" aria-hidden="true">
            H
          </div>
          <div className="brand-name">HRMS</div>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your workspace.</p>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="login-email">Work email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button className="button button-primary button-full" type="submit" disabled={isBusy}>
          {isBusy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-switch">
          No account yet? <Link to="/signup">Create your workspace</Link>
        </p>
      </form>
    </div>
  );
};
