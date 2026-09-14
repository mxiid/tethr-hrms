import { gql } from '@apollo/client';

export const TIME_ENTRIES_QUERY = gql`
  query TimeEntries($employeeId: ID!, $from: String!, $to: String!) {
    timeEntries(employeeId: $employeeId, from: $from, to: $to) {
      id
      employeeId
      date
      hours
      source
    }
  }
`;

export const TIMESHEETS_QUERY = gql`
  query Timesheets($employeeId: ID!) {
    timesheets(employeeId: $employeeId) {
      id
      employeeId
      periodStart
      periodEnd
      status
      totalHours
    }
  }
`;

export const MY_TIME_ENTRIES_QUERY = gql`
  query MyTimeEntries($from: String!, $to: String!) {
    myTimeEntries(from: $from, to: $to) {
      id
      employeeId
      date
      hours
      source
    }
  }
`;

export const RECORD_TIME_ENTRY_MUTATION = gql`
  mutation RecordTimeEntry($input: RecordTimeEntryInput!) {
    recordTimeEntry(input: $input) {
      id
      employeeId
      date
      hours
      source
    }
  }
`;

export const OPEN_TIMESHEET_MUTATION = gql`
  mutation OpenTimesheet($input: OpenTimesheetInput!) {
    openTimesheet(input: $input) {
      id
      periodStart
      periodEnd
      status
      totalHours
    }
  }
`;

export const SUBMIT_TIMESHEET_MUTATION = gql`
  mutation SubmitTimesheet($timesheetId: ID!) {
    submitTimesheet(timesheetId: $timesheetId) {
      id
      status
      totalHours
    }
  }
`;

export const APPROVE_TIMESHEET_MUTATION = gql`
  mutation ApproveTimesheet($timesheetId: ID!) {
    approveTimesheet(timesheetId: $timesheetId) {
      id
      status
      totalHours
    }
  }
`;

export const LOCK_TIMESHEET_MUTATION = gql`
  mutation LockTimesheet($timesheetId: ID!) {
    lockTimesheet(timesheetId: $timesheetId) {
      id
      status
      totalHours
    }
  }
`;

export const CLOCK_IN_ME_MUTATION = gql`
  mutation ClockInMe {
    clockInMe {
      id
      employeeId
      type
      occurredAt
      source
    }
  }
`;

export const CLOCK_OUT_ME_MUTATION = gql`
  mutation ClockOutMe {
    clockOutMe {
      id
      employeeId
      date
      hours
      source
    }
  }
`;
