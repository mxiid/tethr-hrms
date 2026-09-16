import { Link } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export const AccessPendingPage = () => {
  const { logout } = useAuth();

  return (
    <main className="portal-loading access-pending">
      <div>
        <h1 className="page-title">Access setup required</h1>
        <p className="page-subtitle">
          This account hasn&rsquo;t been given access to a workspace yet. Ask an administrator to
          set it up.
        </p>
        <Link className="button button-secondary" onClick={() => void logout()} to="/login">
          Return to sign in
        </Link>
      </div>
    </main>
  );
};
