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

export const UPDATE_MY_EMPLOYEE_PHOTO_MUTATION = gql`
  mutation UpdateMyEmployeePhoto($input: UpdateMyPhotoInput!) {
    updateMyEmployeePhoto(input: $input) {
      employeeId
      photoUrl
    }
  }
`;

export const MY_SALARY_HISTORY_QUERY = gql`
  query MySalaryHistory {
    mySalaryRevisions {
      id
      validFrom
      validTo
      currency
      annualAmount
      reason
      note
    }
  }
`;

export const MY_BONUS_AWARDS_QUERY = gql`
  query MyBonusAwards {
    myBonusAwards {
      id
      awardDate
      currency
      amount
      reason
    }
  }
`;

export const MY_PAY_ADJUSTMENTS_QUERY = gql`
  query MyPayAdjustments {
    myPayAdjustments {
      id
      amount
      currency
      periodYear
      periodMonth
      kind
      sourceType
    }
  }
`;

export const MY_BANK_DETAILS_QUERY = gql`
  query MyBankDetails {
    myBankDetails {
      bankName
      bankAccountTitle
      bankAccountNumber
      bankIban
    }
    myBankDetailChangeRequests {
      id
      status
      createdAt
      decisionNote
    }
  }
`;

export const REQUEST_MY_BANK_CHANGE_MUTATION = gql`
  mutation RequestMyBankChange($input: RequestBankDetailChangeInput!) {
    requestMyBankDetailChange(input: $input) {
      id
      status
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
