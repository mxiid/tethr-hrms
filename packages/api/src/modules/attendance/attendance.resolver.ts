import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';
import { AttendanceService } from './attendance.service';
import { ClockEventView } from './dto/clock-event.output';
import { OpenTimesheetInput } from './dto/open-timesheet.input';
import { RecordTimeEntryInput } from './dto/record-time-entry.input';
import { TimeEntryView } from './dto/time-entry.output';
import { TimesheetView } from './dto/timesheet.output';
import { ClockEvent } from './entities/clock-event.entity';
import { TimeEntry } from './entities/time-entry.entity';
import { Timesheet } from './entities/timesheet.entity';
import { TimesheetService } from './timesheet.service';

import { toId, type EmployeeId, type UserId } from '@hrms/shared';

const toClockEventView = (event: ClockEvent): ClockEventView => ({
  id: event.id,
  employeeId: event.employeeId,
  type: event.type,
  occurredAt: event.occurredAt.toISOString(),
  source: event.source,
});

const toTimeEntryView = (entry: TimeEntry): TimeEntryView => ({
  id: entry.id,
  employeeId: entry.employeeId,
  date: entry.date,
  hours: Number(entry.hours),
  source: entry.source,
});

const toTimesheetView = (timesheet: Timesheet): TimesheetView => ({
  id: timesheet.id,
  employeeId: timesheet.employeeId,
  periodStart: timesheet.periodStart,
  periodEnd: timesheet.periodEnd,
  status: timesheet.status,
  totalHours: Number(timesheet.totalHours),
});

@Resolver(() => TimesheetView)
export class AttendanceResolver {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly timesheetService: TimesheetService,
    private readonly authService: AuthService,
  ) {}

  // The employee this session is linked to. Self-service operations resolve the
  // subject here rather than trusting an employeeId argument, so holding
  // `attendance:own:write` can never clock a colleague in or out.
  private async currentEmployeeId(): Promise<EmployeeId> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return user.employeeId;
  }

  @Mutation(() => ClockEventView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceOwnWrite)
  async clockInMe(): Promise<ClockEventView> {
    return toClockEventView(await this.attendanceService.clockIn(await this.currentEmployeeId()));
  }

  @Mutation(() => TimeEntryView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceOwnWrite)
  async clockOutMe(): Promise<TimeEntryView> {
    return toTimeEntryView(await this.attendanceService.clockOut(await this.currentEmployeeId()));
  }

  @Query(() => [TimeEntryView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceOwnRead)
  async myTimeEntries(
    @Args('from') from: string,
    @Args('to') to: string,
  ): Promise<TimeEntryView[]> {
    const entries = await this.attendanceService.listEntries(
      await this.currentEmployeeId(),
      from,
      to,
    );
    return entries.map(toTimeEntryView);
  }

  // Clocking someone else in is an administrative correction, so it sits behind
  // the approve permission rather than the self-service one.
  @Mutation(() => ClockEventView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async clockIn(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<ClockEventView> {
    return toClockEventView(await this.attendanceService.clockIn(toId<EmployeeId>(employeeId)));
  }

  @Mutation(() => TimeEntryView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async clockOut(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<TimeEntryView> {
    return toTimeEntryView(await this.attendanceService.clockOut(toId<EmployeeId>(employeeId)));
  }

  @Mutation(() => TimeEntryView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async recordTimeEntry(@Args('input') input: RecordTimeEntryInput): Promise<TimeEntryView> {
    const entry = await this.attendanceService.recordEntry({
      employeeId: toId<EmployeeId>(input.employeeId),
      date: input.date,
      hours: input.hours,
      note: input.note ?? null,
    });
    return toTimeEntryView(entry);
  }

  @Query(() => [TimeEntryView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceTeamRead)
  async timeEntries(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('from') from: string,
    @Args('to') to: string,
  ): Promise<TimeEntryView[]> {
    const entries = await this.attendanceService.listEntries(toId<EmployeeId>(employeeId), from, to);
    return entries.map(toTimeEntryView);
  }

  @Query(() => [TimesheetView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceTeamRead)
  async timesheets(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<TimesheetView[]> {
    const timesheets = await this.timesheetService.listForEmployee(toId<EmployeeId>(employeeId));
    return timesheets.map(toTimesheetView);
  }

  @Mutation(() => TimesheetView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async openTimesheet(@Args('input') input: OpenTimesheetInput): Promise<TimesheetView> {
    const timesheet = await this.timesheetService.open({
      employeeId: toId<EmployeeId>(input.employeeId),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    return toTimesheetView(timesheet);
  }

  // The actor on submit/approve is taken from the session, not an argument, so
  // the audit trail cannot be attributed to someone else.
  @Mutation(() => TimesheetView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async submitTimesheet(
    @Args('timesheetId', { type: () => ID }) timesheetId: string,
  ): Promise<TimesheetView> {
    const user = await this.authService.getCurrentUser();
    return toTimesheetView(await this.timesheetService.submit(timesheetId, toId<UserId>(user.id)));
  }

  @Mutation(() => TimesheetView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async approveTimesheet(
    @Args('timesheetId', { type: () => ID }) timesheetId: string,
  ): Promise<TimesheetView> {
    const user = await this.authService.getCurrentUser();
    return toTimesheetView(await this.timesheetService.approve(timesheetId, toId<UserId>(user.id)));
  }

  @Mutation(() => TimesheetView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.attendanceApprove)
  async lockTimesheet(
    @Args('timesheetId', { type: () => ID }) timesheetId: string,
  ): Promise<TimesheetView> {
    return toTimesheetView(await this.timesheetService.lock(timesheetId));
  }
}
