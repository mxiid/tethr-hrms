import { toId, type OrganizationId, type UserId } from '@hrms/shared';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';


import type { JwtClaims } from '../auth/jwt-claims';

import { TenantContextService } from './tenant-context.service';


// Minimal request shape — avoids depending on express types here.
type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
};

// Establishes tenant + principal for the request from the `Authorization: Bearer`
// JWT. Requests without a token proceed unscoped; any downstream tenant-scoped
// read then fails loudly rather than leaking across tenants. There is no header
// fallback: an unauthenticated way to choose a tenant would defeat the whole
// scoping guarantee (and anonymous public flows carry their own signed tokens,
// verified by the service that owns them — never here).
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly jwtService: JwtService,
  ) {}

  use(request: RequestLike, _response: unknown, next: (error?: unknown) => void): void {
    const claims = this.readToken(request);
    if (!claims) {
      next();
      return;
    }
    const organizationId = toId<OrganizationId>(claims.org);
    const userId = toId<UserId>(claims.sub);
    request.user = { userId, organizationId, email: claims.email, permissions: [] };
    this.tenantContext.run({ organizationId, userId }, () => next());
  }

  private readToken(request: RequestLike): JwtClaims | null {
    const header = request.headers['authorization'];
    const value = typeof header === 'string' ? header : null;
    if (!value || !value.startsWith('Bearer ')) {
      return null;
    }
    try {
      const claims = this.jwtService.verify<Partial<JwtClaims>>(value.slice('Bearer '.length));
      // Single-purpose tokens (workspace selection, form links) verify fine
      // under the same secret but carry no `sub`/`org` — reject anything not
      // shaped like a real session token rather than letting it fall through
      // as an unscoped/undefined tenant.
      if (typeof claims.sub !== 'string' || typeof claims.org !== 'string') {
        return null;
      }
      return claims as JwtClaims;
    } catch {
      return null;
    }
  }
}
