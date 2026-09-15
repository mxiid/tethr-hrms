import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';
import { EmployeeModule } from '../employee/employee.module';
import { CompensationModule } from '../finance/compensation/compensation.module';
import { FormsModule } from '../forms/forms.module';
import { OrganizationModule } from '../organization/organization.module';
import { PositionModule } from '../position/position.module';

import { AtsResolver } from './ats.resolver';
import { AtsService } from './ats.service';
import {
  APPLICATION_REPOSITORY,
  CANDIDATE_DOCUMENT_REPOSITORY,
  CANDIDATE_REPOSITORY,
  CV_PARSE_REPOSITORY,
  INTERVIEW_FEEDBACK_REPOSITORY,
  INTERVIEW_FEEDBACK_SKILL_REPOSITORY,
  INTERVIEW_PANEL_MEMBER_REPOSITORY,
  INTERVIEW_REPOSITORY,
  INTERVIEW_ROUND_REPOSITORY,
  JOB_POSTING_REPOSITORY,
  OFFER_REPOSITORY,
  SHORTLIST_ENTRY_REPOSITORY,
  SHORTLIST_REPOSITORY,
} from './ats.tokens';
import { ApplicationIntakeConsumer } from './consumers/application-intake.consumer';
import { HiringRequestSubmittedConsumer } from './consumers/hiring-request-submitted.consumer';
import { HiringRequestUpdatedConsumer } from './consumers/hiring-request-updated.consumer';
import { Application } from './entities/application.entity';
import { CandidateDocument } from './entities/candidate-document.entity';
import { Candidate } from './entities/candidate.entity';
import { CvParse } from './entities/cv-parse.entity';
import { HiringRequestUpdate } from './entities/hiring-request-update.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import { InterviewFeedbackSkill } from './entities/interview-feedback-skill.entity';
import { InterviewFeedback } from './entities/interview-feedback.entity';
import { InterviewPanelMember } from './entities/interview-panel-member.entity';
import { InterviewRound } from './entities/interview-round.entity';
import { Interview } from './entities/interview.entity';
import { JobPosting } from './entities/job-posting.entity';
import { Offer } from './entities/offer.entity';
import { ShortlistEntry } from './entities/shortlist-entry.entity';
import { Shortlist } from './entities/shortlist.entity';
import { InterviewResolver } from './interview.resolver';
import { InterviewService } from './interview.service';
import { OfferResolver } from './offer.resolver';
import { OfferService } from './offer.service';
import { RecruitmentResolver } from './recruitment.resolver';
import { RecruitmentService } from './recruitment.service';
import { HIRING_REQUEST_REPOSITORY, HIRING_REQUEST_UPDATE_REPOSITORY } from './recruitment.tokens';
import { ShortlistResolver } from './shortlist.resolver';
import { ShortlistService } from './shortlist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HiringRequest,
      HiringRequestUpdate,
      JobPosting,
      Candidate,
      Application,
      CandidateDocument,
      CvParse,
      Shortlist,
      ShortlistEntry,
      InterviewRound,
      Interview,
      InterviewPanelMember,
      InterviewFeedback,
      InterviewFeedbackSkill,
      Offer,
    ]),
    AuthModule,
    AuthzModule,
    OrganizationModule,
    PositionModule,
    EmployeeModule,
    CompensationModule,
    FormsModule,
  ],
  providers: [
    RecruitmentService,
    RecruitmentResolver,
    AtsService,
    AtsResolver,
    ShortlistService,
    ShortlistResolver,
    InterviewService,
    InterviewResolver,
    OfferService,
    OfferResolver,
    HiringRequestSubmittedConsumer,
    HiringRequestUpdatedConsumer,
    ApplicationIntakeConsumer,
    provideTenantScopedRepository(HIRING_REQUEST_REPOSITORY, HiringRequest),
    provideTenantScopedRepository(HIRING_REQUEST_UPDATE_REPOSITORY, HiringRequestUpdate),
    provideTenantScopedRepository(JOB_POSTING_REPOSITORY, JobPosting),
    provideTenantScopedRepository(CANDIDATE_REPOSITORY, Candidate),
    provideTenantScopedRepository(APPLICATION_REPOSITORY, Application),
    provideTenantScopedRepository(CANDIDATE_DOCUMENT_REPOSITORY, CandidateDocument),
    provideTenantScopedRepository(CV_PARSE_REPOSITORY, CvParse),
    provideTenantScopedRepository(SHORTLIST_REPOSITORY, Shortlist),
    provideTenantScopedRepository(SHORTLIST_ENTRY_REPOSITORY, ShortlistEntry),
    provideTenantScopedRepository(INTERVIEW_ROUND_REPOSITORY, InterviewRound),
    provideTenantScopedRepository(INTERVIEW_REPOSITORY, Interview),
    provideTenantScopedRepository(INTERVIEW_PANEL_MEMBER_REPOSITORY, InterviewPanelMember),
    provideTenantScopedRepository(INTERVIEW_FEEDBACK_REPOSITORY, InterviewFeedback),
    provideTenantScopedRepository(INTERVIEW_FEEDBACK_SKILL_REPOSITORY, InterviewFeedbackSkill),
    provideTenantScopedRepository(OFFER_REPOSITORY, Offer),
  ],
  exports: [RecruitmentService, AtsService, ShortlistService, InterviewService, OfferService],
})
export class RecruitmentModule {}
