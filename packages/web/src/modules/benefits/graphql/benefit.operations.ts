import { gql } from '@apollo/client';

const BENEFIT_PLAN_FIELDS = `
  id
  code
  name
  description
  employeeContributionAmount
  employerContributionAmount
  reducesTaxable
  isActive
`;

const BENEFIT_ENROLLMENT_FIELDS = `
  id
  employeeId
  planId
  planCode
  planName
  employeeContributionAmount
  employerContributionAmount
  reducesTaxable
  validFrom
  validTo
  note
`;

export const BENEFIT_PLANS_QUERY = gql`
  query BenefitPlans {
    benefitPlans {
      ${BENEFIT_PLAN_FIELDS}
    }
  }
`;

export const CREATE_BENEFIT_PLAN_MUTATION = gql`
  mutation CreateBenefitPlan($input: CreateBenefitPlanInput!) {
    createBenefitPlan(input: $input) {
      ${BENEFIT_PLAN_FIELDS}
    }
  }
`;

export const UPDATE_BENEFIT_PLAN_MUTATION = gql`
  mutation UpdateBenefitPlan($input: UpdateBenefitPlanInput!) {
    updateBenefitPlan(input: $input) {
      ${BENEFIT_PLAN_FIELDS}
    }
  }
`;

export const BENEFIT_ENROLLMENTS_QUERY = gql`
  query BenefitEnrollments($employeeId: ID!) {
    benefitEnrollments(employeeId: $employeeId) {
      ${BENEFIT_ENROLLMENT_FIELDS}
    }
  }
`;

export const SET_BENEFIT_ENROLLMENT_MUTATION = gql`
  mutation SetBenefitEnrollment($input: SetBenefitEnrollmentInput!) {
    setBenefitEnrollment(input: $input) {
      ${BENEFIT_ENROLLMENT_FIELDS}
    }
  }
`;

export const END_BENEFIT_ENROLLMENT_MUTATION = gql`
  mutation EndBenefitEnrollment($employeeId: ID!, $planId: ID!, $endDate: String) {
    endBenefitEnrollment(employeeId: $employeeId, planId: $planId, endDate: $endDate)
  }
`;
