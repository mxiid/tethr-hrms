import { Module } from '@nestjs/common';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { ClientsModule } from '../clients/clients.module';
import { EmployeeDirectoryModule } from '../employee/employee-directory.module';
import { OrganizationModule } from '../organization/organization.module';

import { AccountResolver } from './account.resolver';
import { AccountService } from './account.service';
import { EmployeeLinkGuard } from './employee-link-guard.service';

// Composes Auth (core) + Organization + Clients + Employee (modules) for tenant
// signup, client onboarding, and workspace-user administration. modules -> core
// and modules -> modules (via published services) are both allowed.
@Module({
  imports: [
    AuthModule,
    AuthzModule,
    OrganizationModule,
    ClientsModule,
    EmployeeDirectoryModule,
  ],
  providers: [AccountService, AccountResolver, EmployeeLinkGuard],
  exports: [AccountService],
})
export class AccountModule {}
