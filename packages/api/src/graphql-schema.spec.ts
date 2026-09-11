import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';

import { AuthResolver } from './core/auth/auth.resolver';
import { HealthResolver } from './health/health.resolver';
import { AccountResolver } from './modules/account/account.resolver';
import { AttendanceResolver } from './modules/attendance/attendance.resolver';
import { ClientResolver } from './modules/clients/client.resolver';
import { CompensationResolver } from './modules/finance/compensation/compensation.resolver';
import { EmployeeResolver } from './modules/employee/employee.resolver';
import { EmployeeRecordsResolver } from './modules/employee-records/employee-records.resolver';
import { EngagementResolver } from './modules/engagement/engagement.resolver';
import { BillingResolver } from './modules/finance/billing/billing.resolver';
import { PayrollResolver } from './modules/finance/payroll/payroll.resolver';
import { LeaveResolver } from './modules/leave/leave.resolver';
import { RecruitmentResolver } from './modules/recruitment/recruitment.resolver';

// Builds the code-first GraphQL schema from the resolver/type decorators without
// a database or DI container. Catches schema-level errors (unresolved field
// types, bad @ObjectType/@InputType wiring) that would otherwise only surface as
// a boot-time crash.
describe('code-first GraphQL schema', () => {
  it('builds a valid schema exposing the employee operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([HealthResolver, EmployeeResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type Employee');
    expect(sdl).toContain('health');
    expect(sdl).toContain('createEmployee');
    expect(sdl).toContain('terminateEmployee');
    expect(sdl).toContain('myEmployee');
    expect(sdl).toContain('myEmployeeProfile');
    expect(sdl).toContain('updateMyEmployeeProfile');
    expect(sdl).toContain('input CreateEmployeeInput');
  });

  it('builds the Phase 2 leave and attendance operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([HealthResolver, LeaveResolver, AttendanceResolver]);
    const sdl = printSchema(schema);

    // Leave
    expect(sdl).toContain('type LeaveType');
    expect(sdl).toContain('type LeaveRequest');
    expect(sdl).toContain('submitLeaveRequest');
    expect(sdl).toContain('approveLeaveRequest');
    expect(sdl).toContain('leaveRequestInbox');
    expect(sdl).toContain('approveTeamLeaveRequest');
    expect(sdl).toContain('rejectTeamLeaveRequest');
    expect(sdl).toContain('submittedAt');
    expect(sdl).toContain('decidedAt');
    expect(sdl).toContain('decisionNote');
    expect(sdl).toContain('myLeaveBalances');
    expect(sdl).toContain('submitMyLeaveRequest');
    expect(sdl).toContain('upcomingHolidays');
    // Attendance
    expect(sdl).toContain('type Timesheet');
    expect(sdl).toContain('clockOut');
    expect(sdl).toContain('lockTimesheet');
  });

  it('builds the Phase 3 compensation operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([HealthResolver, CompensationResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type PayComponent');
    expect(sdl).toContain('type SalaryStructure');
    expect(sdl).toContain('type SalaryRevision');
    expect(sdl).toContain('createPayComponent');
    expect(sdl).toContain('createSalaryStructure');
    expect(sdl).toContain('reviseSalary');
    expect(sdl).toContain('currentSalaryRevision');
    expect(sdl).toContain('myCurrentSalaryRevision');
    expect(sdl).toContain('type BonusAward');
    expect(sdl).toContain('bonusAwards');
    expect(sdl).toContain('awardBonus');
  });

  it('builds the portal access and workspace-user operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([AuthResolver, AccountResolver, ClientResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('roleKeys: [String!]!');
    expect(sdl).toContain('portal: String!');
    expect(sdl).toContain('workspaceUsers');
    expect(sdl).toContain('assignableWorkspaceRoles');
    expect(sdl).toContain('createWorkspaceUser');
    expect(sdl).toContain('updateWorkspaceUserRole');
    expect(sdl).toContain('input UpdateWorkspaceUserRoleInput');
    expect(sdl).toContain('type WorkspaceSummary');
    expect(sdl).toContain('type Client');
    expect(sdl).toContain('workspaces: [WorkspaceSummary!]!');
    expect(sdl).toContain('clients: [Client!]!');
    expect(sdl).toContain('hasCreatedWorkspace');
    expect(sdl).toContain('onboardClient');
  });

  it('builds the client hiring-request handshake', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([RecruitmentResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type HiringRequest');
    expect(sdl).toContain('type HiringRequestUpdate');
    expect(sdl).toContain('updates: [HiringRequestUpdate!]!');
    expect(sdl).toContain('createHiringRequest');
    expect(sdl).toContain('updateHiringRequest');
    expect(sdl).toContain('hiringRequests');
  });

  it('builds the engagement announcement and feedback operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([EngagementResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type Announcement');
    expect(sdl).toContain('announcements');
    expect(sdl).toContain('publishAnnouncement');
    expect(sdl).toContain('type EmployeeFeedback');
    expect(sdl).toContain('submitMyFeedback');
    expect(sdl).toContain('employeeFeedback');
    expect(sdl).toContain('resolveEmployeeFeedback');
  });

  it('builds the finance payroll operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([HealthResolver, PayrollResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type PayrollRun');
    expect(sdl).toContain('type PayrollRunLine');
    expect(sdl).toContain('type Payslip');
    expect(sdl).toContain('type TaxSlabGroup');
    expect(sdl).toContain('createPayrollRun');
    expect(sdl).toContain('regeneratePayrollRun');
    expect(sdl).toContain('updatePayrollRunLine');
    expect(sdl).toContain('removePayrollRunLine');
    expect(sdl).toContain('finalizePayrollRun');
    expect(sdl).toContain('bankAdviceCsv');
    expect(sdl).toContain('myPayslips');
    expect(sdl).toContain('runPayslips');
    expect(sdl).toContain('taxSlabGroup');
    expect(sdl).toContain('replaceTaxSlabs');
    expect(sdl).toContain('activateTaxSlabGroup');
    expect(sdl).toContain('input CreatePayrollRunInput');
  });

  it('builds the finance billing operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([HealthResolver, BillingResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type Invoice');
    expect(sdl).toContain('type InvoiceLine');
    expect(sdl).toContain('type BillingGroup');
    expect(sdl).toContain('type ClientBillingConfig');
    expect(sdl).toContain('billingConfig');
    expect(sdl).toContain('updateBillingConfig');
    expect(sdl).toContain('billingGroups');
    expect(sdl).toContain('setBillingMember');
    expect(sdl).toContain('clientInvoices');
    expect(sdl).toContain('draftInvoicesFromRun');
    expect(sdl).toContain('openExpensesInvoice');
    expect(sdl).toContain('addInvoiceLine');
    expect(sdl).toContain('issueInvoice');
    expect(sdl).toContain('markInvoicePaid');
  });

  it('builds the employee records assessment and document operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([EmployeeRecordsResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type EmployeeAssessment');
    expect(sdl).toContain('employeeAssessments');
    expect(sdl).toContain('recordEmployeeAssessment');
    expect(sdl).toContain('type EmployeeHrRecord');
    expect(sdl).toContain('employeeHrRecord');
    expect(sdl).toContain('updateEmployeeHrRecord');
    expect(sdl).toContain('type EmployeeOnboardingTask');
    expect(sdl).toContain('employeeOnboardingTasks');
    expect(sdl).toContain('updateEmployeeOnboardingTask');
    expect(sdl).toContain('type EmployeeDocument');
    expect(sdl).toContain('employeeDocuments');
    expect(sdl).toContain('attachEmployeeDocument');
    expect(sdl).toContain('addEmployeeDocumentVersion');
    expect(sdl).toContain('prepareEmployeeDocumentUpload');
    expect(sdl).toContain('employeeDocumentDownloadAccess');
    expect(sdl).toContain('requestEmployeeDocumentSignature');
    expect(sdl).toContain('type DocumentAccess');
    expect(sdl).toContain('type EmployeeDocumentSignatureRequest');
    expect(sdl).toContain('latestVersionNumber');
    expect(sdl).toContain('signatureStatus');
  });
});
