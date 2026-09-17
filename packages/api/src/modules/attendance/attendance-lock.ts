// The transaction-scoped advisory lock every attendance write for one employee
// shares: punches (clockIn/clockOut), manual entries (recordEntry), and
// timesheet open/lock. Keeping one key means a timesheet freeze and an entry
// insert can never interleave.
export const attendanceLockKey = (organizationId: string, employeeId: string): string =>
  `attendance:${organizationId}:${employeeId}`;
