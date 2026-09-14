import { Global, Module } from '@nestjs/common';

import { AuthzModule } from '../authz/authz.module';

import { PlatformScopeService } from './platform-scope.service';

// Cross-tenant reads/writes are one deliberate capability, so they live in one
// module that depends on authz — keeping TenancyModule free of that import
// (TenancyModule's exports are global, and importing a module that consumes
// them could create a cycle). Global so the recruitment board can inject it.
@Global()
@Module({
  imports: [AuthzModule],
  providers: [PlatformScopeService],
  exports: [PlatformScopeService],
})
export class PlatformScopeModule {}
