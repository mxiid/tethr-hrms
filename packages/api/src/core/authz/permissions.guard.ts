import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError } from '../../common/errors';

import { AuthorizationService } from './authz.service';
import type { Permission } from './permissions';
import { IS_PUBLIC_METADATA_KEY } from './public.decorator';
import {
  PERMISSIONS_ANY_METADATA_KEY,
  PERMISSIONS_METADATA_KEY,
} from './require-permissions.decorator';

// Coarse authorization at the entrypoint: is the caller authenticated and do they
// hold the required permissions? Works for both GraphQL and REST. Registered
// globally (AppModule's APP_GUARD), so it is deny-by-default: an operation must
// either carry @Public() or declare @RequirePermissions/@RequireAnyPermissions —
// anything else fails closed. A forgotten decorator can no longer ship an open
// endpoint; a resolver that forgets one is caught by the source-scanning spec
// and would be rejected at runtime.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_METADATA_KEY,
      targets,
    );
    if (isPublic === true) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_METADATA_KEY,
      targets,
    );
    const requiredAny = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_ANY_METADATA_KEY,
      targets,
    );
    if (
      (!required || required.length === 0) &&
      (!requiredAny || requiredAny.length === 0)
    ) {
      throw new ForbiddenError('This operation is missing an authorization policy');
    }

    const access = await this.authorization.getCurrentAccess();
    const granted = new Set(access.permissions);
    if (required && required.length > 0 && !required.every((permission) => granted.has(permission))) {
      throw new ForbiddenError();
    }
    if (
      requiredAny &&
      requiredAny.length > 0 &&
      !requiredAny.some((permission) => granted.has(permission))
    ) {
      throw new ForbiddenError();
    }
    return true;
  }
}
