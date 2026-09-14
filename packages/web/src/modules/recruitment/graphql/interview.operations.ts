import { gql } from '@apollo/client';

export const SHORTLIST_READY_APPLICATIONS_QUERY = gql`
  query ShortlistReadyApplications {
    shortlistReadyApplications {
      id
      candidateName
      jobPostingTitle
      stage
      manualRating
      currentTitle
      yearsExperience
    }
  }
`;

export const INTERVIEW_ROUNDS_QUERY = gql`
  query InterviewRounds {
    interviewRounds {
      id
      name
      orderIndex
      skills
      expectedRating
    }
  }
`;

export const INTERVIEWS_QUERY = gql`
  query Interviews {
    interviews {
      id
      applicationId
      candidateName
      jobPostingTitle
      round {
        id
        name
        skills
      }
      scheduledAt
      status
      outcome
      average
      feedbacksExpected
      skillAverages {
        skill
        average
      }
      panel {
        id
        userId
        displayName
        hasFiledFeedback
      }
      feedbacks {
        id
        panelMemberId
        overallNote
        submittedAt
        average
        scores {
          skill
          score
        }
      }
    }
  }
`;

export const SCHEDULE_INTERVIEW_MUTATION = gql`
  mutation ScheduleInterview($input: ScheduleInterviewInput!) {
    scheduleInterview(input: $input) {
      id
    }
  }
`;

export const UPDATE_INTERVIEW_MUTATION = gql`
  mutation UpdateInterview($input: UpdateInterviewInput!) {
    updateInterview(input: $input) {
      id
      status
      outcome
    }
  }
`;

export const RECORD_INTERVIEW_FEEDBACK_MUTATION = gql`
  mutation RecordInterviewFeedback($input: RecordInterviewFeedbackInput!) {
    recordInterviewFeedback(input: $input) {
      id
      panelMemberId
      average
    }
  }
`;

export const WITHDRAW_INTERVIEW_FEEDBACK_MUTATION = gql`
  mutation WithdrawInterviewFeedback($input: FeedbackIdInput!) {
    withdrawInterviewFeedback(input: $input)
  }
`;

export const MY_INTERVIEW_OUTCOMES_QUERY = gql`
  query MyInterviewOutcomes {
    myInterviewOutcomes {
      interviewId
      roundName
      jobPostingTitle
      scheduledAt
      status
      outcome
    }
  }
`;
