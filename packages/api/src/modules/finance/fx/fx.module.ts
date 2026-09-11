import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthzModule } from '../../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../../core/tenancy/tenant-repository.provider';

import { ExchangeRate } from './entities/exchange-rate.entity';
import { FxResolver } from './fx.resolver';
import { FxService } from './fx.service';
import { EXCHANGE_RATE_REPOSITORY } from './fx.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate]), AuthzModule],
  providers: [
    FxService,
    FxResolver,
    provideTenantScopedRepository(EXCHANGE_RATE_REPOSITORY, ExchangeRate),
  ],
  exports: [FxService],
})
export class FxModule {}
