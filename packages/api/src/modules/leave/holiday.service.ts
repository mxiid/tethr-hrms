import type { HolidayCalendarId, IsoDate } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { Between } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { HolidayCalendar } from './entities/holiday-calendar.entity';
import { Holiday } from './entities/holiday.entity';
import { HOLIDAY_CALENDAR_REPOSITORY, HOLIDAY_REPOSITORY } from './leave.tokens';

type CreateHolidayCalendarData = {
  readonly name: string;
  readonly countryCode?: string | null;
};
type AddHolidayData = {
  readonly calendarId: HolidayCalendarId;
  readonly date: IsoDate;
  readonly name: string;
};

@Injectable()
export class HolidayService {
  constructor(
    @Inject(HOLIDAY_CALENDAR_REPOSITORY)
    private readonly calendars: TenantScopedRepository<HolidayCalendar>,
    @Inject(HOLIDAY_REPOSITORY) private readonly holidays: TenantScopedRepository<Holiday>,
  ) {}

  createCalendar(input: CreateHolidayCalendarData): Promise<HolidayCalendar> {
    const calendar = this.calendars.create({
      name: input.name,
      countryCode: input.countryCode ?? null,
    });
    return this.calendars.save(calendar);
  }

  listCalendars(): Promise<HolidayCalendar[]> {
    return this.calendars.find();
  }

  addHoliday(input: AddHolidayData): Promise<Holiday> {
    const holiday = this.holidays.create({
      calendarId: input.calendarId,
      date: input.date,
      name: input.name,
    });
    return this.holidays.save(holiday);
  }

  listUpcoming(from: IsoDate, to: IsoDate): Promise<Holiday[]> {
    return this.holidays.find({
      where: { date: Between(from, to) } as FindOptionsWhere<Holiday>,
      order: { date: 'ASC' },
    });
  }

  listUpcomingForCalendar(calendarId: HolidayCalendarId, from: IsoDate, to: IsoDate): Promise<Holiday[]> {
    return this.holidays.find({
      where: { calendarId, date: Between(from, to) } as FindOptionsWhere<Holiday>,
      order: { date: 'ASC' },
    });
  }

  // The set of holiday dates in [from, to] for a calendar — fed to countWorkingDays
  // so holidays don't consume leave.
  async getHolidayDates(
    calendarId: HolidayCalendarId,
    from: IsoDate,
    to: IsoDate,
  ): Promise<Set<IsoDate>> {
    const rows = await this.holidays.find({
      where: { calendarId, date: Between(from, to) } as FindOptionsWhere<Holiday>,
    });
    return new Set(rows.map((holiday) => holiday.date));
  }
}
