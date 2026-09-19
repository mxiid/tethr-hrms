// The signed JWT payload: the user, their tenant, email, and the session epoch
// (`ver`) the token was minted under. The TenantContextMiddleware establishes
// tenant + principal from this, and SessionGuard checks the epoch against the
// user row so a disabled user or a bumped tokenVersion revokes outstanding
// tokens immediately.
export type JwtClaims = {
  readonly sub: string;
  readonly org: string;
  readonly email: string;
  // Absent on tokens minted before tokenVersion existed; treated as 0.
  readonly ver?: number;
};

// Issued instead of a session JWT when a login's email matches more than one
// organization (the same person holding a distinct account per workspace they
// support). Deliberately shaped nothing like JwtClaims — no `sub`/`org` — so
// TenantContextMiddleware can never mistake it for a session token, and it is
// short-lived and single-purpose: it only ever redeems into one of the
// candidate organizations whose password check already passed at login.
export type WorkspaceSelectionClaims = {
  readonly type: 'workspace-selection';
  readonly email: string;
  readonly organizationIds: readonly string[];
};

// Minted for a public form link (an anonymous candidate opening an application
// form). Carries the form and the workspace its submission belongs to.
// Deliberately no `sub`/`org` at the top level — TenantContextMiddleware's
// readToken only promotes claims carrying both, so a form-link token can never
// become a session; FormTokenService is the only thing allowed to read this.
export type FormLinkClaims = {
  readonly type: 'form-link';
  readonly formId: string;
  readonly organizationId: string;
  // Optional context the submission belongs to (e.g. the job posting an
  // application form was opened for). Opaque to the form engine; the projection
  // consumer interprets it.
  readonly refId?: string;
};
