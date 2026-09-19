import { Injectable, type CanActivate } from '@nestjs/common';

import { UnauthenticatedError } from '../../common/errors';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { AuthService } from './auth.service';

// Runs before PermissionsGuard on every entrypoint. A request with no session
// principal (anonymous public operations, signed storage links) passes through;
// a request carrying a session token must resolve to an active user row whose
// tokenVersion still matches — otherwise it fails as unauthenticated. This is
// what makes disable/termination take effect immediately instead of at natural
// token expiry. The user read is memoized for the request, so the authorization
// guard (and field resolvers) reuse the same row.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(): Promise<boolean> {
    const userId = this.tenantContext.getUserId();
    if (!userId) {
      return true;
    }
    const user = await this.authService.resolveActiveSession(
      userId,
      this.tenantContext.getOrganizationId(),
      this.tenantContext.getTokenVersion(),
    );
    if (!user) {
      throw new UnauthenticatedError('Your session is no longer valid. Please sign in again.');
    }
    return true;
  }
}
