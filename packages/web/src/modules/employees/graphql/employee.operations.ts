import { gql } from '@apollo/client';

const EMPLOYEE_FIELDS = `
  id
  employeeNumber
  firstName
  middleName
  lastName
  salutation
  workEmail
  roleTitle
  dateOfBirth
  hireDate
  probationEndDate
  scheduledConfirmationDate
  finalConfirmationDate
  contractEndDate
  noticePeriodDays
  retirementDate
  holidayCalendarId
  terminationDate
  employmentStatus
  workerType
  currentAssignment {
    id
    positionId
    positionTitle
    departmentId
    departmentName
    locationId
    locationName
    assignmentType
    isPrimary
    reportsToEmployeeId
    reportsToName
    validFrom
    validTo
  }
  assignmentHistory {
    id
    positionId
    positionTitle
    departmentId
    departmentName
    locationId
    locationName
    assignmentType
    isPrimary
    reportsToEmployeeId
    reportsToName
    validFrom
    validTo
  }
`;

const EMPLOYEE_LIST_FIELDS = `
  id
  employeeNumber
  firstName
  middleName
  lastName
  salutation
  workEmail
  roleTitle
  dateOfBirth
  hireDate
  probationEndDate
  scheduledConfirmationDate
  finalConfirmationDate
  contractEndDate
  noticePeriodDays
  retirementDate
  holidayCalendarId
  terminationDate
  employmentStatus
  workerType
  currentAssignment {
    id
    positionId
    positionTitle
    departmentId
    departmentName
    locationId
    locationName
    assignmentType
    isPrimary
    reportsToEmployeeId
    reportsToName
    validFrom
    validTo
  }
`;

export const EMPLOYEES_QUERY = gql`
  query Employees {
    employees {
      ${EMPLOYEE_LIST_FIELDS}
    }
  }
`;

export const CREATE_EMPLOYEE_MUTATION = gql`
  mutation CreateEmployee($input: CreateEmployeeInput!) {
    createEmployee(input: $input) {
      ${EMPLOYEE_FIELDS}
    }
  }
`;

export const UPDATE_EMPLOYEE_PHOTO_MUTATION = gql`
  mutation UpdateEmployeePhoto($input: UpdateEmployeePhotoInput!) {
    updateEmployeePhoto(input: $input) {
      employeeId
      photoUrl
    }
  }
`;

export const EMPLOYEE_DETAIL_QUERY = gql`
  query EmployeeDetail($employeeId: ID!, $asOf: String!) {
    employee(id: $employeeId) {
      ${EMPLOYEE_FIELDS}
    }
    employeeProfile(employeeId: $employeeId) {
      employeeId
      photoUrl
      personalEmail
      phone
      addressLine1
      addressLine2
      city
      region
      countryCode
      postalCode
      permanentAddressLine1
      permanentAddressLine2
      permanentCity
      permanentRegion
      permanentCountryCode
      permanentPostalCode
      currentAccommodationType
      permanentAccommodationType
      preferredContactChannel
      emergencyContactName
      emergencyContactPhone
      emergencyContactRelation
    }
    employeePersonalDetails(employeeId: $employeeId) {
      id
      employeeId
      passportNumber
      passportIssueDate
      passportIssuePlace
      passportValidUpto
      maritalStatus
      bloodGroup
      familyBackground
      healthDetails
      bio
    }
    employeeEducations(employeeId: $employeeId) {
      id
      employeeId
      schoolOrUniversity
      qualification
      level
      yearOfPassing
      classOrPercentage
      majorSubjects
    }
    employeeWorkHistories(employeeId: $employeeId) {
      id
      employeeId
      companyName
      designation
      salary
      address
      contact
      totalExperience
    }
    employeeSeparations(employeeId: $employeeId) {
      id
      employeeId
      type
      resignationLetterDate
      relievingDate
      reasonForLeaving
      leaveEncashed
      encashmentDate
      heldOn
      newWorkplace
      feedback
    }
    employeeExitInterviews(employeeId: $employeeId) {
      id
      employeeId
      separationId
      status
      scheduledDate
      interviewerUserIds
      summary
      finalDecision
    }
    employeeOffboardingTasks(employeeId: $employeeId) {
      id
      employeeId
      separationId
      taskKey
      title
      status
      dueDate
      completedAt
      notes
    }
    currentSalaryRevision(employeeId: $employeeId, asOf: $asOf) {
      id
      salaryStructureId
      currency
      annualAmount
      validFrom
      validTo
      reason
    }
    employeeAssessments(employeeId: $employeeId) {
      id
      title
      assessmentDate
      score
      assessorName
      notes
    }
    employeeDocuments(employeeId: $employeeId) {
      id
      documentId
      category
      visibility
      name
      contentType
      sizeBytes
      classification
      latestStorageKey
      latestVersionNumber
      versionCount
      signatureStatus
      signedAt
      signatureProvider
      externalEnvelopeId
    }
    bonusAwards(employeeId: $employeeId) {
      id
      awardDate
      currency
      amount
      reason
      note
    }
  }
`;

export const EMPLOYEE_SALARY_STRUCTURES_QUERY = gql`
  query EmployeeSalaryStructures {
    salaryStructures {
      id
      name
      code
      currency
      payFrequency
      isActive
    }
  }
`;

export const RECORD_EMPLOYEE_ASSESSMENT_MUTATION = gql`
  mutation RecordEmployeeAssessment($input: RecordEmployeeAssessmentInput!) {
    recordEmployeeAssessment(input: $input) {
      id
      title
      assessmentDate
      score
      assessorName
      notes
    }
  }
`;

export const ATTACH_EMPLOYEE_DOCUMENT_MUTATION = gql`
  mutation AttachEmployeeDocument($input: AttachEmployeeDocumentInput!) {
    attachEmployeeDocument(input: $input) {
      id
      documentId
      category
      visibility
      name
      contentType
      sizeBytes
      classification
      latestStorageKey
      latestVersionNumber
      versionCount
      signatureStatus
      signedAt
      signatureProvider
      externalEnvelopeId
    }
  }
`;

export const ADD_EMPLOYEE_DOCUMENT_VERSION_MUTATION = gql`
  mutation AddEmployeeDocumentVersion($input: AddEmployeeDocumentVersionInput!) {
    addEmployeeDocumentVersion(input: $input) {
      id
      documentId
      category
      visibility
      name
      contentType
      sizeBytes
      classification
      latestStorageKey
      latestVersionNumber
      versionCount
      signatureStatus
      signedAt
      signatureProvider
      externalEnvelopeId
    }
  }
`;

export const PREPARE_EMPLOYEE_DOCUMENT_UPLOAD_MUTATION = gql`
  mutation PrepareEmployeeDocumentUpload($input: PrepareEmployeeDocumentUploadInput!) {
    prepareEmployeeDocumentUpload(input: $input) {
      storageKey
      url
      method
      expiresAt
      headers {
        name
        value
      }
    }
  }
`;

export const EMPLOYEE_DOCUMENT_DOWNLOAD_ACCESS_QUERY = gql`
  query EmployeeDocumentDownloadAccess($employeeDocumentLinkId: ID!) {
    employeeDocumentDownloadAccess(employeeDocumentLinkId: $employeeDocumentLinkId) {
      storageKey
      url
      method
      expiresAt
      headers {
        name
        value
      }
    }
  }
`;

export const REQUEST_EMPLOYEE_DOCUMENT_SIGNATURE_MUTATION = gql`
  mutation RequestEmployeeDocumentSignature($input: RequestEmployeeDocumentSignatureInput!) {
    requestEmployeeDocumentSignature(input: $input) {
      employeeDocumentLinkId
      documentId
      signingUrl
      externalEnvelopeId
      signatureProvider
      signatureStatus
      expiresAt
    }
  }
`;

export const AWARD_BONUS_MUTATION = gql`
  mutation AwardBonus($input: AwardBonusInput!) {
    awardBonus(input: $input) {
      id
      awardDate
      currency
      amount
      reason
      note
    }
  }
`;

export const REVISE_EMPLOYEE_SALARY_MUTATION = gql`
  mutation ReviseEmployeeSalary($input: ReviseSalaryInput!) {
    reviseSalary(input: $input) {
      id
      employeeId
      salaryStructureId
      validFrom
      validTo
      currency
      annualAmount
      reason
      approvedByUserId
      note
    }
  }
`;

export const EMPLOYEE_HR_RECORD_QUERY = gql`
  query EmployeeHrRecord($employeeId: ID!) {
    employeeHrRecord(employeeId: $employeeId) {
      id
      employeeId
      roleTitle
      salaryBreakdown
      paymentMode
      bankName
      bankAccountTitle
      bankAccountNumber
      bankIban
      hardwareInfo
      employeeRecordForm
    }
  }
`;

export const EMPLOYEE_ONBOARDING_TASKS_QUERY = gql`
  query EmployeeOnboardingTasks($employeeId: ID!) {
    employeeOnboardingTasks(employeeId: $employeeId) {
      id
      employeeId
      taskKey
      title
      status
      dueDate
      completedAt
      notes
    }
  }
`;

export const UPDATE_EMPLOYEE_HR_RECORD_MUTATION = gql`
  mutation UpdateEmployeeHrRecord($input: UpdateEmployeeHrRecordInput!) {
    updateEmployeeHrRecord(input: $input) {
      id
      employeeId
      roleTitle
      salaryBreakdown
      paymentMode
      bankName
      bankAccountTitle
      bankAccountNumber
      bankIban
      hardwareInfo
      employeeRecordForm
    }
  }
`;

export const UPDATE_EMPLOYEE_ONBOARDING_TASK_MUTATION = gql`
  mutation UpdateEmployeeOnboardingTask($input: UpdateEmployeeOnboardingTaskInput!) {
    updateEmployeeOnboardingTask(input: $input) {
      id
      employeeId
      taskKey
      title
      status
      dueDate
      completedAt
      notes
    }
  }
`;

export const UPDATE_EMPLOYEE_MUTATION = gql`
  mutation UpdateEmployee($input: UpdateEmployeeInput!) {
    updateEmployee(input: $input) {
      ${EMPLOYEE_FIELDS}
    }
  }
`;

export const SEPARATE_EMPLOYEE_MUTATION = gql`
  mutation SeparateEmployee($input: SeparateEmployeeInput!) {
    separateEmployee(input: $input) {
      ${EMPLOYEE_FIELDS}
    }
  }
`;

export const CREATE_WORKSPACE_USER_MUTATION = gql`
  mutation CreateWorkspaceUser($input: CreateWorkspaceUserInput!) {
    createWorkspaceUser(input: $input) {
      id
      email
      employeeId
    }
  }
`;

export const UPDATE_EMPLOYEE_PERSONAL_DETAILS_MUTATION = gql`
  mutation UpdateEmployeePersonalDetails($input: UpdatePersonalDetailsInput!) {
    updateEmployeePersonalDetails(input: $input) {
      id
      employeeId
      passportNumber
      maritalStatus
      bloodGroup
      bio
    }
  }
`;

export const CREATE_EMPLOYEE_EDUCATION_MUTATION = gql`
  mutation CreateEmployeeEducation($input: CreateEmployeeEducationInput!) {
    createEmployeeEducation(input: $input) {
      id
      employeeId
      schoolOrUniversity
      qualification
      level
      yearOfPassing
      classOrPercentage
      majorSubjects
    }
  }
`;

export const UPDATE_EMPLOYEE_EDUCATION_MUTATION = gql`
  mutation UpdateEmployeeEducation($input: UpdateEmployeeEducationInput!) {
    updateEmployeeEducation(input: $input) {
      id
      employeeId
      schoolOrUniversity
      qualification
      level
      yearOfPassing
      classOrPercentage
      majorSubjects
    }
  }
`;

export const DELETE_EMPLOYEE_EDUCATION_MUTATION = gql`
  mutation DeleteEmployeeEducation($id: ID!) {
    deleteEmployeeEducation(id: $id)
  }
`;

export const CREATE_EMPLOYEE_WORK_HISTORY_MUTATION = gql`
  mutation CreateEmployeeWorkHistory($input: CreateEmployeeWorkHistoryInput!) {
    createEmployeeWorkHistory(input: $input) {
      id
      employeeId
      companyName
      designation
      salary
      address
      contact
      totalExperience
    }
  }
`;

export const UPDATE_EMPLOYEE_WORK_HISTORY_MUTATION = gql`
  mutation UpdateEmployeeWorkHistory($input: UpdateEmployeeWorkHistoryInput!) {
    updateEmployeeWorkHistory(input: $input) {
      id
      employeeId
      companyName
      designation
      salary
      address
      contact
      totalExperience
    }
  }
`;

export const DELETE_EMPLOYEE_WORK_HISTORY_MUTATION = gql`
  mutation DeleteEmployeeWorkHistory($id: ID!) {
    deleteEmployeeWorkHistory(id: $id)
  }
`;

export const UPSERT_EXIT_INTERVIEW_MUTATION = gql`
  mutation UpsertExitInterview($input: UpsertExitInterviewInput!) {
    upsertExitInterview(input: $input) {
      id
      employeeId
      separationId
      status
      scheduledDate
      interviewerUserIds
      summary
      finalDecision
    }
  }
`;

export const UPDATE_OFFBOARDING_TASK_MUTATION = gql`
  mutation UpdateOffboardingTask($input: UpdateOffboardingTaskInput!) {
    updateOffboardingTask(input: $input) {
      id
      employeeId
      taskKey
      title
      status
      dueDate
      completedAt
      notes
    }
  }
`;

export const EMPLOYEE_ASSIGNMENT_HISTORY_QUERY = gql`
  query EmployeeAssignmentHistory($employeeId: ID!) {
    employeeAssignmentHistory(employeeId: $employeeId) {
      id
      positionTitle
      departmentName
      locationName
      reportsToName
      validFrom
      validTo
      assignmentType
    }
  }
`;

export const SET_EMPLOYEE_MANAGER_MUTATION = gql`
  mutation SetEmployeeManager($input: SetEmployeeManagerInput!) {
    setEmployeeManager(input: $input) {
      id
    }
  }
`;

export const EMPLOYEE_BANK_CHANGE_REQUESTS_QUERY = gql`
  query EmployeeBankChangeRequests($employeeId: ID) {
    bankDetailChangeRequests(employeeId: $employeeId) {
      id
      employeeId
      bankName
      bankAccountTitle
      bankAccountNumber
      bankIban
      status
      createdAt
      decidedAt
      decisionNote
    }
  }
`;

export const DECIDE_BANK_CHANGE_MUTATION = gql`
  mutation DecideBankChange($input: DecideBankDetailChangeInput!) {
    decideBankDetailChange(input: $input) {
      id
      status
    }
  }
`;
