// Domain vocabularies as string-literal unions (never TS enums — see
// architecture.md §6.3). Both backend and frontend import these so a status
// value means the same thing on every side of the wire.

// Authorization data scope: how wide a permission reaches. Payroll-admin for one
// legal entity is not payroll-admin for another (plan.md §6).
export type DataScope = 'own' | 'team' | 'department' | 'legalEntity' | 'organization';

// PII sensitivity tier — drives field-level encryption and erasure handling.
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

// Lifecycle state of an employment, distinct from whether a login is active.
export type EmploymentStatus = 'active' | 'onLeave' | 'suspended' | 'terminated';

// Worker engagement type — drives statutory and pay treatment downstream.
export type WorkerType = 'permanent' | 'fixedTerm' | 'contractor' | 'intern' | 'temporary';

// Why an employee holds a given assignment. 'primary' is the assignment payroll
// and org-chart default to; the others model acting/dual/secondment cases.
export type AssignmentType = 'primary' | 'secondary' | 'acting' | 'secondment';

// Generic approval outcome used by the workflow engine and anything that routes
// through it (leave, expenses, ...).
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

// Compensation config and salary-revision vocabulary. Payroll consumes these
// values, so they live in shared rather than in the backend module only.
export type PayFrequency = 'monthly' | 'semiMonthly' | 'biweekly' | 'weekly';
export type PayComponentCategory = 'earning' | 'deduction' | 'employerContribution';
export type CompensationChangeReason =
  'hire' | 'merit' | 'promotion' | 'marketAdjustment' | 'correction';

// The system roles that establish the first V1 experiences. Roles remain
// tenant-configurable data, but these stable keys let the product safely select
// a portal and seed a sensible initial permission set.
export type SystemRoleKey =
  | 'tethrAdmin'
  | 'tethrHr'
  | 'tethrFinance'
  | 'clientAdmin'
  | 'clientMember'
  | 'employee';

// A person can hold more than one role. The portal is a presentation choice made
// from their effective roles; authorization continues to use permissions.
export type PortalKind = 'tethr' | 'client' | 'employee' | 'none';

export type OrganizationKind = 'tethr' | 'client';

// The 25-hue set a workspace's brand color is drawn from — auto-assigned at
// creation, user-configurable after. Deliberately mirrors @hrms/ui's
// MainColorName/tagPalette (design.md §4.3) rather than importing it: api
// depends only on @hrms/shared (never on ui, a presentation-layer package),
// so this is the shared source of truth for validation on the backend while
// the frontend renders swatches from the matching @hrms/ui palette. Keep the
// two lists in sync if the palette ever changes.
export const WORKSPACE_BRAND_COLORS = [
  'red', 'ruby', 'crimson', 'tomato', 'orange', 'amber', 'yellow', 'lime',
  'grass', 'green', 'jade', 'mint', 'turquoise', 'cyan', 'sky', 'blue',
  'iris', 'violet', 'purple', 'plum', 'pink', 'bronze', 'gold', 'brown', 'gray',
] as const;
export type WorkspaceBrandColor = (typeof WORKSPACE_BRAND_COLORS)[number];

// The request's own lifecycle. Pipeline stages (screening, interview, offer)
// are derived from applications once they exist — they are not hand-set here.
export const HIRING_REQUEST_STATUSES = [
  'submitted',
  'open',
  'onHold',
  'filled',
  'cancelled',
] as const;
export type HiringRequestStatus = (typeof HIRING_REQUEST_STATUSES)[number];

export const HIRING_REQUEST_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export type HiringRequestPriority = (typeof HIRING_REQUEST_PRIORITIES)[number];

// The form builder's field vocabulary. Keep additions mirrored in the public
// apply page's renderer.
export const FORM_FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'number',
  'date',
  'textarea',
  'select',
  'file',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_TARGETS = ['generic', 'application'] as const;
export type FormTarget = (typeof FORM_TARGETS)[number];

// Where an application sits in the pipeline, how it ended, and whether it is on
// hold — three separate facts (a single flat enum conflates them).
export const APPLICATION_STAGES = [
  'screening',
  'shortlisted',
  'interviewing',
  'offer',
  'hired',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLICATION_OUTCOMES = ['active', 'rejected', 'withdrawn', 'hired'] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

// The agency's batch flow: we rank candidates internally into a round, present
// it to the client, collect per-candidate verdicts, then close the round.
export const SHORTLIST_STATUSES = ['draft', 'presented', 'feedbackReceived', 'closed'] as const;
export type ShortlistStatus = (typeof SHORTLIST_STATUSES)[number];

export const SHORTLIST_DECISIONS = ['pending', 'interested', 'rejected'] as const;
export type ShortlistDecision = (typeof SHORTLIST_DECISIONS)[number];

export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_OUTCOMES = ['passed', 'failed', 'noShow'] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'withdrawn'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type AnnouncementAudience = 'all' | 'tethr' | 'client' | 'employee';

export type FeedbackCategory = 'general' | 'people' | 'pay' | 'leave' | 'workplace';

export type FeedbackStatus = 'submitted' | 'inReview' | 'resolved';

export type EmployeeOnboardingTaskKey =
  'profile' | 'contract' | 'nda' | 'resume' | 'bankDetails' | 'hardware' | 'employeeRecordForm';

export type EmployeeOnboardingTaskStatus = 'notStarted' | 'inProgress' | 'completed' | 'blocked';

export type EmployeeDocumentCategory = 'contract' | 'nda' | 'resume' | 'id' | 'hardware' | 'other';

export type EmployeeDocumentVisibility = 'all' | 'client' | 'employee' | 'tethr';

export type DocumentSignatureStatus = 'notRequired' | 'pending' | 'signed' | 'declined' | 'expired';

export type BonusReason =
  'performance' | 'retention' | 'referral' | 'spot' | 'clientApproved' | 'other';

// Payroll run lifecycle. A draft is fully recomputable and editable; finalize
// snapshots payslips (immutable) and locks the run.
export type PayrollRunStatus = 'draft' | 'finalized';

// How a salary-structure component derives its amount from the period gross:
// a percent of gross, or a fixed monthly amount on top of the net calculation.
export type StructureComponentCalcType = 'percentOfGross' | 'fixedMonthly';

// Client invoice lifecycle. Drafts are freely editable finance working state;
// issuing freezes the document (number assigned, immutable); paid closes it.
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'voided';

// Services invoices carry salaries + management fees; expenses invoices carry
// pass-through reimbursements. Each billing group issues its own pair.
export type InvoiceType = 'services' | 'expenses';

export type InvoiceLineKind = 'salary' | 'fee' | 'expense' | 'catchup';

// Employee expense claim lifecycle: the employee (or HR on their behalf) builds
// a draft, submitting routes it through the workflow engine, approval makes it
// payable, and paid means the reimbursement was committed (directly or by being
// scheduled into a payroll run).
export type ExpenseClaimStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'paid';

export type ExpenseReimbursementMethod = 'direct' | 'payroll';

// Per-employee tax facts' filer status. Tenant rules decide the consequence;
// the profile records the fact so payroll's withholding trail is complete.
export type TaxFilerStatus = 'filer' | 'nonFiler';

export type Salutation = 'Mr' | 'Ms' | 'Mrs' | 'Mx' | 'Dr' | 'Prof';

export type PreferredContactChannel = 'companyEmail' | 'personalEmail' | 'userId';

export type AccommodationType = 'rented' | 'owned';

export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type EducationLevel = 'graduate' | 'postGraduate' | 'underGraduate';

export type SeparationType = 'resignation' | 'termination' | 'retirement' | 'other';

export type ExitInterviewStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export type ExitInterviewDecision = 'retained' | 'exitConfirmed';

export type PaymentMode = 'bank' | 'cash' | 'cheque';

export type EmployeeOffboardingTaskStatus = EmployeeOnboardingTaskStatus;
