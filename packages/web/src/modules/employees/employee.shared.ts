import type { EmploymentStatus, WorkerType } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import type { CSSProperties } from 'react';

// Types, labels, and formatters shared by the employee directory and the
// employee profile page, so neither page has to import the other.

type AssignmentView = {
  readonly id: string;
  readonly positionTitle: string | null;
  readonly departmentName: string | null;
  readonly locationName: string | null;
  readonly reportsToEmployeeId: string | null;
  readonly reportsToName: string | null;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly assignmentType: string;
};

export type EmployeeRecord = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly salutation: string | null;
  readonly workEmail: string | null;
  readonly roleTitle: string | null;
  readonly dateOfBirth: string | null;
  readonly hireDate: string;
  readonly probationEndDate: string | null;
  readonly scheduledConfirmationDate: string | null;
  readonly finalConfirmationDate: string | null;
  readonly contractEndDate: string | null;
  readonly noticePeriodDays: number | null;
  readonly retirementDate: string | null;
  readonly holidayCalendarId: string | null;
  readonly employmentStatus: EmploymentStatus;
  readonly workerType: WorkerType;
  readonly currentAssignment: AssignmentView | null;
  readonly assignmentHistory: readonly AssignmentView[];
};

export type EmployeesData = { employees: ReadonlyArray<EmployeeRecord> };
export type CreateEmployeeData = { createEmployee: EmployeeRecord };

type ChipStyle = CSSProperties & { readonly '--chip-color': string };

const AVATAR_COLORS: readonly MainColorName[] = [
  'blue',
  'green',
  'violet',
  'amber',
  'tomato',
  'jade',
  'plum',
  'cyan',
];

export const statusLabels: Record<EmploymentStatus, string> = {
  active: 'Active',
  onLeave: 'On leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

export const statusColors: Record<EmploymentStatus, MainColorName> = {
  active: 'green',
  onLeave: 'amber',
  suspended: 'tomato',
  terminated: 'gray',
};

export const workerTypeLabels: Record<WorkerType, string> = {
  permanent: 'Permanent',
  fixedTerm: 'Fixed term',
  contractor: 'Contractor',
  intern: 'Intern',
  temporary: 'Temporary',
};

export const fullName = (employee: EmployeeRecord): string =>
  `${employee.firstName} ${employee.lastName}`;

export const initials = (employee: EmployeeRecord): string =>
  `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();

export const colorFor = (id: string): MainColorName => {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? 'blue';
};

export const chipStyle = (color: MainColorName): ChipStyle => ({
  '--chip-color': `var(--hrms-color-tag-${color})`,
});

export { formatDate } from '@hrms/shared';

export const daysSince = (value: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(`${value}T00:00:00`).getTime()) / 86_400_000));
