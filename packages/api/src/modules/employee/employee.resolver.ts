import {
  toId,
  type EmployeeId,
  type PositionId,
  type EmployeeSeparationId,
  type HolidayCalendarId,
  type IsoDate,
  type Salutation,
  type SeparationType,
  type UserId,
  type WorkerType,
} from '@hrms/shared';
import { Args, ID, Mutation, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql';

import { ForbiddenError, NotFoundError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { AuthorizationService } from '../../core/authz/authz.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { RequireAnyPermissions, RequirePermissions } from '../../core/authz/require-permissions.decorator';
import { AssignmentService } from '../assignment/assignment.service';
import { DepartmentService } from '../organization/department.service';
import { LocationService } from '../organization/location.service';
import { PositionService } from '../position/position.service';

import { CreateEmployeeInput } from './dto/create-employee.input';
import { EmployeeAssignmentView } from './dto/employee-assignment.view';
import { CreateEmployeeEducationInput, UpdateEmployeeEducationInput } from './dto/employee-education.input';
import { EmployeeEducationView } from './dto/employee-education.output';
import { EmployeeExitInterviewView } from './dto/employee-exit-interview.output';
import { EmployeeOffboardingTaskView } from './dto/employee-offboarding-task.output';
import { EmployeePersonalDetailsView } from './dto/employee-personal-details.output';
import { EmployeeProfileView } from './dto/employee-profile.output';
import { EmployeeSeparationView } from './dto/employee-separation.output';
import { CreateEmployeeWorkHistoryInput, UpdateEmployeeWorkHistoryInput } from './dto/employee-work-history.input';
import { EmployeeWorkHistoryView } from './dto/employee-work-history.output';
import { EmployeeType } from './dto/employee.output';
import { SeparateEmployeeInput } from './dto/separate-employee.input';
import { SetEmployeeManagerInput } from './dto/set-employee-manager.input';
import { TerminateEmployeeInput } from './dto/terminate-employee.input';
import { UpdateEmployeePhotoInput } from './dto/update-employee-photo.input';
import { UpdateEmployeeInput } from './dto/update-employee.input';
import { UpdateMyPhotoInput } from './dto/update-my-photo.input';
import { UpdateMyProfileInput } from './dto/update-my-profile.input';
import { UpdateOffboardingTaskInput } from './dto/update-offboarding-task.input';
import { UpdateMyPersonalDetailsInput, UpdatePersonalDetailsInput } from './dto/update-personal-details.input';
import { UpsertExitInterviewInput } from './dto/upsert-exit-interview.input';
import { EmployeeDirectoryService } from './employee-directory.service';
import { EmployeeEducationService } from './employee-education.service';
import { EmployeeExitInterviewService } from './employee-exit-interview.service';
import { EmployeeOffboardingService } from './employee-offboarding.service';
import { EmployeePersonalDetailsService } from './employee-personal-details.service';
import { EmployeeProfileService } from './employee-profile.service';
import { EmployeeSeparationService } from './employee-separation.service';
import { EmployeeWorkHistoryService } from './employee-work-history.service';
import { EmployeeService } from './employee.service';
import { EmployeeEducation } from './entities/employee-education.entity';
import { EmployeeExitInterview } from './entities/employee-exit-interview.entity';
import { EmployeeOffboardingTask } from './entities/employee-offboarding-task.entity';
import { EmployeePersonalDetails } from './entities/employee-personal-details.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { EmployeeSeparation } from './entities/employee-separation.entity';
import { EmployeeWorkHistory } from './entities/employee-work-history.entity';
import { Employee } from './entities/employee.entity';

// Maps the entity to the GraphQL boundary type. The resolver knows both sides;
// the service and DTOs do not (architecture.md §2.3).
const toEmployeeType = (employee: Employee): EmployeeType => ({
  id: employee.id,
  employeeNumber: employee.employeeNumber,
  firstName: employee.firstName,
  middleName: employee.middleName ?? null,
  lastName: employee.lastName,
  salutation: employee.salutation ?? null,
  workEmail: employee.workEmail,
  roleTitle: employee.roleTitle,
  dateOfBirth: employee.dateOfBirth,
  probationEndDate: employee.probationEndDate,
  hireDate: employee.hireDate,
  scheduledConfirmationDate: employee.scheduledConfirmationDate ?? null,
  finalConfirmationDate: employee.finalConfirmationDate ?? null,
  contractEndDate: employee.contractEndDate ?? null,
  noticePeriodDays: employee.noticePeriodDays ?? null,
  retirementDate: employee.retirementDate ?? null,
  holidayCalendarId: employee.holidayCalendarId ?? null,
  terminationDate: employee.terminationDate,
  employmentStatus: employee.employmentStatus,
  workerType: employee.workerType,
});

const toEmployeeProfileView = (profile: EmployeeProfile): EmployeeProfileView => ({
  employeeId: profile.employeeId,
  photoUrl: profile.photoUrl,
  personalEmail: profile.personalEmail,
  phone: profile.phone,
  addressLine1: profile.addressLine1,
  addressLine2: profile.addressLine2,
  city: profile.city,
  region: profile.region,
  countryCode: profile.countryCode,
  postalCode: profile.postalCode,
  permanentAddressLine1: profile.permanentAddressLine1 ?? null,
  permanentAddressLine2: profile.permanentAddressLine2 ?? null,
  permanentCity: profile.permanentCity ?? null,
  permanentRegion: profile.permanentRegion ?? null,
  permanentCountryCode: profile.permanentCountryCode ?? null,
  permanentPostalCode: profile.permanentPostalCode ?? null,
  currentAccommodationType: profile.currentAccommodationType ?? null,
  permanentAccommodationType: profile.permanentAccommodationType ?? null,
  preferredContactChannel: profile.preferredContactChannel ?? null,
  emergencyContactName: profile.emergencyContactName ?? null,
  emergencyContactPhone: profile.emergencyContactPhone ?? null,
  emergencyContactRelation: profile.emergencyContactRelation ?? null,
});

const toPersonalDetailsView = (details: EmployeePersonalDetails): EmployeePersonalDetailsView => ({
  id: details.id,
  employeeId: details.employeeId,
  passportNumber: details.passportNumber,
  passportIssueDate: details.passportIssueDate,
  passportIssuePlace: details.passportIssuePlace,
  passportValidUpto: details.passportValidUpto,
  maritalStatus: details.maritalStatus,
  bloodGroup: details.bloodGroup,
  familyBackground: details.familyBackground,
  healthDetails: details.healthDetails,
  bio: details.bio,
});

const toEducationView = (education: EmployeeEducation): EmployeeEducationView => ({
  id: education.id,
  employeeId: education.employeeId,
  schoolOrUniversity: education.schoolOrUniversity,
  qualification: education.qualification,
  level: education.level,
  yearOfPassing: education.yearOfPassing,
  classOrPercentage: education.classOrPercentage,
  majorSubjects: education.majorSubjects,
});

const toWorkHistoryView = (history: EmployeeWorkHistory): EmployeeWorkHistoryView => ({
  id: history.id,
  employeeId: history.employeeId,
  companyName: history.companyName,
  designation: history.designation,
  salary: history.salary,
  address: history.address,
  contact: history.contact,
  totalExperience: history.totalExperience,
});

const toSeparationView = (separation: EmployeeSeparation): EmployeeSeparationView => ({
  id: separation.id,
  employeeId: separation.employeeId,
  type: separation.type,
  resignationLetterDate: separation.resignationLetterDate,
  relievingDate: separation.relievingDate,
  reasonForLeaving: separation.reasonForLeaving,
  leaveEncashed: separation.leaveEncashed,
  encashmentDate: separation.encashmentDate,
  heldOn: separation.heldOn,
  newWorkplace: separation.newWorkplace,
  feedback: separation.feedback,
  initiatedByUserId: separation.initiatedByUserId,
});

const toExitInterviewView = (interview: EmployeeExitInterview): EmployeeExitInterviewView => ({
  id: interview.id,
  employeeId: interview.employeeId,
  separationId: interview.separationId,
  status: interview.status,
  scheduledDate: interview.scheduledDate,
  interviewerUserIds: interview.interviewerUserIds,
  summary: interview.summary,
  finalDecision: interview.finalDecision,
});

const toOffboardingTaskView = (task: EmployeeOffboardingTask): EmployeeOffboardingTaskView => ({
  id: task.id,
  employeeId: task.employeeId,
  separationId: task.separationId,
  taskKey: task.taskKey,
  title: task.title,
  status: task.status,
  dueDate: task.dueDate,
  completedAt: task.completedAt ? task.completedAt.toISOString() : null,
  completedByUserId: task.completedByUserId,
  notes: task.notes,
});

@Resolver(() => EmployeeType)
export class EmployeeResolver {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly profileService: EmployeeProfileService,
    private readonly personalDetailsService: EmployeePersonalDetailsService,
    private readonly educationService: EmployeeEducationService,
    private readonly workHistoryService: EmployeeWorkHistoryService,
    private readonly separationService: EmployeeSeparationService,
    private readonly exitInterviewService: EmployeeExitInterviewService,
    private readonly offboardingService: EmployeeOffboardingService,
    private readonly directoryService: EmployeeDirectoryService,
    private readonly assignmentService: AssignmentService,
    private readonly positionService: PositionService,
    private readonly departmentService: DepartmentService,
    private readonly locationService: LocationService,
    private readonly authService: AuthService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async assertCanWriteEducationOrWorkHistory(targetEmployeeId: EmployeeId): Promise<void> {
    const access = await this.authorization.getCurrentAccess();
    const hasSelf = access.permissions.includes(PERMISSIONS.employeeSelfWrite);
    const hasWrite = access.permissions.includes(PERMISSIONS.employeeWrite);
    if (!hasSelf && !hasWrite) {
      throw new ForbiddenError();
    }
    if (hasWrite) {
      return;
    }
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId || user.employeeId !== targetEmployeeId) {
      throw new ForbiddenError('You can only manage your own education and work history');
    }
  }

  @Query(() => [EmployeeType])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employees(): Promise<EmployeeType[]> {
    const employees = await this.employeeService.list();
    return employees.map(toEmployeeType);
  }

  @Query(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employee(@Args('id', { type: () => ID }) id: string): Promise<EmployeeType> {
    return toEmployeeType(await this.employeeService.getById(id));
  }

  @Mutation(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async createEmployee(@Args('input') input: CreateEmployeeInput): Promise<EmployeeType> {
    const employee = await this.employeeService.create({
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      middleName: input.middleName ?? null,
      lastName: input.lastName,
      salutation: (input.salutation as Salutation | undefined) ?? null,
      workEmail: input.workEmail ?? null,
      roleTitle: input.roleTitle ?? null,
      dateOfBirth: (input.dateOfBirth as IsoDate | undefined) ?? null,
      hireDate: input.hireDate as IsoDate,
      probationEndDate: (input.probationEndDate as IsoDate | undefined) ?? null,
      scheduledConfirmationDate: (input.scheduledConfirmationDate as IsoDate | undefined) ?? null,
      finalConfirmationDate: (input.finalConfirmationDate as IsoDate | undefined) ?? null,
      contractEndDate: (input.contractEndDate as IsoDate | undefined) ?? null,
      noticePeriodDays: input.noticePeriodDays ?? null,
      retirementDate: (input.retirementDate as IsoDate | undefined) ?? null,
      holidayCalendarId: input.holidayCalendarId ? toId<HolidayCalendarId>(input.holidayCalendarId) : null,
      workerType: (input.workerType as WorkerType | undefined) ?? 'permanent',
    });
    return toEmployeeType(employee);
  }

  @Mutation(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async updateEmployee(@Args('input') input: UpdateEmployeeInput): Promise<EmployeeType> {
    const user = await this.authService.getCurrentUser().catch(() => null);
    // Absent (`undefined`) means "leave alone"; explicit `null` means "clear".
    // Collapsing both with `??` made every cleared field silently revert.
    const employee = await this.employeeService.update(
      input.employeeId,
      {
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        salutation: input.salutation === undefined ? undefined : (input.salutation as Salutation | null),
        workEmail: input.workEmail,
        roleTitle: input.roleTitle,
        dateOfBirth:
          input.dateOfBirth === undefined ? undefined : (input.dateOfBirth as IsoDate | null),
        probationEndDate:
          input.probationEndDate === undefined
            ? undefined
            : (input.probationEndDate as IsoDate | null),
        hireDate: input.hireDate === undefined ? undefined : (input.hireDate as IsoDate | null),
        scheduledConfirmationDate:
          input.scheduledConfirmationDate === undefined
            ? undefined
            : (input.scheduledConfirmationDate as IsoDate | null),
        finalConfirmationDate:
          input.finalConfirmationDate === undefined
            ? undefined
            : (input.finalConfirmationDate as IsoDate | null),
        contractEndDate:
          input.contractEndDate === undefined
            ? undefined
            : (input.contractEndDate as IsoDate | null),
        noticePeriodDays: input.noticePeriodDays,
        retirementDate:
          input.retirementDate === undefined
            ? undefined
            : (input.retirementDate as IsoDate | null),
        holidayCalendarId:
          input.holidayCalendarId === undefined
            ? undefined
            : input.holidayCalendarId === null
              ? null
              : toId<HolidayCalendarId>(input.holidayCalendarId),
        workerType:
          input.workerType === undefined ? undefined : (input.workerType as WorkerType | null),
      },
      user ? toId<UserId>(user.id) : null,
    );
    return toEmployeeType(employee);
  }

  /**
   * Sets who an employee reports to. This is the only way to build a hierarchy:
   * reporting lines live on the assignment, and nothing else exposes them.
   * Passing a null manager makes the employee a root of the chart.
   */
  @Mutation(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.assignmentWrite)
  async setEmployeeManager(@Args('input') input: SetEmployeeManagerInput): Promise<EmployeeType> {
    const employeeId = toId<EmployeeId>(input.employeeId);
    const employee = await this.employeeService.getById(employeeId);
    const effectiveDate = input.effectiveDate as IsoDate;

    // An employee with no assignment yet has no position to carry over, so one
    // is derived from their role title rather than failing the change.
    const current = await this.assignmentService.currentPrimary(employeeId, effectiveDate);
    const position = current
      ? null
      : await this.positionService.ensureByTitle(employee.roleTitle ?? 'Unassigned');

    await this.assignmentService.setReportingLine({
      employeeId,
      reportsToEmployeeId: input.reportsToEmployeeId
        ? toId<EmployeeId>(input.reportsToEmployeeId)
        : null,
      effectiveDate,
      positionId: position ? toId<PositionId>(position.id) : null,
    });

    return toEmployeeType(employee);
  }

  @Mutation(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async terminateEmployee(@Args('input') input: TerminateEmployeeInput): Promise<EmployeeType> {
    const employee = await this.employeeService.terminate(
      input.employeeId,
      input.effectiveDate as IsoDate,
      input.reason,
    );
    return toEmployeeType(employee);
  }

  @Mutation(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async separateEmployee(@Args('input') input: SeparateEmployeeInput): Promise<EmployeeType> {
    const user = await this.authService.getCurrentUser().catch(() => null);
    const employee = await this.employeeService.separate({
      employeeId: toId<EmployeeId>(input.employeeId),
      type: input.type as SeparationType,
      effectiveDate: input.effectiveDate as IsoDate,
      reason: input.reason ?? null,
      resignationLetterDate: (input.resignationLetterDate as IsoDate | undefined) ?? null,
      relievingDate: (input.relievingDate as IsoDate | undefined) ?? null,
      reasonForLeaving: input.reasonForLeaving ?? null,
      leaveEncashed: input.leaveEncashed ?? null,
      encashmentDate: (input.encashmentDate as IsoDate | undefined) ?? null,
      heldOn: (input.heldOn as IsoDate | undefined) ?? null,
      newWorkplace: input.newWorkplace ?? null,
      feedback: input.feedback ?? null,
      initiatedByUserId: user ? toId<UserId>(user.id) : null,
    });
    return toEmployeeType(employee);
  }

  @Query(() => EmployeeType)
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myEmployee(): Promise<EmployeeType> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return toEmployeeType(await this.employeeService.getById(user.employeeId));
  }

  // ---- Field resolvers for composed org data (Phase 1) ----

  @ResolveField(() => EmployeeAssignmentView, { nullable: true })
  @RequireAnyPermissions(PERMISSIONS.employeeRead, PERMISSIONS.employeeSelfRead)
  async currentAssignment(@Parent() employee: EmployeeType): Promise<EmployeeAssignmentView | null> {
    const assignments = await this.assignmentService.listForEmployee(toId<EmployeeId>(employee.id));
    if (assignments.length === 0) return null;
    // Current = primary with open ended or latest validFrom, or just most recent
    const sorted = [...assignments].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    const current = sorted.find((a) => a.validTo === null) ?? sorted[0];
    if (!current) return null;
    return this.toAssignmentView(current);
  }

  @ResolveField(() => [EmployeeAssignmentView])
  @RequireAnyPermissions(PERMISSIONS.employeeRead, PERMISSIONS.employeeSelfRead)
  async assignmentHistory(@Parent() employee: EmployeeType): Promise<EmployeeAssignmentView[]> {
    const assignments = await this.assignmentService.listForEmployee(toId<EmployeeId>(employee.id));
    const sorted = [...assignments].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
    return Promise.all(sorted.map((assignment) => this.toAssignmentView(assignment)));
  }

  @Query(() => [EmployeeAssignmentView])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeAssignmentHistory(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeAssignmentView[]> {
    const assignments = await this.assignmentService.listForEmployee(toId<EmployeeId>(employeeId));
    const sorted = [...assignments].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
    return Promise.all(sorted.map((assignment) => this.toAssignmentView(assignment)));
  }

  @Query(() => EmployeeAssignmentView, { nullable: true })
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeCurrentAssignment(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeAssignmentView | null> {
    const assignments = await this.assignmentService.listForEmployee(toId<EmployeeId>(employeeId));
    if (assignments.length === 0) return null;
    const sorted = [...assignments].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    const current = sorted.find((a) => a.validTo === null) ?? sorted[0];
    if (!current) return null;
    return this.toAssignmentView(current);
  }

  private async toAssignmentView(assignment: { id: string; employeeId: string; positionId: string; assignmentType: string; isPrimary: boolean; reportsToEmployeeId: string | null; validFrom: string; validTo: string | null }): Promise<EmployeeAssignmentView> {
    let positionTitle: string | null = null;
    let departmentId: string | null = null;
    let departmentName: string | null = null;
    let locationId: string | null = null;
    let locationName: string | null = null;
    try {
      const position = await this.positionService.getById(assignment.positionId);
      positionTitle = position.title;
      departmentId = position.departmentId;
      locationId = position.locationId;
      const [department, location, reportsToName] = await Promise.all([
        departmentId ? this.departmentService.getById(departmentId) : Promise.resolve(null),
        locationId ? this.locationService.getById(locationId) : Promise.resolve(null),
        assignment.reportsToEmployeeId ? this.directoryService.getDisplayName(toId<EmployeeId>(assignment.reportsToEmployeeId)) : Promise.resolve(null),
      ]);
      departmentName = department?.name ?? null;
      locationName = location?.name ?? null;
      return {
        id: assignment.id,
        employeeId: assignment.employeeId,
        positionId: assignment.positionId,
        positionTitle,
        departmentId,
        departmentName,
        locationId,
        locationName,
        assignmentType: assignment.assignmentType,
        isPrimary: assignment.isPrimary,
        reportsToEmployeeId: assignment.reportsToEmployeeId,
        reportsToName,
        validFrom: assignment.validFrom,
        validTo: assignment.validTo,
      };
    } catch {
      // Position may be missing; leave composed fields null
    }
    let reportsToName: string | null = null;
    if (assignment.reportsToEmployeeId) {
      reportsToName = await this.directoryService.getDisplayName(toId<EmployeeId>(assignment.reportsToEmployeeId));
    }
    return {
      id: assignment.id,
      employeeId: assignment.employeeId,
      positionId: assignment.positionId,
      positionTitle,
      departmentId,
      departmentName,
      locationId,
      locationName,
      assignmentType: assignment.assignmentType,
      isPrimary: assignment.isPrimary,
      reportsToEmployeeId: assignment.reportsToEmployeeId,
      reportsToName,
      validFrom: assignment.validFrom,
      validTo: assignment.validTo,
    };
  }

  // ---- Profile ----

  @Query(() => EmployeeProfileView, { nullable: true })
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeProfile(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<EmployeeProfileView | null> {
    const profile = await this.profileService.getForEmployee(toId<EmployeeId>(employeeId));
    return profile ? toEmployeeProfileView(profile) : null;
  }

  @Query(() => EmployeeProfileView, { nullable: true })
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myEmployeeProfile(): Promise<EmployeeProfileView | null> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    const profile = await this.profileService.getForEmployee(user.employeeId);
    return profile ? toEmployeeProfileView(profile) : null;
  }

  @Mutation(() => EmployeeProfileView)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async updateEmployeePhoto(
    @Args('input') input: UpdateEmployeePhotoInput,
  ): Promise<EmployeeProfileView> {
    const user = await this.authService.getCurrentUser();
    const profile = await this.profileService.updateForEmployee(
      toId<EmployeeId>(input.employeeId),
      toId<UserId>(user.id),
      { photoUrl: input.photoUrl ?? null },
    );
    return toEmployeeProfileView(profile);
  }

  @Mutation(() => EmployeeProfileView)
  @RequirePermissions(PERMISSIONS.employeeSelfWrite)
  async updateMyEmployeeProfile(
    @Args('input') input: UpdateMyProfileInput,
  ): Promise<EmployeeProfileView> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return toEmployeeProfileView(
      await this.profileService.updateForEmployee(user.employeeId, toId<UserId>(user.id), input as never),
    );
  }

  // Employees set their own photo the same way admins do (a data URL from a
  // picked file), separate from the text profile form.
  @Mutation(() => EmployeeProfileView)
  @RequirePermissions(PERMISSIONS.employeeSelfWrite)
  async updateMyEmployeePhoto(
    @Args('input') input: UpdateMyPhotoInput,
  ): Promise<EmployeeProfileView> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return toEmployeeProfileView(
      await this.profileService.updateForEmployee(user.employeeId, toId<UserId>(user.id), {
        photoUrl: input.photoUrl ?? null,
      }),
    );
  }

  // ---- Personal details (Phase 5) ----

  @Query(() => EmployeePersonalDetailsView, { nullable: true })
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeePersonalDetails(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeePersonalDetailsView | null> {
    const details = await this.personalDetailsService.getForEmployee(toId<EmployeeId>(employeeId));
    return details ? toPersonalDetailsView(details) : null;
  }

  @Query(() => EmployeePersonalDetailsView, { nullable: true })
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myEmployeePersonalDetails(): Promise<EmployeePersonalDetailsView | null> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) throw new NotFoundError('No employee record is linked to this account');
    const details = await this.personalDetailsService.getForEmployee(user.employeeId);
    return details ? toPersonalDetailsView(details) : null;
  }

  @Mutation(() => EmployeePersonalDetailsView)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async updateEmployeePersonalDetails(@Args('input') input: UpdatePersonalDetailsInput): Promise<EmployeePersonalDetailsView> {
    const user = await this.authService.getCurrentUser();
    return toPersonalDetailsView(
      await this.personalDetailsService.updateForEmployee(
        toId<EmployeeId>(input.employeeId),
        toId<UserId>(user.id),
        input as never,
      ),
    );
  }

  @Mutation(() => EmployeePersonalDetailsView)
  @RequirePermissions(PERMISSIONS.employeeSelfWrite)
  async updateMyPersonalDetails(@Args('input') input: UpdateMyPersonalDetailsInput): Promise<EmployeePersonalDetailsView> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) throw new NotFoundError('No employee record is linked to this account');
    return toPersonalDetailsView(
      await this.personalDetailsService.updateForEmployee(user.employeeId, toId<UserId>(user.id), input as never),
    );
  }

  // ---- Education (Phase 6) ----

  @Query(() => [EmployeeEducationView])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeEducations(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeEducationView[]> {
    const rows = await this.educationService.listForEmployee(toId<EmployeeId>(employeeId));
    return rows.map(toEducationView);
  }

  @Query(() => [EmployeeEducationView])
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myEducations(): Promise<EmployeeEducationView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) throw new NotFoundError('No employee record is linked to this account');
    const rows = await this.educationService.listForEmployee(user.employeeId);
    return rows.map(toEducationView);
  }

  @Mutation(() => EmployeeEducationView)
  @RequireAnyPermissions(PERMISSIONS.employeeWrite, PERMISSIONS.employeeSelfWrite)
  async createEmployeeEducation(@Args('input') input: CreateEmployeeEducationInput): Promise<EmployeeEducationView> {
    const user = await this.authService.getCurrentUser();
    const access = await this.authorization.getCurrentAccess();
    const hasSelf = access.permissions.includes(PERMISSIONS.employeeSelfWrite);
    const hasWrite = access.permissions.includes(PERMISSIONS.employeeWrite);
    if (!hasSelf && !hasWrite) throw new ForbiddenError();
    let targetEmployeeId: EmployeeId;
    if (hasWrite) {
      targetEmployeeId = toId<EmployeeId>(input.employeeId);
    } else {
      if (!user.employeeId) throw new NotFoundError('No employee record is linked to this account');
      if (input.employeeId !== user.employeeId) throw new ForbiddenError('You can only manage your own education');
      targetEmployeeId = user.employeeId;
    }
    const row = await this.educationService.create({
      employeeId: targetEmployeeId,
      schoolOrUniversity: input.schoolOrUniversity,
      qualification: input.qualification,
      level: input.level as never,
      yearOfPassing: input.yearOfPassing ?? null,
      classOrPercentage: input.classOrPercentage ?? null,
      majorSubjects: input.majorSubjects ?? null,
      createdByUserId: toId<UserId>(user.id),
    });
    return toEducationView(row);
  }

  @Mutation(() => EmployeeEducationView)
  @RequireAnyPermissions(PERMISSIONS.employeeWrite, PERMISSIONS.employeeSelfWrite)
  async updateEmployeeEducation(@Args('input') input: UpdateEmployeeEducationInput): Promise<EmployeeEducationView> {
    const user = await this.authService.getCurrentUser();
    const existing = await this.educationService.getById(input.id);
    if (!existing) throw new NotFoundError('Employee education not found', { id: input.id });
    await this.assertCanWriteEducationOrWorkHistory(existing.employeeId);
    const row = await this.educationService.update(input.id, {
      schoolOrUniversity: input.schoolOrUniversity ?? undefined,
      qualification: input.qualification ?? undefined,
      level: input.level as never ?? undefined,
      yearOfPassing: input.yearOfPassing ?? undefined,
      classOrPercentage: input.classOrPercentage ?? undefined,
      majorSubjects: input.majorSubjects ?? undefined,
    }, toId<UserId>(user.id));
    return toEducationView(row);
  }

  @Mutation(() => Boolean)
  @RequireAnyPermissions(PERMISSIONS.employeeWrite, PERMISSIONS.employeeSelfWrite)
  async deleteEmployeeEducation(@Args('id', { type: () => ID }) id: string): Promise<boolean> {
    const existing = await this.educationService.getById(id);
    if (!existing) throw new NotFoundError('Employee education not found', { id });
    await this.assertCanWriteEducationOrWorkHistory(existing.employeeId);
    await this.educationService.delete(id);
    return true;
  }

  // ---- Work history (Phase 6) ----

  @Query(() => [EmployeeWorkHistoryView])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeWorkHistories(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeWorkHistoryView[]> {
    const rows = await this.workHistoryService.listForEmployee(toId<EmployeeId>(employeeId));
    return rows.map(toWorkHistoryView);
  }

  @Query(() => [EmployeeWorkHistoryView])
  @RequirePermissions(PERMISSIONS.employeeSelfRead)
  async myWorkHistories(): Promise<EmployeeWorkHistoryView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) throw new NotFoundError('No employee record is linked to this account');
    const rows = await this.workHistoryService.listForEmployee(user.employeeId);
    return rows.map(toWorkHistoryView);
  }

  @Mutation(() => EmployeeWorkHistoryView)
  @RequireAnyPermissions(PERMISSIONS.employeeWrite, PERMISSIONS.employeeSelfWrite)
  async createEmployeeWorkHistory(@Args('input') input: CreateEmployeeWorkHistoryInput): Promise<EmployeeWorkHistoryView> {
    const user = await this.authService.getCurrentUser();
    const access = await this.authorization.getCurrentAccess();
    const hasSelf = access.permissions.includes(PERMISSIONS.employeeSelfWrite);
    const hasWrite = access.permissions.includes(PERMISSIONS.employeeWrite);
    if (!hasSelf && !hasWrite) throw new ForbiddenError();
    let targetEmployeeId: EmployeeId;
    if (hasWrite) {
      targetEmployeeId = toId<EmployeeId>(input.employeeId);
    } else {
      if (!user.employeeId) throw new NotFoundError('No employee record is linked to this account');
      if (input.employeeId !== user.employeeId) throw new ForbiddenError('You can only manage your own work history');
      targetEmployeeId = user.employeeId;
    }
    const row = await this.workHistoryService.create({
      employeeId: targetEmployeeId,
      companyName: input.companyName,
      designation: input.designation ?? null,
      salary: input.salary ?? null,
      address: input.address ?? null,
      contact: input.contact ?? null,
      totalExperience: input.totalExperience ?? null,
      createdByUserId: toId<UserId>(user.id),
    });
    return toWorkHistoryView(row);
  }

  @Mutation(() => EmployeeWorkHistoryView)
  @RequireAnyPermissions(PERMISSIONS.employeeWrite, PERMISSIONS.employeeSelfWrite)
  async updateEmployeeWorkHistory(@Args('input') input: UpdateEmployeeWorkHistoryInput): Promise<EmployeeWorkHistoryView> {
    const user = await this.authService.getCurrentUser();
    const existing = await this.workHistoryService.getById(input.id);
    if (!existing) throw new NotFoundError('Employee work history not found', { id: input.id });
    await this.assertCanWriteEducationOrWorkHistory(existing.employeeId);
    const row = await this.workHistoryService.update(input.id, {
      companyName: input.companyName ?? undefined,
      designation: input.designation ?? undefined,
      salary: input.salary ?? undefined,
      address: input.address ?? undefined,
      contact: input.contact ?? undefined,
      totalExperience: input.totalExperience ?? undefined,
    }, toId<UserId>(user.id));
    return toWorkHistoryView(row);
  }

  @Mutation(() => Boolean)
  @RequireAnyPermissions(PERMISSIONS.employeeWrite, PERMISSIONS.employeeSelfWrite)
  async deleteEmployeeWorkHistory(@Args('id', { type: () => ID }) id: string): Promise<boolean> {
    const existing = await this.workHistoryService.getById(id);
    if (!existing) throw new NotFoundError('Employee work history not found', { id });
    await this.assertCanWriteEducationOrWorkHistory(existing.employeeId);
    await this.workHistoryService.delete(id);
    return true;
  }

  // ---- Separation (Phase 3) ----

  @Query(() => [EmployeeSeparationView])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeSeparations(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeSeparationView[]> {
    const rows = await this.separationService.listForEmployee(toId<EmployeeId>(employeeId));
    return rows.map(toSeparationView);
  }

  @Query(() => EmployeeSeparationView, { nullable: true })
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeSeparation(@Args('id', { type: () => ID }) id: string): Promise<EmployeeSeparationView | null> {
    const row = await this.separationService.getById(id);
    return row ? toSeparationView(row) : null;
  }

  // ---- Exit interview (Phase 8) ----

  @Query(() => [EmployeeExitInterviewView])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeExitInterviews(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeExitInterviewView[]> {
    const rows = await this.exitInterviewService.listForEmployee(toId<EmployeeId>(employeeId));
    return rows.map(toExitInterviewView);
  }

  @Mutation(() => EmployeeExitInterviewView)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async upsertExitInterview(@Args('input') input: UpsertExitInterviewInput): Promise<EmployeeExitInterviewView> {
    const user = await this.authService.getCurrentUser();
    const row = await this.exitInterviewService.upsert({
      employeeId: toId<EmployeeId>(input.employeeId),
      separationId: toId<EmployeeSeparationId>(input.separationId),
      status: input.status as never ?? null,
      scheduledDate: input.scheduledDate ?? null,
      interviewerUserIds: input.interviewerUserIds ? input.interviewerUserIds.map((id) => toId<UserId>(id)) : null,
      summary: input.summary ?? null,
      finalDecision: input.finalDecision as never ?? null,
      updatedByUserId: toId<UserId>(user.id),
    });
    return toExitInterviewView(row);
  }

  // ---- Offboarding tasks (Phase 3) ----

  @Query(() => [EmployeeOffboardingTaskView])
  @RequirePermissions(PERMISSIONS.employeeRead)
  async employeeOffboardingTasks(@Args('employeeId', { type: () => ID }) employeeId: string): Promise<EmployeeOffboardingTaskView[]> {
    const rows = await this.offboardingService.listForEmployee(toId<EmployeeId>(employeeId));
    return rows.map(toOffboardingTaskView);
  }

  @Mutation(() => EmployeeOffboardingTaskView)
  @RequirePermissions(PERMISSIONS.employeeWrite)
  async updateOffboardingTask(@Args('input') input: UpdateOffboardingTaskInput): Promise<EmployeeOffboardingTaskView> {
    const user = await this.authService.getCurrentUser();
    const row = await this.offboardingService.updateTask(
      toId<EmployeeId>(input.employeeId),
      input.taskKey as never,
      {
        status: input.status as never,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        updatedByUserId: toId<UserId>(user.id),
      },
    );
    return toOffboardingTaskView(row);
  }
}
