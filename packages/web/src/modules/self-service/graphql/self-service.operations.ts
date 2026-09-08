import { gql } from '@apollo/client';

export const MY_WORKSPACE_QUERY = gql`
  query MyWorkspace($asOf: String!, $from: String!, $to: String!) {
    myEmployee {
      id
      employeeNumber
      firstName
      middleName
      lastName
      salutation
      workEmail
      dateOfBirth
      hireDate
      probationEndDate
      scheduledConfirmationDate
      finalConfirmationDate
      contractEndDate
      noticePeriodDays
      retirementDate
      holidayCalendarId
      employmentStatus
      workerType
      currentAssignment {
        positionTitle
        departmentName
        locationName
        reportsToName
        validFrom
        validTo
      }
      assignmentHistory {
        positionTitle
        departmentName
        locationName
        reportsToName
        validFrom
        validTo
      }
    }
    myEmployeeProfile {
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
    myEmployeePersonalDetails {
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
    myEducations {
      id
      schoolOrUniversity
      qualification
      level
      yearOfPassing
      classOrPercentage
      majorSubjects
    }
    myWorkHistories {
      id
      companyName
      designation
      salary
      address
      contact
      totalExperience
    }
    leaveTypes {
      id
      name
      code
      unit
      paid
      requiresApproval
      defaultAnnualEntitlement
    }
    myLeaveBalances {
      id
      leaveTypeId
      periodYear
      entitledDays
      usedDays
      pendingDays
      availableDays
    }
    myLeaveRequests {
      id
      leaveTypeId
      startDate
      endDate
      dayCount
      status
      reason
      submittedAt
      decidedAt
      decisionNote
    }
    upcomingHolidays(from: $from, to: $to) {
      id
      date
      name
    }
    myCurrentSalaryRevision(asOf: $asOf) {
      id
      currency
      annualAmount
      validFrom
      validTo
      reason
    }
  }
`;

export const SUBMIT_MY_LEAVE_REQUEST_MUTATION = gql`
  mutation SubmitMyLeaveRequest($input: SubmitMyLeaveRequestInput!) {
    submitMyLeaveRequest(input: $input) {
      id
      leaveTypeId
      startDate
      endDate
      dayCount
      status
      reason
      submittedAt
      decidedAt
      decisionNote
    }
  }
`;

export const UPDATE_MY_EMPLOYEE_PROFILE_MUTATION = gql`
  mutation UpdateMyEmployeeProfile($input: UpdateMyProfileInput!) {
    updateMyEmployeeProfile(input: $input) {
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
  }
`;

export const UPDATE_MY_PERSONAL_DETAILS_MUTATION = gql`
  mutation UpdateMyPersonalDetails($input: UpdateMyPersonalDetailsInput!) {
    updateMyPersonalDetails(input: $input) {
      id
      employeeId
      passportNumber
      maritalStatus
      bloodGroup
      bio
    }
  }
`;

export const CREATE_MY_EDUCATION_MUTATION = gql`
  mutation CreateEmployeeEducation($input: CreateEmployeeEducationInput!) {
    createEmployeeEducation(input: $input) {
      id
      schoolOrUniversity
      qualification
      level
      yearOfPassing
    }
  }
`;

export const CREATE_MY_WORK_HISTORY_MUTATION = gql`
  mutation CreateEmployeeWorkHistory($input: CreateEmployeeWorkHistoryInput!) {
    createEmployeeWorkHistory(input: $input) {
      id
      companyName
      designation
      totalExperience
    }
  }
`;

export const UPDATE_MY_EMPLOYEE_PHOTO_MUTATION = gql`
  mutation UpdateMyEmployeePhoto($input: UpdateMyPhotoInput!) {
    updateMyEmployeePhoto(input: $input) {
      employeeId
      photoUrl
    }
  }
`;

// Just the employee identity plus the editable profile — the profile page has no
// use for leave balances, payslips, or holidays, so it does not pull them.
export const MY_PROFILE_QUERY = gql`
  query MyProfile($asOf: String!) {
    myEmployee {
      id
      employeeNumber
      firstName
      lastName
      workEmail
      employmentStatus
      workerType
      hireDate
      probationEndDate
      currentAssignment {
        departmentName
        positionTitle
      }
    }
    myCurrentSalaryRevision(asOf: $asOf) {
      id
      currency
      annualAmount
      validFrom
    }
    myEmployeeProfile {
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
  }
`;
