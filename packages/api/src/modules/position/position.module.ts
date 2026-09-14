import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';

import { Grade } from './entities/grade.entity';
import { JobFamily } from './entities/job-family.entity';
import { Job } from './entities/job.entity';
import { PayBand } from './entities/pay-band.entity';
import { Position } from './entities/position.entity';
import { PositionService } from './position.service';
import { POSITION_REPOSITORY } from './position.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([JobFamily, Job, Grade, PayBand, Position])],
  providers: [
    PositionService,
    provideTenantScopedRepository(POSITION_REPOSITORY, Position),
  ],
  exports: [PositionService],
})
export class PositionModule {}
