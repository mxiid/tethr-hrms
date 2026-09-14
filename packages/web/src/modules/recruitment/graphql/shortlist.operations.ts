import { gql } from '@apollo/client';

export const POSTING_APPLICATIONS_QUERY = gql`
  query PostingApplications($jobPostingId: ID!) {
    postingApplications(jobPostingId: $jobPostingId) {
      id
      candidateName
      currentTitle
      manualRating
      expectedSalary
      salaryCurrency
      yearsExperience
      createdAt
    }
  }
`;

export const SHORTLISTS_QUERY = gql`
  query Shortlists($jobPostingId: ID!) {
    shortlists(jobPostingId: $jobPostingId) {
      id
      jobPostingId
      jobPostingTitle
      roundNumber
      status
      presentedAt
      closedAt
      createdAt
      entries {
        id
        applicationId
        candidateId
        candidateName
        candidateEmail
        currentTitle
        manualRating
        rank
        clientDecision
        clientNote
        hasResume
      }
    }
  }
`;

export const CREATE_SHORTLIST_MUTATION = gql`
  mutation CreateShortlist($input: CreateShortlistInput!) {
    createShortlist(input: $input) {
      id
      jobPostingId
      roundNumber
      status
    }
  }
`;

export const PRESENT_SHORTLIST_MUTATION = gql`
  mutation PresentShortlist($input: ShortlistIdInput!) {
    presentShortlist(input: $input) {
      id
      status
      presentedAt
    }
  }
`;

export const CLOSE_SHORTLIST_MUTATION = gql`
  mutation CloseShortlist($input: ShortlistIdInput!) {
    closeShortlist(input: $input) {
      id
      status
      closedAt
    }
  }
`;

export const MY_SHORTLISTS_QUERY = gql`
  query MyShortlists {
    myShortlists {
      id
      jobPostingTitle
      roundNumber
      status
      presentedAt
      entries {
        id
        candidateName
        currentTitle
        yearsExperience
        location
        skills
        coverNote
        expectedSalary
        salaryCurrency
        rank
        clientDecision
        clientNote
      }
    }
  }
`;

export const RECORD_SHORTLIST_DECISION_MUTATION = gql`
  mutation RecordShortlistDecision($input: RecordShortlistDecisionInput!) {
    recordShortlistDecision(input: $input) {
      shortlistEntryId
      clientDecision
      clientNote
    }
  }
`;
