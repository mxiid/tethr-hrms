import { SetMetadata } from '@nestjs/common';

import type { Permission } from './permissions';

export const PERMISSIONS_METADATA_KEY = 'hrms:required-permissions';
export const PERMISSIONS_ANY_METADATA_KEY = 'hrms:required-any-permissions';

// Declares the permissions a resolver/handler requires. The PermissionsGuard
// reads this metadata. Coarse authentication belongs in a guard; fine-grained
// per-record checks belong in the service (architecture.md §2.4).
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_METADATA_KEY, permissions);

// Like RequirePermissions, but satisfied by ANY of the listed permissions.
// Used where two audiences reach an operation through different grants — e.g.
// employee education/work history, where HR holds `employee:write` and the
// record's owner holds `employee:self:write`. The per-record ownership check
// still runs in the resolver/service.
export const RequireAnyPermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_ANY_METADATA_KEY, permissions);
