import { gql } from '@apollo/client';

const PAY_COMPONENT_FIELDS = `
  id
  name
  code
  category
  taxable
  recurring
`;

const SALARY_STRUCTURE_FIELDS = `
  id
  name
  code
  gradeId
  currency
  payFrequency
  isActive
`;

const SALARY_REVISION_FIELDS = `
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
`;

const COMPENSATION_EMPLOYEE_FIELDS = `
  id
  employeeNumber
  firstName
  lastName
  workEmail
`;

export const COMPENSATION_SETUP_QUERY = gql`
  query CompensationSetup {
    payComponents {
      ${PAY_COMPONENT_FIELDS}
    }
    salaryStructures {
      ${SALARY_STRUCTURE_FIELDS}
    }
    employees {
      ${COMPENSATION_EMPLOYEE_FIELDS}
    }
  }
`;

export const SALARY_REVISIONS_QUERY = gql`
  query SalaryRevisions($employeeId: ID!) {
    salaryRevisions(employeeId: $employeeId) {
      ${SALARY_REVISION_FIELDS}
    }
  }
`;

export const CREATE_PAY_COMPONENT_MUTATION = gql`
  mutation CreatePayComponent($input: CreatePayComponentInput!) {
    createPayComponent(input: $input) {
      ${PAY_COMPONENT_FIELDS}
    }
  }
`;

export const CREATE_SALARY_STRUCTURE_MUTATION = gql`
  mutation CreateSalaryStructure($input: CreateSalaryStructureInput!) {
    createSalaryStructure(input: $input) {
      ${SALARY_STRUCTURE_FIELDS}
    }
  }
`;

export const REVISE_SALARY_MUTATION = gql`
  mutation ReviseSalary($input: ReviseSalaryInput!) {
    reviseSalary(input: $input) {
      ${SALARY_REVISION_FIELDS}
    }
  }
`;
