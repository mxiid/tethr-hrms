// Permission strings follow '<resource>:<action>'. Roles are granted sets of
// these, and roles live in tenant-scoped data (config-as-data, non-negotiable
// #5) — never hard-coded role checks in business logic.
export const PERMISSIONS = {
  employeeRead: 'employee:read',
  employeeWrite: 'employee:write',
  employeeSensitiveRead: 'employee:sensitive:read',
  employeeSelfRead: 'employee:self:read',
  employeeSelfWrite: 'employee:self:write',
  assignmentWrite: 'assignment:write',
  organizationManage: 'organization:manage',
  positionManage: 'position:manage',
  userManage: 'user:manage',
  roleManage: 'role:manage',
  clientManage: 'client:manage',
  // Cross-workspace operator scope: only ever granted to Tethr-side roles, and
  // only honoured when the caller's organization is kind 'tethr' (both checks
  // live in PlatformScopeService — the permission alone is not sufficient).
  platformReadAll: 'platform:read-all',
  hiringRequestRead: 'hiring-request:read',
  hiringRequestWrite: 'hiring-request:write',
  hiringRequestManage: 'hiring-request:manage',
  // The candidate pool is Tethr-only data (client visibility is the narrow
  // shortlist projection, never a general read).
  candidateRead: 'candidate:read',
  candidateManage: 'candidate:manage',
  // Shortlists cross the portal line deliberately: the client reads only the
  // entries presented to them and records their verdict.
  shortlistRead: 'shortlist:read',
  shortlistDecide: 'shortlist:decide',
  formManage: 'form:manage',
  assessmentRead: 'assessment:read',
  assessmentWrite: 'assessment:write',
  documentRead: 'document:read',
  documentManage: 'document:manage',
  compensationRead: 'compensation:read',
  compensationOwnRead: 'compensation:own:read',
  compensationWrite: 'compensation:write',
  bonusManage: 'bonus:manage',
  leaveOwnRead: 'leave:own:read',
  leaveTeamRead: 'leave:team:read',
  leaveOwnWrite: 'leave:own:write',
  leaveApprove: 'leave:approve',
  attendanceOwnRead: 'attendance:own:read',
  attendanceOwnWrite: 'attendance:own:write',
  attendanceTeamRead: 'attendance:team:read',
  attendanceApprove: 'attendance:approve',
  holidayRead: 'holiday:read',
  announcementRead: 'announcement:read',
  announcementWrite: 'announcement:write',
  feedbackRead: 'feedback:read',
  feedbackWrite: 'feedback:write',
  feedbackManage: 'feedback:manage',
  payrollRead: 'payroll:read',
  payrollWrite: 'payroll:write',
  payrollFinalize: 'payroll:finalize',
  payslipRead: 'payslip:read',
  payslipOwnRead: 'payslip:own:read',
  billingRead: 'billing:read',
  billingWrite: 'billing:write',
  billingOwnRead: 'billing:own:read',
  // Employee expense claims: employees file their own; approvers decide; finance
  // pays (directly or by scheduling a payroll adjustment) and can pass billable
  // lines through to the client's expenses invoice.
  expenseRead: 'expense:read',
  expenseWrite: 'expense:write',
  expenseApprove: 'expense:approve',
  expensePay: 'expense:pay',
  expenseOwnRead: 'expense:own:read',
  expenseOwnWrite: 'expense:own:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];
