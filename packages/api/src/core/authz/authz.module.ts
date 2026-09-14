import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthorizationService } from './authz.service';
import { PermissionsGuard } from './permissions.guard';
import { Role } from './role.entity';
import { UserRoleAssignment } from './user-role-assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRoleAssignment])],
  providers: [AuthorizationService, PermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard],
})
export class AuthzModule {}
