import { gql } from '@apollo/client';

const INVOICE_LINE_FIELDS = `
  id
  invoiceId
  kind
  employeeId
  employeeName
  monthLabel
  description
  quantity
  unitPrice
  total
`;

const INVOICE_FIELDS = `
  id
  groupId
  groupName
  type
  status
  serviceYear
  serviceMonth
  periodStart
  periodEndExclusive
  number
  issueDate
  dueDate
  currency
  receiverName
  subTotal
  totalAmount
  paidAt
  paymentReference
`;

export const BILLING_PAGE_DATA_QUERY = gql`
  query BillingPageData {
    billingConfig {
      id
      feeAmount
      feeCurrency
      paymentTermsNetDays
      anchorDay
      receiverName
      receiverEmail
    }
    billingGroups {
      id
      name
      servicesPrefix
      expensesPrefix
      memberCount
    }
    billingMembers {
      id
      employeeId
      displayName
      groupId
      groupName
      monthlyRate
      rateCurrency
    }
    invoices {
      ${INVOICE_FIELDS}
    }
    employees {
      id
      employeeNumber
      firstName
      lastName
    }
  }
`;

export const INVOICE_DETAIL_QUERY = gql`
  query InvoiceDetail($invoiceId: ID!) {
    invoice(invoiceId: $invoiceId) {
      ${INVOICE_FIELDS}
      lines {
        ${INVOICE_LINE_FIELDS}
      }
    }
  }
`;

export const UPDATE_BILLING_CONFIG_MUTATION = gql`
  mutation UpdateBillingConfig($input: UpdateBillingConfigInput!) {
    updateBillingConfig(input: $input) {
      id
      feeAmount
      paymentTermsNetDays
      anchorDay
    }
  }
`;

export const CREATE_BILLING_GROUP_MUTATION = gql`
  mutation CreateBillingGroup($input: CreateBillingGroupInput!) {
    createBillingGroup(input: $input) {
      id
      name
      servicesPrefix
      expensesPrefix
    }
  }
`;

export const SET_BILLING_MEMBER_MUTATION = gql`
  mutation SetBillingMember($input: SetBillingMemberInput!) {
    setBillingMember(input: $input) {
      id
      employeeId
      displayName
      groupName
      monthlyRate
    }
  }
`;

export const REMOVE_BILLING_MEMBER_MUTATION = gql`
  mutation RemoveBillingMember($employeeId: ID!) {
    removeBillingMember(employeeId: $employeeId)
  }
`;

export const OPEN_EXPENSES_INVOICE_MUTATION = gql`
  mutation OpenExpensesInvoice($groupId: ID!, $serviceYear: Float!, $serviceMonth: Float!) {
    openExpensesInvoice(groupId: $groupId, serviceYear: $serviceYear, serviceMonth: $serviceMonth) {
      id
    }
  }
`;

export const ADD_INVOICE_LINE_MUTATION = gql`
  mutation AddInvoiceLine($input: AddInvoiceLineInput!) {
    addInvoiceLine(input: $input) {
      id
      status
      totalAmount
    }
  }
`;

export const UPDATE_INVOICE_LINE_MUTATION = gql`
  mutation UpdateInvoiceLine($input: UpdateInvoiceLineInput!) {
    updateInvoiceLine(input: $input) {
      id
      totalAmount
    }
  }
`;

export const REMOVE_INVOICE_LINE_MUTATION = gql`
  mutation RemoveInvoiceLine($lineId: ID!, $invoiceId: ID!) {
    removeInvoiceLine(lineId: $lineId, invoiceId: $invoiceId) {
      id
      totalAmount
    }
  }
`;

export const ISSUE_INVOICE_MUTATION = gql`
  mutation IssueInvoice($invoiceId: ID!) {
    issueInvoice(invoiceId: $invoiceId) {
      id
      status
      number
      issueDate
      dueDate
    }
  }
`;

export const MARK_INVOICE_PAID_MUTATION = gql`
  mutation MarkInvoicePaid($invoiceId: ID!, $paymentReference: String) {
    markInvoicePaid(invoiceId: $invoiceId, paymentReference: $paymentReference) {
      id
      status
      paidAt
      paymentReference
    }
  }
`;

export const INVOICE_PDF_QUERY = gql`
  query InvoicePdf($invoiceId: ID!) {
    invoicePdf(invoiceId: $invoiceId)
  }
`;

export const CLIENT_INVOICE_PDF_QUERY = gql`
  query ClientInvoicePdf($invoiceId: ID!) {
    clientInvoicePdf(invoiceId: $invoiceId)
  }
`;

export const CLIENT_INVOICES_QUERY = gql`
  query ClientInvoices {
    clientInvoices {
      id
      groupName
      type
      status
      serviceYear
      serviceMonth
      number
      issueDate
      dueDate
      currency
      totalAmount
    }
  }
`;

export const INVOICE_ADDENDUM_PDF_QUERY = gql`
  query InvoiceAddendumPdf($invoiceId: ID!) {
    invoiceAddendumPdf(invoiceId: $invoiceId)
  }
`;

export const CLIENT_INVOICE_ADDENDUM_PDF_QUERY = gql`
  query ClientInvoiceAddendumPdf($invoiceId: ID!) {
    clientInvoiceAddendumPdf(invoiceId: $invoiceId)
  }
`;
