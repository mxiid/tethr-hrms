import type { DataScope, PortalKind, SystemRoleKey } from '@hrms/shared';

import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from './permissions';

type SystemRoleDefinition = {
  readonly key: SystemRoleKey;
  readonly name: string;
  readonly portal: PortalKind;
  readonly dataScope: DataScope;
  readonly permissions: readonly Permission[];
};

// These definitions only seed tenant data. Every authorization decision uses the
// permissions persisted on the effective role, so an administrator can later
// adapt a role without shipping code.
export const SYSTEM_ROLES: Readonly<Record<SystemRoleKey, SystemRoleDefinition>> = {
  tethrAdmin: {
    key: 'tethrAdmin',
    name: 'Tethr administrator',
    portal: 'tethr',
    dataScope: 'organization',
    permissions: ALL_PERMISSIONS,
  },
  tethrHr: {
    key: 'tethrHr',
    name: 'Tethr HR',
    portal: 'tethr',
    dataScope: 'organization',
    permissions: [
      PERMISSIONS.employeeRead,
      PERMISSIONS.employeeWrite,
      PERMISSIONS.employeeSensitiveRead,
      PERMISSIONS.assignmentWrite,
      PERMISSIONS.documentRead,
      PERMISSIONS.documentManage,
      PERMISSIONS.compensationRead,
      PERMISSIONS.compensationWrite,
      PERMISSIONS.bonusManage,
      PERMISSIONS.leaveTeamRead,
      PERMISSIONS.leaveApprove,
      PERMISSIONS.attendanceTeamRead,
      PERMISSIONS.attendanceApprove,
      PERMISSIONS.holidayRead,
      PERMISSIONS.platformReadAll,
      PERMISSIONS.hiringRequestRead,
      PERMISSIONS.hiringRequestWrite,
      PERMISSIONS.hiringRequestManage,
      PERMISSIONS.candidateRead,
      PERMISSIONS.candidateManage,
      PERMISSIONS.shortlistRead,
      PERMISSIONS.formManage,
      PERMISSIONS.assessmentRead,
      PERMISSIONS.assessmentWrite,
      PERMISSIONS.announcementRead,
      PERMISSIONS.announcementWrite,
      PERMISSIONS.feedbackRead,
      PERMISSIONS.feedbackManage,
    ],
  },
  tethrFinance: {
    key: 'tethrFinance',
    name: 'Tethr Finance',
    portal: 'tethr',
    dataScope: 'organization',
    permissions: [
      PERMISSIONS.employeeRead,
      PERMISSIONS.compensationRead,
      PERMISSIONS.payrollRead,
      PERMISSIONS.payrollWrite,
      PERMISSIONS.payrollFinalize,
      PERMISSIONS.payslipRead,
      PERMISSIONS.billingRead,
      PERMISSIONS.billingWrite,
      PERMISSIONS.leaveTeamRead,
      PERMISSIONS.attendanceTeamRead,
      PERMISSIONS.holidayRead,
    ],
  },
  clientAdmin: {
    key: 'clientAdmin',
    name: 'Client administrator',
    portal: 'client',
    dataScope: 'organization',
    permissions: [
      PERMISSIONS.employeeRead,
      PERMISSIONS.userManage,
      PERMISSIONS.organizationManage,
      PERMISSIONS.hiringRequestRead,
      PERMISSIONS.hiringRequestWrite,
      PERMISSIONS.shortlistRead,
      PERMISSIONS.shortlistDecide,
      PERMISSIONS.assessmentRead,
      PERMISSIONS.assessmentWrite,
      PERMISSIONS.documentRead,
      PERMISSIONS.compensationRead,
      PERMISSIONS.compensationWrite,
      PERMISSIONS.bonusManage,
      PERMISSIONS.leaveTeamRead,
      PERMISSIONS.attendanceTeamRead,
      PERMISSIONS.attendanceApprove,
      PERMISSIONS.holidayRead,
      PERMISSIONS.announcementRead,
      PERMISSIONS.billingOwnRead,
    ],
  },
  clientMember: {
    key: 'clientMember',
    name: 'Client member',
    portal: 'client',
    dataScope: 'organization',
    permissions: [
      PERMISSIONS.employeeRead,
      PERMISSIONS.hiringRequestRead,
      PERMISSIONS.hiringRequestWrite,
      PERMISSIONS.shortlistRead,
      PERMISSIONS.shortlistDecide,
      PERMISSIONS.assessmentRead,
      PERMISSIONS.documentRead,
      PERMISSIONS.compensationRead,
      PERMISSIONS.leaveTeamRead,
      PERMISSIONS.attendanceTeamRead,
      PERMISSIONS.holidayRead,
      PERMISSIONS.announcementRead,
      PERMISSIONS.billingOwnRead,
    ],
  },
  employee: {
    key: 'employee',
    name: 'Employee',
    portal: 'employee',
    dataScope: 'own',
    permissions: [
      PERMISSIONS.employeeSelfRead,
      PERMISSIONS.employeeSelfWrite,
      PERMISSIONS.compensationOwnRead,
      PERMISSIONS.payslipOwnRead,
      PERMISSIONS.leaveOwnRead,
      PERMISSIONS.leaveOwnWrite,
      PERMISSIONS.attendanceOwnRead,
      PERMISSIONS.attendanceOwnWrite,
      PERMISSIONS.holidayRead,
      PERMISSIONS.announcementRead,
      PERMISSIONS.feedbackWrite,
    ],
  },
};

export const portalForRoleKeys = (roleKeys: readonly string[]): PortalKind => {
  if (
    roleKeys.includes('tethrAdmin') ||
    roleKeys.includes('tethrHr') ||
    roleKeys.includes('tethrFinance')
  ) {
    return 'tethr';
  }
  if (roleKeys.includes('clientAdmin') || roleKeys.includes('clientMember')) return 'client';
  if (roleKeys.includes('employee')) return 'employee';
  return 'none';
};
