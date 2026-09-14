import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';
import { AttendanceResolver } from './attendance.resolver';
import { AttendanceService } from './attendance.service';
import {
  CLOCK_EVENT_REPOSITORY,
  TIME_ENTRY_REPOSITORY,
  TIMESHEET_REPOSITORY,
} from './attendance.tokens';
import { ClockEvent } from './entities/clock-event.entity';
import { Regularization } from './entities/regularization.entity';
import { TimeEntry } from './entities/time-entry.entity';
import { Timesheet } from './entities/timesheet.entity';
import { TimesheetService } from './timesheet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClockEvent, TimeEntry, Timesheet, Regularization]),
    AuthModule,
    AuthzModule,
  ],
  providers: [
    AttendanceService,
    TimesheetService,
    AttendanceResolver,
    provideTenantScopedRepository(CLOCK_EVENT_REPOSITORY, ClockEvent),
    provideTenantScopedRepository(TIME_ENTRY_REPOSITORY, TimeEntry),
    provideTenantScopedRepository(TIMESHEET_REPOSITORY, Timesheet),
  ],
  exports: [AttendanceService, TimesheetService],
})
export class AttendanceModule {}
