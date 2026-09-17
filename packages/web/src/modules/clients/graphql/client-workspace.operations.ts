import { gql } from '@apollo/client';

export const CLIENT_WORKSPACE_QUERY = gql`
  query ClientWorkspace {
    employees {
      id
      employeeNumber
      firstName
      lastName
      workEmail
      hireDate
      employmentStatus
      workerType
    }
    hiringRequests {
      id
      status
      updatedAt
    }
    salaryStructures {
      id
    }
  }
`;
