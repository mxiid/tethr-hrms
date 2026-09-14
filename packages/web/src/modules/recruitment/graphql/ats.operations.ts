import { gql } from '@apollo/client';

export const JOB_POSTINGS_QUERY = gql`
  query JobPostings {
    jobPostings {
      id
      title
      isPublished
      postedAt
      closesOn
      sourceHiringRequestId
    }
  }
`;

export const CANDIDATES_QUERY = gql`
  query Candidates {
    candidates {
      id
      fullName
      email
      phone
      linkedin
      portfolio
      source
      createdAt
      applicationCount
    }
  }
`;

export const CANDIDATE_DETAIL_QUERY = gql`
  query CandidateDetail($id: ID!) {
    candidate(id: $id) {
      id
      fullName
      email
      phone
      linkedin
      portfolio
      source
      createdAt
      applicationCount
      applications {
        id
        jobPostingTitle
        stage
        outcome
        onHold
        holdReason
        expectedSalary
        salaryCurrency
        currentTitle
        yearsExperience
        location
        skills
        coverNote
        manualRating
        notes
        hasResume
        createdAt
      }
    }
  }
`;

export const PUBLISH_HIRING_REQUEST_MUTATION = gql`
  mutation PublishHiringRequest($input: PublishHiringRequestInput!) {
    publishHiringRequest(input: $input) {
      jobPostingId
      title
      applyPath
    }
  }
`;

export const CREATE_CANDIDATE_MUTATION = gql`
  mutation CreateCandidate($input: CreateCandidateInput!) {
    createCandidate(input: $input) {
      id
      fullName
      email
    }
  }
`;

export const UPDATE_APPLICATION_MUTATION = gql`
  mutation UpdateApplication($input: UpdateApplicationInput!) {
    updateApplication(input: $input) {
      id
      stage
      outcome
      onHold
      manualRating
      notes
    }
  }
`;

export const OFFERS_QUERY = gql`
  query Offers {
    offers {
      id
      applicationId
      candidateName
      jobPostingTitle
      baseSalary
      salaryCurrency
      startDate
      probationDays
      noticePeriodDays
      extras {
        label
        value
      }
      status
      sentAt
      respondedAt
      hiredEmployeeId
      notes
    }
  }
`;

export const CREATE_OFFER_MUTATION = gql`
  mutation CreateOffer($input: CreateOfferInput!) {
    createOffer(input: $input) {
      id
      status
    }
  }
`;

export const SEND_OFFER_MUTATION = gql`
  mutation SendOffer($input: OfferIdInput!) {
    sendOffer(input: $input) {
      id
      status
    }
  }
`;

export const ACCEPT_OFFER_MUTATION = gql`
  mutation AcceptOffer($input: OfferIdInput!) {
    acceptOffer(input: $input) {
      employeeId
      offer {
        id
        status
        hiredEmployeeId
      }
    }
  }
`;

export const WITHDRAW_OFFER_MUTATION = gql`
  mutation WithdrawOffer($input: OfferIdInput!) {
    withdrawOffer(input: $input) {
      id
      status
    }
  }
`;

export const DECLINE_OFFER_MUTATION = gql`
  mutation DeclineOffer($input: DeclineOfferInput!) {
    declineOffer(input: $input) {
      id
      status
    }
  }
`;
