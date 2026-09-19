import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_METADATA_KEY = 'hrms:public-operation';

// Marks an operation as deliberately reachable without a permission check:
// login/signup and their prechecks, session reads that do their own checks,
// and the token-verified anonymous surfaces (public forms, signed storage
// links). The PermissionsGuard is deny-by-default, so this is the only way to
// opt an operation out of authorization — and the source-scanning spec makes
// every opt-out explicit and reviewable.
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_METADATA_KEY, true);
