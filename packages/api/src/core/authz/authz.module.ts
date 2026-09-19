import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../auth/user.entity';

import { AuthorizationService } from './authz.service';
import { Role } from './role.entity';
import { UserRoleAssignment } from './user-role-assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRoleAssignment, User])],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthzModule {}
