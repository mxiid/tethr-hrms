import { gql } from '@apollo/client';

const HIRING_REQUEST_FIELDS = gql`
  fragment HiringRequestFields on HiringRequest {
    id
    positionTitle
    jobDescription
    headcount
    employmentType
    location
    preferredStartDate
    targetFillDate
    salaryMin
    salaryMax
    salaryCurrency
    hiringManagerEmployeeId
    reportsToEmployeeId
    priority
    positionId
    clientNote
    tethrNote
    status
    createdAt
    updatedAt
    updates {
      id
      hiringRequestId
      status
      actor
      note
      createdByUserId
      createdAt
    }
  }
`;

export const HIRING_REQUESTS_QUERY = gql`
  ${HIRING_REQUEST_FIELDS}
  query HiringRequests {
    hiringRequests {
      ...HiringRequestFields
    }
  }
`;

// The platform board: every client workspace plus Tethr's own. Only operators
// with platform:read-all can call it.
export const CLIENT_HIRING_REQUESTS_QUERY = gql`
  ${HIRING_REQUEST_FIELDS}
  query ClientHiringRequests {
    clientHiringRequests {
      ...HiringRequestFields
      organizationId
      organizationName
    }
  }
`;

// Module-local employee options for the briefing fields; the recruitment module
// does not import the employee module's operations.
export const RECRUITMENT_EMPLOYEE_OPTIONS_QUERY = gql`
  query RecruitmentEmployeeOptions {
    employees {
      id
      firstName
      lastName
      roleTitle
    }
  }
`;

export const CREATE_HIRING_REQUEST_MUTATION = gql`
  mutation CreateHiringRequest($input: CreateHiringRequestInput!) {
    createHiringRequest(input: $input) {
      id
      status
    }
  }
`;

export const UPDATE_HIRING_REQUEST_MUTATION = gql`
  mutation UpdateHiringRequest($input: UpdateHiringRequestInput!) {
    updateHiringRequest(input: $input) {
      id
      status
      tethrNote
      updatedAt
    }
  }
`;
