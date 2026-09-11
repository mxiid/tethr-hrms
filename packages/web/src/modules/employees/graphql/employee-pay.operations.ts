import { gql } from '@apollo/client';

// Finance reads the employee record hub needs, kept together so the hub is one
// import. Each is gated on the caller's finance permissions and skipped when the
// role can't read it.

export const EMPLOYEE_SALARY_HISTORY_QUERY = gql`
  query EmployeeSalaryHistory($employeeId: ID!) {
    salaryRevisions(employeeId: $employeeId) {
      id
      salaryStructureId
      validFrom
      validTo
      currency
      annualAmount
      reason
      note
    }
  }
`;

export const EMPLOYEE_PAYSLIPS_QUERY = gql`
  query EmployeePayslips($employeeId: ID!) {
    employeePayslips(employeeId: $employeeId) {
      id
      runId
      payslipNumber
      periodYear
      periodMonth
      payDate
      currency
      paidDays
      standardWorkingDays
      lopDays
      grossAmount
      incomeTaxAmount
      netPayAmount
    }
  }
`;

export const EMPLOYEE_ADJUSTMENTS_QUERY = gql`
  query EmployeePayAdjustments($employeeId: ID!) {
    payAdjustments(employeeId: $employeeId) {
      id
      componentId
      amount
      currency
      periodYear
      periodMonth
      kind
      sourceType
      sourceId
      note
    }
  }
`;

export const EMPLOYEE_BONUS_AWARDS_QUERY = gql`
  query EmployeeBonusAwards($employeeId: ID!) {
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

export const EMPLOYEE_BILLING_MEMBER_QUERY = gql`
  query EmployeeBillingMember {
    billingMembers {
      employeeId
      groupId
      groupName
      monthlyRate
      rateCurrency
    }
  }
`;

export const FX_RATE_QUERY = gql`
  query FxRate($baseCurrency: String!, $quoteCurrency: String!, $asOf: String!) {
    exchangeRate(baseCurrency: $baseCurrency, quoteCurrency: $quoteCurrency, asOf: $asOf)
  }
`;
