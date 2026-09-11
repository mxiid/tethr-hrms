import { gql } from '@apollo/client';

const RUN_LINE_COMPONENT_FIELDS = `
  id
  componentCode
  componentName
  category
  taxable
  amount
`;

const RUN_LINE_FIELDS = `
  id
  runId
  employeeId
  displayName
  payableDays
  lopDays
  grossAmount
  taxOverrideAmount
  note
  totalEarnings
  taxableAmount
  incomeTax
  netPayAmount
  components {
    ${RUN_LINE_COMPONENT_FIELDS}
  }
`;

const RUN_FIELDS = `
  id
  periodYear
  periodMonth
  status
  currency
  standardWorkingDays
  holidayCalendarId
  finalizedAt
`;

export const PAYROLL_RUNS_QUERY = gql`
  query PayrollRuns {
    payrollRuns {
      ${RUN_FIELDS}
    }
  }
`;

export const PAYROLL_RUN_QUERY = gql`
  query PayrollRun($runId: ID!) {
    payrollRun(runId: $runId) {
      ${RUN_FIELDS}
      lines {
        ${RUN_LINE_FIELDS}
      }
    }
  }
`;

export const CREATE_PAYROLL_RUN_MUTATION = gql`
  mutation CreatePayrollRun($input: CreatePayrollRunInput!) {
    createPayrollRun(input: $input) {
      ${RUN_FIELDS}
      lines {
        ${RUN_LINE_FIELDS}
      }
    }
  }
`;

export const REGENERATE_PAYROLL_RUN_MUTATION = gql`
  mutation RegeneratePayrollRun($runId: ID!) {
    regeneratePayrollRun(runId: $runId) {
      ${RUN_FIELDS}
      lines {
        ${RUN_LINE_FIELDS}
      }
    }
  }
`;

export const UPDATE_PAYROLL_RUN_LINE_MUTATION = gql`
  mutation UpdatePayrollRunLine($input: UpdatePayrollRunLineInput!) {
    updatePayrollRunLine(input: $input) {
      ${RUN_FIELDS}
      lines {
        ${RUN_LINE_FIELDS}
      }
    }
  }
`;

export const REMOVE_PAYROLL_RUN_LINE_MUTATION = gql`
  mutation RemovePayrollRunLine($lineId: ID!, $runId: ID!) {
    removePayrollRunLine(lineId: $lineId, runId: $runId) {
      ${RUN_FIELDS}
      lines {
        ${RUN_LINE_FIELDS}
      }
    }
  }
`;

export const FINALIZE_PAYROLL_RUN_MUTATION = gql`
  mutation FinalizePayrollRun($runId: ID!, $payDate: String) {
    finalizePayrollRun(runId: $runId, payDate: $payDate) {
      ${RUN_FIELDS}
      lines {
        ${RUN_LINE_FIELDS}
      }
    }
  }
`;

export const BANK_ADVICE_CSV_QUERY = gql`
  query BankAdviceCsv($runId: ID!) {
    bankAdviceCsv(runId: $runId)
  }
`;

export const RUN_PAYSLIPS_QUERY = gql`
  query RunPayslips($runId: ID!) {
    runPayslips(runId: $runId) {
      id
      payslipNumber
      employeeNumber
      employeeName
      periodYear
      periodMonth
      payDate
      currency
      paidDays
      lopDays
      grossAmount
      taxableAmount
      incomeTaxAmount
      netPayAmount
      notes
    }
  }
`;

export const TAX_SLAB_GROUPS_QUERY = gql`
  query TaxSlabGroups {
    taxSlabGroups {
      id
      name
      financialYearLabel
      currency
      isActive
    }
  }
`;

export const TAX_SLAB_GROUP_QUERY = gql`
  query TaxSlabGroup($groupId: ID!) {
    taxSlabGroup(groupId: $groupId) {
      id
      name
      financialYearLabel
      currency
      isActive
      slabs {
        id
        groupId
        sortOrder
        upperBound
        ratePercent
        flatAdditive
      }
    }
  }
`;

export const CREATE_TAX_SLAB_GROUP_MUTATION = gql`
  mutation CreateTaxSlabGroup($input: CreateTaxSlabGroupInput!) {
    createTaxSlabGroup(input: $input) {
      id
      name
      financialYearLabel
      currency
      isActive
    }
  }
`;

export const REPLACE_TAX_SLABS_MUTATION = gql`
  mutation ReplaceTaxSlabs($groupId: ID!, $slabs: [TaxSlabEntryInput!]!) {
    replaceTaxSlabs(groupId: $groupId, slabs: $slabs) {
      id
      groupId
      sortOrder
      upperBound
      ratePercent
      flatAdditive
    }
  }
`;

export const ACTIVATE_TAX_SLAB_GROUP_MUTATION = gql`
  mutation ActivateTaxSlabGroup($groupId: ID!) {
    activateTaxSlabGroup(groupId: $groupId) {
      id
      name
      isActive
    }
  }
`;

export const MY_PAYSLIPS_QUERY = gql`
  query MyPayslips {
    myPayslips {
      id
      payslipNumber
      periodYear
      periodMonth
      payDate
      currency
      paidDays
      lopDays
      grossAmount
      incomeTaxAmount
      netPayAmount
    }
  }
`;

export const PAYSLIP_PDF_QUERY = gql`
  query PayslipPdf($payslipId: ID!) {
    payslipPdf(payslipId: $payslipId)
  }
`;

export const MY_PAYSLIP_PDF_QUERY = gql`
  query MyPayslipPdf($payslipId: ID!) {
    myPayslipPdf(payslipId: $payslipId)
  }
`;
