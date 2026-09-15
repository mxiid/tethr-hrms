import { gql } from '@apollo/client';

const EXPENSE_LINE_FIELDS = `
  id
  categoryId
  categoryName
  expenseDate
  description
  amount
  hasReceipt
  receiptFileName
`;

export const EXPENSE_CLAIM_FIELDS = `
  id
  claimNumber
  employeeId
  employeeName
  organizationId
  organizationName
  purpose
  status
  currency
  totalAmount
  billableAmount
  submittedAt
  decidedAt
  decisionNote
  reimbursementMethod
  reimbursedAt
  reimbursementReference
  reimbursementPeriodYear
  reimbursementPeriodMonth
  billedInvoiceId
  createdAt
  lines {
    ${EXPENSE_LINE_FIELDS}
  }
`;

export const EXPENSE_CATEGORIES_QUERY = gql`
  query ExpenseCategories {
    expenseCategories {
      id
      code
      name
      description
      requiresReceipt
      billableToClient
      isActive
    }
  }
`;

export const MY_EXPENSE_CATEGORIES_QUERY = gql`
  query MyExpenseCategories {
    myExpenseCategories {
      id
      code
      name
      description
      requiresReceipt
      billableToClient
      isActive
    }
  }
`;

export const EXPENSE_CLAIMS_QUERY = gql`
  query ExpenseClaims($status: String) {
    expenseClaims(status: $status) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const CLIENT_EXPENSE_CLAIMS_QUERY = gql`
  query ClientExpenseClaims {
    clientExpenseClaims {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const MY_EXPENSE_CLAIMS_QUERY = gql`
  query MyExpenseClaims {
    myExpenseClaims {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const EXPENSE_REIMBURSEMENT_COMPONENTS_QUERY = gql`
  query ExpenseReimbursementComponents {
    payComponents {
      id
      code
      name
      category
    }
  }
`;

export const DECIDE_EXPENSE_CLAIM_MUTATION = gql`
  mutation DecideExpenseClaim(
    $claimId: ID!
    $decision: String!
    $note: String
    $sourceOrganizationId: ID
  ) {
    decideExpenseClaim(
      claimId: $claimId
      decision: $decision
      note: $note
      sourceOrganizationId: $sourceOrganizationId
    ) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const MARK_EXPENSE_CLAIM_REIMBURSED_MUTATION = gql`
  mutation MarkExpenseClaimReimbursed(
    $claimId: ID!
    $method: String!
    $paymentReference: String
    $periodYear: Float
    $periodMonth: Float
    $componentId: ID
    $sourceOrganizationId: ID
  ) {
    markExpenseClaimReimbursed(
      claimId: $claimId
      method: $method
      paymentReference: $paymentReference
      periodYear: $periodYear
      periodMonth: $periodMonth
      componentId: $componentId
      sourceOrganizationId: $sourceOrganizationId
    ) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const BILL_EXPENSE_CLAIM_MUTATION = gql`
  mutation BillExpenseClaimToClient(
    $claimId: ID!
    $serviceYear: Float!
    $serviceMonth: Float!
    $sourceOrganizationId: ID
  ) {
    billExpenseClaimToClient(
      claimId: $claimId
      serviceYear: $serviceYear
      serviceMonth: $serviceMonth
      sourceOrganizationId: $sourceOrganizationId
    ) {
      invoiceId
      addedLines
      claim {
        ${EXPENSE_CLAIM_FIELDS}
      }
    }
  }
`;

// --- Employee self-service ---

export const CREATE_MY_EXPENSE_CLAIM_MUTATION = gql`
  mutation CreateMyExpenseClaim($input: CreateMyExpenseClaimInput!) {
    createMyExpenseClaim(input: $input) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const ADD_MY_EXPENSE_CLAIM_LINE_MUTATION = gql`
  mutation AddMyExpenseClaimLine($claimId: ID!, $input: AddExpenseClaimLineInput!) {
    addMyExpenseClaimLine(claimId: $claimId, input: $input) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const REMOVE_MY_EXPENSE_CLAIM_LINE_MUTATION = gql`
  mutation RemoveMyExpenseClaimLine($lineId: ID!, $claimId: ID!) {
    removeMyExpenseClaimLine(lineId: $lineId, claimId: $claimId) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const SUBMIT_MY_EXPENSE_CLAIM_MUTATION = gql`
  mutation SubmitMyExpenseClaim($claimId: ID!) {
    submitMyExpenseClaim(claimId: $claimId) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const CANCEL_MY_EXPENSE_CLAIM_MUTATION = gql`
  mutation CancelMyExpenseClaim($claimId: ID!) {
    cancelMyExpenseClaim(claimId: $claimId) {
      ${EXPENSE_CLAIM_FIELDS}
    }
  }
`;

export const PREPARE_EXPENSE_RECEIPT_UPLOAD_MUTATION = gql`
  mutation PrepareMyExpenseReceiptUpload($input: PrepareExpenseReceiptUploadInput!) {
    prepareMyExpenseReceiptUpload(input: $input) {
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
