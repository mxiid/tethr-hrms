import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthzModule } from '../authz/authz.module';
import { ConfigService } from '../config/config.service';
import { provideTenantScopedRepository } from '../tenancy/tenant-repository.provider';

import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { USER_REPOSITORY } from './auth.tokens';
import { EmployeeLifecycleConsumer } from './employee-lifecycle.consumer';
import { FormTokenService } from './form-token.service';
import { PasswordService } from './password.service';
import { User } from './user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuthzModule,
    // Global so the TenantContextMiddleware (in core/tenancy) can verify tokens
    // without importing this module — avoiding a tenancy <-> auth cycle.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
      }),
    }),
  ],
  providers: [
    PasswordService,
    AuthService,
    AuthResolver,
    FormTokenService,
    EmployeeLifecycleConsumer,
    provideTenantScopedRepository(USER_REPOSITORY, User),
  ],
  exports: [AuthService, PasswordService, FormTokenService],
})
export class AuthModule {}
