// Remembers which workspace an email last used, so signing in with an account
// that belongs to several workspaces goes straight back where you were instead
// of stopping on a picker. Per-browser only: it is a convenience, never an
// authorization input — the server still mints the session, and the workspace
// is only used if it appears in the list that login returned.
//
// Every access is guarded: storage throws outright in some contexts (private
// windows, blocked site data), and returns nothing in others.

const STORAGE_KEY_PREFIX = 'hrms:last-workspace:';

const keyFor = (email: string): string => `${STORAGE_KEY_PREFIX}${email.trim().toLowerCase()}`;

export const rememberWorkspace = (email: string, organizationId: string): void => {
  try {
    window.localStorage.setItem(keyFor(email), organizationId);
  } catch {
    // Storage unavailable — the picker simply stays the fallback.
  }
};

const getRememberedWorkspace = (email: string): string | null => {
  try {
    return window.localStorage.getItem(keyFor(email));
  } catch {
    return null;
  }
};

/**
 * Which workspace to open for an email that has several. Prefers the one last
 * used, falls back to the first the server listed, and returns null only when
 * there is nothing to choose from.
 */
export const resolveWorkspaceChoice = (
  email: string,
  workspaces: ReadonlyArray<{ readonly organizationId: string }>,
): string | null => {
  if (workspaces.length === 0) return null;
  const remembered = getRememberedWorkspace(email);
  const match = workspaces.find((workspace) => workspace.organizationId === remembered);
  return match?.organizationId ?? workspaces[0]?.organizationId ?? null;
};
