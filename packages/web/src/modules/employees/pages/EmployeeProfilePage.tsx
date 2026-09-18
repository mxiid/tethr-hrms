import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import {
  formatDate,
  formatDateTime,
  todayDateKey,
  type CompensationChangeReason,
  type DocumentSignatureStatus,
  type EmployeeOnboardingTaskStatus,
  type EmploymentStatus,
  type WorkerType,
} from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconArrowLeft,
  IconCamera,
  IconClipboardCheck,
  IconCurrencyDollar,
  IconDeviceFloppy,
  IconDownload,
  IconFileText,
  IconGift,
  IconLoader2,
  IconProgressCheck,
  IconSignature,
  IconUserCheck,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { uploadToSignedUrl } from '../../../app/upload';
import { StatusChip } from '../../../components/chip/StatusChip';
import { useConfirm } from '../../../components/confirm/ConfirmProvider';
import { useTheme } from '../../../providers/theme/useTheme';
import { CREATE_WORKSPACE_USER_MUTATION } from '../../auth/graphql/auth.operations';
import { useAuth } from '../../auth/hooks/useAuth';
import { DetailSection } from '../components/DetailSection';
import { EmployeeJobPayHub } from '../components/EmployeeJobPayHub';
import {
  ADD_EMPLOYEE_DOCUMENT_VERSION_MUTATION,
  ATTACH_EMPLOYEE_DOCUMENT_MUTATION,
  AWARD_BONUS_MUTATION,
  EMPLOYEE_DOCUMENT_DOWNLOAD_ACCESS_QUERY,
  EMPLOYEE_DETAIL_QUERY,
  EMPLOYEES_QUERY,
  SET_EMPLOYEE_MANAGER_MUTATION,
  EMPLOYEE_HR_RECORD_QUERY,
  EMPLOYEE_ONBOARDING_PROGRESS_QUERY,
  EMPLOYEE_ONBOARDING_TASKS_QUERY,
  EMPLOYEE_SALARY_STRUCTURES_QUERY,
  PREPARE_EMPLOYEE_DOCUMENT_UPLOAD_MUTATION,
  RECORD_EMPLOYEE_ASSESSMENT_MUTATION,
  REVISE_EMPLOYEE_SALARY_MUTATION,
  REQUEST_EMPLOYEE_DOCUMENT_SIGNATURE_MUTATION,
  SEPARATE_EMPLOYEE_MUTATION,
  UPDATE_EMPLOYEE_HR_RECORD_MUTATION,
  UPDATE_EMPLOYEE_MUTATION,
  UPDATE_EMPLOYEE_ONBOARDING_TASK_MUTATION,
  UPDATE_EMPLOYEE_PHOTO_MUTATION,
  UPDATE_OFFBOARDING_TASK_MUTATION,
  UPSERT_EXIT_INTERVIEW_MUTATION,
} from '../graphql/employee.operations';

type AssignmentView = {
  readonly id: string;
  readonly positionTitle: string | null;
  readonly departmentName: string | null;
  readonly locationName: string | null;
  readonly reportsToEmployeeId: string | null;
  readonly reportsToName: string | null;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly assignmentType: string;
};

type EmployeeRecord = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly salutation: string | null;
  readonly workEmail: string | null;
  readonly roleTitle: string | null;
  readonly dateOfBirth: string | null;
  readonly hireDate: string;
  readonly probationEndDate: string | null;
  readonly scheduledConfirmationDate: string | null;
  readonly finalConfirmationDate: string | null;
  readonly contractEndDate: string | null;
  readonly noticePeriodDays: number | null;
  readonly retirementDate: string | null;
  readonly holidayCalendarId: string | null;
  readonly employmentStatus: EmploymentStatus;
  readonly workerType: WorkerType;
  readonly currentAssignment: AssignmentView | null;
  readonly assignmentHistory: readonly AssignmentView[];
};

type EmployeeProfileRecord = {
  readonly employeeId: string;
  readonly photoUrl: string | null;
  readonly personalEmail: string | null;
  readonly phone: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly countryCode: string | null;
  readonly postalCode: string | null;
  readonly permanentAddressLine1: string | null;
  readonly permanentAddressLine2: string | null;
  readonly permanentCity: string | null;
  readonly permanentRegion: string | null;
  readonly permanentCountryCode: string | null;
  readonly permanentPostalCode: string | null;
  readonly currentAccommodationType: string | null;
  readonly permanentAccommodationType: string | null;
  readonly preferredContactChannel: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly emergencyContactRelation: string | null;
};
type SalaryRecord = {
  readonly id: string;
  readonly salaryStructureId: string;
  readonly currency: string;
  readonly annualAmount: number;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly reason: CompensationChangeReason;
};
type SalaryStructureRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly currency: string;
  readonly payFrequency: string;
  readonly isActive: boolean;
};
type SalaryStructuresData = {
  readonly salaryStructures: readonly SalaryStructureRecord[];
};
type SalaryRevisionRecord = SalaryRecord & {
  readonly employeeId: string;
  readonly approvedByUserId: string | null;
  readonly note: string | null;
};
type ReviseSalaryData = { readonly reviseSalary: SalaryRevisionRecord };
type AssessmentRecord = {
  readonly id: string;
  readonly title: string;
  readonly assessmentDate: string;
  readonly score: number | null;
  readonly assessorName: string | null;
  readonly notes: string | null;
};
type EmployeeDocumentRecord = {
  readonly id: string;
  readonly documentId: string;
  readonly category: string;
  readonly visibility: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly classification: string;
  readonly latestStorageKey: string;
  readonly latestVersionNumber: number;
  readonly versionCount: number;
  readonly signatureStatus: DocumentSignatureStatus;
  readonly signedAt: string | null;
  readonly signatureProvider: string | null;
  readonly externalEnvelopeId: string | null;
};
type DocumentAccessDescriptor = {
  readonly storageKey: string;
  readonly url: string;
  readonly method: string;
  readonly expiresAt: string;
  readonly headers: readonly {
    readonly name: string;
    readonly value: string;
  }[];
};
type PrepareDocumentUploadData = {
  readonly prepareEmployeeDocumentUpload: DocumentAccessDescriptor;
};
type EmployeeDocumentDownloadAccessData = {
  readonly employeeDocumentDownloadAccess: DocumentAccessDescriptor;
};
type SignatureRequestData = {
  readonly requestEmployeeDocumentSignature: DocumentSignatureRequestRecord;
};
type DocumentSignatureRequestRecord = {
  readonly employeeDocumentLinkId: string;
  readonly documentId: string;
  readonly signingUrl: string;
  readonly externalEnvelopeId: string;
  readonly signatureProvider: string;
  readonly signatureStatus: DocumentSignatureStatus;
  readonly expiresAt: string;
};
type BonusAwardRecord = {
  readonly id: string;
  readonly awardDate: string;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly note: string | null;
};
type PersonalDetailsRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly passportNumber: string | null;
  readonly passportIssueDate: string | null;
  readonly passportIssuePlace: string | null;
  readonly passportValidUpto: string | null;
  readonly maritalStatus: string | null;
  readonly bloodGroup: string | null;
  readonly familyBackground: string | null;
  readonly healthDetails: string | null;
  readonly bio: string | null;
};
type EducationRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly schoolOrUniversity: string;
  readonly qualification: string;
  readonly level: string;
  readonly yearOfPassing: number | null;
  readonly classOrPercentage: string | null;
  readonly majorSubjects: string | null;
};
type WorkHistoryRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly companyName: string;
  readonly designation: string | null;
  readonly salary: string | null;
  readonly address: string | null;
  readonly contact: string | null;
  readonly totalExperience: string | null;
};
type SeparationRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly type: string;
  readonly resignationLetterDate: string | null;
  readonly relievingDate: string | null;
  readonly reasonForLeaving: string | null;
  readonly leaveEncashed: boolean;
  readonly encashmentDate: string | null;
  readonly heldOn: string | null;
  readonly newWorkplace: string | null;
  readonly feedback: string | null;
};
type ExitInterviewRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly separationId: string;
  readonly status: string;
  readonly scheduledDate: string | null;
  readonly interviewerUserIds: readonly string[] | null;
  readonly summary: string | null;
  readonly finalDecision: string | null;
};
type OffboardingTaskRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly separationId: string | null;
  readonly taskKey: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly completedAt: string | null;
  readonly notes: string | null;
};
type EmployeeDetailData = {
  readonly employee: EmployeeRecord;
  readonly employeeProfile: EmployeeProfileRecord | null;
  readonly employeePersonalDetails: PersonalDetailsRecord | null;
  readonly employeeEducations: readonly EducationRecord[];
  readonly employeeWorkHistories: readonly WorkHistoryRecord[];
  readonly employeeSeparations: readonly SeparationRecord[];
  readonly employeeExitInterviews: readonly ExitInterviewRecord[];
  readonly employeeOffboardingTasks: readonly OffboardingTaskRecord[];
  readonly currentSalaryRevision: SalaryRecord | null;
  readonly employeeAssessments: readonly AssessmentRecord[];
  readonly employeeDocuments: readonly EmployeeDocumentRecord[];
  readonly bonusAwards: readonly BonusAwardRecord[];
};
type EmployeeHrRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly roleTitle: string | null;
  readonly salaryBreakdown: string | null;
  readonly paymentMode: string | null;
  readonly bankName: string | null;
  readonly bankAccountTitle: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIban: string | null;
  readonly hardwareInfo: string | null;
  readonly employeeRecordForm: string | null;
};
type EmployeeHrRecordData = { readonly employeeHrRecord: EmployeeHrRecord | null };
type EmployeeOnboardingTask = {
  readonly id: string | null;
  readonly employeeId: string;
  readonly taskKey: string;
  readonly title: string;
  readonly status: EmployeeOnboardingTaskStatus;
  readonly dueDate: string | null;
  readonly completedAt: string | null;
  readonly notes: string | null;
};
type EmployeeOnboardingTasksData = {
  readonly employeeOnboardingTasks: readonly EmployeeOnboardingTask[];
};
type EmployeeOnboardingProgressData = {
  readonly employeeOnboardingProgress: {
    readonly completed: number;
    readonly total: number;
    readonly allComplete: boolean;
  };
};
type OnboardingTaskDraft = {
  readonly status: EmployeeOnboardingTaskStatus;
  readonly dueDate: string;
  readonly notes: string;
};
type ChipStyle = CSSProperties & { readonly '--chip-color': string };

const AVATAR_COLORS: readonly MainColorName[] = [
  'blue',
  'green',
  'violet',
  'amber',
  'tomato',
  'jade',
  'plum',
  'cyan',
];

const statusLabels: Record<EmploymentStatus, string> = {
  active: 'Active',
  onLeave: 'On leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

const statusColors: Record<EmploymentStatus, MainColorName> = {
  active: 'green',
  onLeave: 'amber',
  suspended: 'tomato',
  terminated: 'gray',
};

const workerTypeLabels: Record<WorkerType, string> = {
  permanent: 'Permanent',
  fixedTerm: 'Fixed term',
  contractor: 'Contractor',
  intern: 'Intern',
  temporary: 'Temporary',
};

const compensationReasonLabels: Record<CompensationChangeReason, string> = {
  hire: 'Hire',
  merit: 'Merit',
  promotion: 'Promotion',
  marketAdjustment: 'Market adjustment',
  correction: 'Correction',
};

const signatureStatusLabels: Record<DocumentSignatureStatus, string> = {
  notRequired: 'No signature',
  pending: 'Pending signature',
  signed: 'Signed',
  declined: 'Declined',
  expired: 'Expired',
};

const signatureStatusColors: Record<DocumentSignatureStatus, MainColorName> = {
  notRequired: 'gray',
  pending: 'amber',
  signed: 'green',
  declined: 'tomato',
  expired: 'gray',
};

const onboardingStatusLabels: Record<EmployeeOnboardingTaskStatus, string> = {
  notStarted: 'Not started',
  inProgress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

const onboardingStatusColors: Record<EmployeeOnboardingTaskStatus, MainColorName> = {
  notStarted: 'gray',
  inProgress: 'amber',
  completed: 'green',
  blocked: 'tomato',
};

// Offboarding tasks arrive with a plain-string status from the API.
const offboardingStatusLabels: Record<string, string> = {
  notStarted: 'Not started',
  inProgress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

const fullName = (employee: EmployeeRecord): string => `${employee.firstName} ${employee.lastName}`;
const initials = (employee: EmployeeRecord): string =>
  `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
const colorFor = (id: string): MainColorName => {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? 'blue';
};
const chipStyle = (color: MainColorName): ChipStyle => ({
  '--chip-color': `var(--hrms-color-tag-${color})`,
});
const formatMoney = (value: number, currency: string): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    value,
  );
const daysSince = (value: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(`${value}T00:00:00`).getTime()) / 86_400_000));
const daysUntil = (value: string): number =>
  Math.max(0, Math.ceil((new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86_400_000));
const emptyHrRecordForm = {
  roleTitle: '',
  salaryBreakdown: '',
  paymentMode: '',
  bankName: '',
  bankAccountTitle: '',
  bankAccountNumber: '',
  bankIban: '',
  hardwareInfo: '',
  employeeRecordForm: '',
};
const emptyAssessmentForm = {
  title: '',
  assessmentDate: '',
  score: '',
  assessorName: '',
  notes: '',
};
const emptyDocumentForm = {
  name: '',
  contentType: 'application/pdf',
  sizeBytes: '0',
  category: 'contract',
  visibility: 'client',
  classification: 'confidential',
  signatureStatus: 'notRequired',
  signedAt: '',
  signatureProvider: '',
  externalEnvelopeId: '',
};
const emptyDocumentVersionForm = {
  employeeDocumentLinkId: '',
  contentType: 'application/pdf',
  sizeBytes: '0',
  signatureStatus: 'notRequired',
  signedAt: '',
  signatureProvider: '',
  externalEnvelopeId: '',
};
const emptyBonusForm = {
  awardDate: '',
  currency: 'USD',
  amount: '',
  reason: 'clientApproved',
  note: '',
};
const emptySalaryRevisionForm = {
  salaryStructureId: '',
  effectiveDate: todayDateKey(),
  annualAmount: '',
  reason: 'merit' as CompensationChangeReason,
  note: '',
};

type ProfileTabKey = 'profile' | 'pay' | 'documents' | 'onboarding' | 'lifecycle';

// The thirteen record sections, grouped so no tab holds more than a screenful.
const PROFILE_TABS: ReadonlyArray<{ readonly key: ProfileTabKey; readonly label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'pay', label: 'Job & pay' },
  { key: 'documents', label: 'Documents' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'lifecycle', label: 'Access & exit' },
];

export const EmployeeProfilePage = () => {
  const { theme } = useTheme();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { employeeId = '' } = useParams<{ employeeId: string }>();
  const [tab, setTab] = useState<ProfileTabKey>('profile');
  const [recordAssessment, { loading: recordingAssessment }] = useMutation(
    RECORD_EMPLOYEE_ASSESSMENT_MUTATION,
  );
  const [attachDocument, { loading: attachingDocument }] = useMutation(
    ATTACH_EMPLOYEE_DOCUMENT_MUTATION,
  );
  const [addDocumentVersion, { loading: addingDocumentVersion }] = useMutation(
    ADD_EMPLOYEE_DOCUMENT_VERSION_MUTATION,
  );
  const [prepareDocumentUpload] = useMutation<PrepareDocumentUploadData>(
    PREPARE_EMPLOYEE_DOCUMENT_UPLOAD_MUTATION,
  );
  const [loadDocumentDownloadAccess, { loading: loadingDocumentDownloadAccess }] =
    useLazyQuery<EmployeeDocumentDownloadAccessData>(EMPLOYEE_DOCUMENT_DOWNLOAD_ACCESS_QUERY, {
      fetchPolicy: 'network-only',
    });
  const [requestDocumentSignature, { loading: requestingDocumentSignature }] =
    useMutation<SignatureRequestData>(REQUEST_EMPLOYEE_DOCUMENT_SIGNATURE_MUTATION);
  const [reviseSalary, { loading: revisingSalary }] = useMutation<ReviseSalaryData>(
    REVISE_EMPLOYEE_SALARY_MUTATION,
  );
  const [awardBonus, { loading: awardingBonus }] = useMutation(AWARD_BONUS_MUTATION);
  const [updateHrRecord, { loading: savingHrRecord }] = useMutation(
    UPDATE_EMPLOYEE_HR_RECORD_MUTATION,
  );
  const [updateOnboardingTask, { loading: savingOnboardingTask }] = useMutation(
    UPDATE_EMPLOYEE_ONBOARDING_TASK_MUTATION,
  );
  const [updatePhoto, { loading: savingPhoto }] = useMutation(UPDATE_EMPLOYEE_PHOTO_MUTATION);
  const [updateEmployee, { loading: updatingEmployee }] = useMutation(UPDATE_EMPLOYEE_MUTATION);
  const [separateEmployee, { loading: separatingEmployee }] = useMutation(SEPARATE_EMPLOYEE_MUTATION);
  const [createWorkspaceUser, { loading: creatingWorkspaceUser }] = useMutation(CREATE_WORKSPACE_USER_MUTATION);
  const [updateOffboardingTask, { loading: savingOffboardingTask }] = useMutation(UPDATE_OFFBOARDING_TASK_MUTATION);
  const [upsertExitInterview, { loading: savingExitInterview }] = useMutation(UPSERT_EXIT_INTERVIEW_MUTATION);

  // Everyone else in the workspace, as manager candidates. The employee is
  // filtered out here; the server also rejects self-reporting and any change
  // that would close a loop.
  const { data: directoryData } = useQuery<{
    readonly employees: ReadonlyArray<{
      readonly id: string;
      readonly firstName: string;
      readonly lastName: string;
      readonly roleTitle: string | null;
    }>;
  }>(EMPLOYEES_QUERY);
  const managerOptions = useMemo(
    () =>
      (directoryData?.employees ?? [])
        .filter((candidate) => candidate.id !== employeeId)
        .slice()
        .sort((left, right) => left.firstName.localeCompare(right.firstName)),
    [directoryData?.employees, employeeId],
  );
  const [setEmployeeManager, { loading: savingManager }] = useMutation(
    SET_EMPLOYEE_MANAGER_MUTATION,
  );
  const [managerForm, setManagerForm] = useState({
    reportsToEmployeeId: '',
    effectiveDate: todayDateKey(),
  });

  const [assessmentForm, setAssessmentForm] = useState(emptyAssessmentForm);
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm);
  const [documentVersionForm, setDocumentVersionForm] = useState(emptyDocumentVersionForm);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentVersionFile, setDocumentVersionFile] = useState<File | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentAccesses, setDocumentAccesses] = useState<
    Record<string, DocumentAccessDescriptor>
  >({});
  const [signatureRequests, setSignatureRequests] = useState<
    Record<string, DocumentSignatureRequestRecord>
  >({});
  const [salaryRevisionForm, setSalaryRevisionForm] = useState(emptySalaryRevisionForm);
  const [bonusForm, setBonusForm] = useState(emptyBonusForm);
  const [hrRecordForm, setHrRecordForm] = useState(emptyHrRecordForm);
  const [onboardingDrafts, setOnboardingDrafts] = useState<Record<string, OnboardingTaskDraft>>({});
  const [offboardingDrafts, setOffboardingDrafts] = useState<Record<string, { status: string; dueDate: string; notes: string }>>({});
  const [separationForm, setSeparationForm] = useState({
    type: 'resignation' as string,
    effectiveDate: todayDateKey(),
    reason: '',
    resignationLetterDate: '',
    relievingDate: '',
    newWorkplace: '',
    feedback: '',
    leaveEncashed: false,
  });
  const [showSeparation, setShowSeparation] = useState(false);
  const [exitInterviewForm, setExitInterviewForm] = useState({
    status: 'pending' as string,
    scheduledDate: '',
    summary: '',
    finalDecision: '' as string,
  });
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    middleName: '',
    salutation: '',
    scheduledConfirmationDate: '',
    finalConfirmationDate: '',
    contractEndDate: '',
    noticePeriodDays: '',
    retirementDate: '',
    holidayCalendarId: '',
    workEmail: '',
    roleTitle: '',
  });
  const [detailError, setDetailError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

  const canManageHrRecord = Boolean(
    user?.roleKeys.includes('tethrAdmin') || user?.roleKeys.includes('tethrHr'),
  );
  const canReviseSalary = Boolean(
    user?.roleKeys.includes('tethrAdmin') ||
    user?.roleKeys.includes('tethrHr') ||
    user?.roleKeys.includes('clientAdmin'),
  );
  const roleKeys = user?.roleKeys ?? [];
  const canViewPayroll = roleKeys.includes('tethrAdmin') || roleKeys.includes('tethrFinance');
  const canViewBilling = canViewPayroll;
  const canViewCompensationHistory = Boolean(
    roleKeys.includes('tethrAdmin') ||
      roleKeys.includes('tethrHr') ||
      roleKeys.includes('tethrFinance') ||
      roleKeys.includes('clientAdmin') ||
      roleKeys.includes('clientMember'),
  );
  const detailVariables = useMemo(() => ({ employeeId, asOf: todayDateKey() }), [employeeId]);
  const {
    data: detailData,
    loading: detailLoading,
    refetch: refetchDetail,
  } = useQuery<EmployeeDetailData>(EMPLOYEE_DETAIL_QUERY, {
    skip: !employeeId,
    variables: detailVariables,
  });
  const {
    data: hrRecordData,
    loading: hrRecordLoading,
    refetch: refetchHrRecord,
  } = useQuery<EmployeeHrRecordData>(EMPLOYEE_HR_RECORD_QUERY, {
    skip: !employeeId || !canManageHrRecord,
    variables: { employeeId },
  });
  const {
    data: onboardingData,
    loading: onboardingLoading,
    refetch: refetchOnboardingTasks,
  } = useQuery<EmployeeOnboardingTasksData>(EMPLOYEE_ONBOARDING_TASKS_QUERY, {
    skip: !employeeId || !canManageHrRecord,
    variables: { employeeId },
  });
  // The server's aggregate (bank details included) is the source of truth; the
  // client must not re-count the checklist.
  const { data: onboardingProgressData, refetch: refetchOnboardingProgress } =
    useQuery<EmployeeOnboardingProgressData>(EMPLOYEE_ONBOARDING_PROGRESS_QUERY, {
      skip: !employeeId || !canManageHrRecord,
      variables: { employeeId },
    });
  const { data: salaryStructuresData, loading: loadingSalaryStructures } =
    useQuery<SalaryStructuresData>(EMPLOYEE_SALARY_STRUCTURES_QUERY, {
      skip: !canReviseSalary,
    });
  const detailEmployee = detailData?.employee ?? null;
  const hrRecord = hrRecordData?.employeeHrRecord ?? null;
  const onboardingTasks = useMemo(
    () => onboardingData?.employeeOnboardingTasks ?? [],
    [onboardingData?.employeeOnboardingTasks],
  );
  const profile = detailData?.employeeProfile ?? null;
  const personalDetails = detailData?.employeePersonalDetails ?? null;
  const educations = detailData?.employeeEducations ?? [];
  const workHistories = detailData?.employeeWorkHistories ?? [];
  const separations = detailData?.employeeSeparations ?? [];
  const exitInterviews = detailData?.employeeExitInterviews ?? [];
  const offboardingTasks = useMemo(
    () => detailData?.employeeOffboardingTasks ?? [],
    [detailData?.employeeOffboardingTasks],
  );
  const salary = detailData?.currentSalaryRevision ?? null;
  const salaryStructures = useMemo(
    () => salaryStructuresData?.salaryStructures ?? [],
    [salaryStructuresData?.salaryStructures],
  );
  const activeSalaryStructures = useMemo(
    () => salaryStructures.filter((structure) => structure.isActive),
    [salaryStructures],
  );
  const availableSalaryStructures =
    activeSalaryStructures.length > 0 ? activeSalaryStructures : salaryStructures;
  const defaultSalaryStructureId =
    salary?.salaryStructureId ?? activeSalaryStructures[0]?.id ?? salaryStructures[0]?.id ?? '';
  const assessments = detailData?.employeeAssessments ?? [];
  const documents = detailData?.employeeDocuments ?? [];
  const bonuses = detailData?.bonusAwards ?? [];
  const onboardingCompletedCount =
    onboardingProgressData?.employeeOnboardingProgress.completed ??
    onboardingTasks.filter((task) => task.status === 'completed').length;
  const onboardingTaskTotal =
    onboardingProgressData?.employeeOnboardingProgress.total ?? (onboardingTasks.length || 7);
  const onboardingAllComplete =
    onboardingProgressData?.employeeOnboardingProgress.allComplete ??
    (onboardingTasks.length > 0 && onboardingCompletedCount === onboardingTasks.length);
  const offboardingCompletedCount = offboardingTasks.filter(
    (task) => task.status === 'completed',
  ).length;
  const canRecordAssessment =
    user?.roleKeys.includes('tethrAdmin') ||
    user?.roleKeys.includes('tethrHr') ||
    user?.roleKeys.includes('clientAdmin');
  const canAttachDocument =
    user?.roleKeys.includes('tethrAdmin') || user?.roleKeys.includes('tethrHr');
  const canEditHrRecord = canManageHrRecord;
  const canAwardBonus =
    user?.roleKeys.includes('tethrAdmin') ||
    user?.roleKeys.includes('tethrHr') ||
    user?.roleKeys.includes('clientAdmin');
  useEffect(() => {
    setManagerForm((current) => ({
      ...current,
      reportsToEmployeeId: detailEmployee?.currentAssignment?.reportsToEmployeeId ?? '',
    }));
  }, [detailEmployee?.currentAssignment?.reportsToEmployeeId]);

  useEffect(() => {
    setHrRecordForm({
      roleTitle: hrRecord?.roleTitle ?? detailEmployee?.roleTitle ?? '',
      salaryBreakdown: hrRecord?.salaryBreakdown ?? '',
      paymentMode: hrRecord?.paymentMode ?? '',
      bankName: hrRecord?.bankName ?? '',
      bankAccountTitle: hrRecord?.bankAccountTitle ?? '',
      bankAccountNumber: hrRecord?.bankAccountNumber ?? '',
      bankIban: hrRecord?.bankIban ?? '',
      hardwareInfo: hrRecord?.hardwareInfo ?? '',
      employeeRecordForm: hrRecord?.employeeRecordForm ?? '',
    });
  }, [detailEmployee?.roleTitle, hrRecord]);

  useEffect(() => {
    setOnboardingDrafts(
      Object.fromEntries(
        onboardingTasks.map((task) => [
          task.taskKey,
          {
            status: task.status,
            dueDate: task.dueDate ?? '',
            notes: task.notes ?? '',
          },
        ]),
      ),
    );
  }, [onboardingTasks]);

  useEffect(() => {
    setOffboardingDrafts(
      Object.fromEntries(
        offboardingTasks.map((task) => [
          task.taskKey,
          {
            status: task.status,
            dueDate: task.dueDate ?? '',
            notes: task.notes ?? '',
          },
        ]),
      ),
    );
  }, [offboardingTasks]);

  useEffect(() => {
    setSalaryRevisionForm({
      salaryStructureId: defaultSalaryStructureId,
      effectiveDate: todayDateKey(),
      annualAmount: salary ? String(salary.annualAmount) : '',
      reason: 'merit',
      note: '',
    });
  }, [defaultSalaryStructureId, salary, detailEmployee?.id]);

  useEffect(() => {
    setPhotoNotice(null);
  }, [detailEmployee?.id]);

  useEffect(() => {
    if (detailEmployee) {
      setEditForm({
        middleName: detailEmployee.middleName ?? '',
        salutation: detailEmployee.salutation ?? '',
        scheduledConfirmationDate: detailEmployee.scheduledConfirmationDate ?? '',
        finalConfirmationDate: detailEmployee.finalConfirmationDate ?? '',
        contractEndDate: detailEmployee.contractEndDate ?? '',
        noticePeriodDays: detailEmployee.noticePeriodDays !== null && detailEmployee.noticePeriodDays !== undefined ? String(detailEmployee.noticePeriodDays) : '',
        retirementDate: detailEmployee.retirementDate ?? '',
        holidayCalendarId: detailEmployee.holidayCalendarId ?? '',
        workEmail: detailEmployee.workEmail ?? '',
        roleTitle: detailEmployee.roleTitle ?? '',
      });
    }
  }, [detailEmployee]);

  const onUpdateEmployee = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    setDetailError(null);
    try {
      await updateEmployee({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            middleName: editForm.middleName || null,
            salutation: editForm.salutation || null,
            scheduledConfirmationDate: editForm.scheduledConfirmationDate || null,
            finalConfirmationDate: editForm.finalConfirmationDate || null,
            contractEndDate: editForm.contractEndDate || null,
            noticePeriodDays: editForm.noticePeriodDays ? Number(editForm.noticePeriodDays) : null,
            retirementDate: editForm.retirementDate || null,
            holidayCalendarId: editForm.holidayCalendarId || null,
            workEmail: editForm.workEmail || null,
            roleTitle: editForm.roleTitle || null,
          },
        },
      });
      setShowEdit(false);
      await Promise.all([refetchDetail(), refetchDetail()]);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not update employee');
    }
  };

  const onRecordAssessment = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    setDetailError(null);
    try {
      await recordAssessment({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            title: assessmentForm.title.trim(),
            assessmentDate: assessmentForm.assessmentDate,
            score: assessmentForm.score ? Number(assessmentForm.score) : null,
            assessorName: assessmentForm.assessorName || null,
            notes: assessmentForm.notes || null,
          },
        },
      });
      setAssessmentForm(emptyAssessmentForm);
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not record assessment');
    }
  };

  const onDocumentFileSelected = (file: File | null): void => {
    setDocumentFile(file);
    if (!file) return;
    setDocumentForm((current) => ({
      ...current,
      name: current.name.trim() ? current.name : file.name,
      // The browser knows the real type; the form default (application/pdf)
      // must not win over it.
      contentType: file.type || current.contentType,
      sizeBytes: String(file.size),
    }));
  };

  const onAttachDocument = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    if (!documentFile) {
      setDetailError('Choose a file before attaching the document');
      return;
    }
    const name = documentForm.name.trim() || documentFile.name;
    const contentType =
      documentForm.contentType.trim() || documentFile.type || 'application/octet-stream';
    setDetailError(null);
    setUploadingDocument(true);
    try {
      const result = await prepareDocumentUpload({
        variables: { input: { employeeId: detailEmployee.id, name, contentType } },
      });
      const access = result.data?.prepareEmployeeDocumentUpload;
      if (!access) {
        throw new Error('Could not prepare the upload');
      }
      await uploadToSignedUrl(access, documentFile);
      await attachDocument({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            name,
            contentType,
            storageKey: access.storageKey,
            sizeBytes: documentFile.size,
            category: documentForm.category,
            visibility: documentForm.visibility,
            classification: documentForm.classification,
            signatureStatus: documentForm.signatureStatus,
            signedAt: documentForm.signedAt ? `${documentForm.signedAt}T00:00:00.000Z` : null,
            signatureProvider: documentForm.signatureProvider || null,
            externalEnvelopeId: documentForm.externalEnvelopeId || null,
          },
        },
      });
      setDocumentForm(emptyDocumentForm);
      setDocumentFile(null);
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not attach document');
    } finally {
      setUploadingDocument(false);
    }
  };

  const onDocumentVersionFileSelected = (file: File | null): void => {
    setDocumentVersionFile(file);
    if (!file) return;
    setDocumentVersionForm((current) => ({
      ...current,
      contentType: file.type || current.contentType,
      sizeBytes: String(file.size),
    }));
  };

  const onAddDocumentVersion = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    if (!documentVersionFile) {
      setDetailError('Choose a file before adding the version');
      return;
    }
    const document = documents.find(
      (candidate) => candidate.id === documentVersionForm.employeeDocumentLinkId,
    );
    if (!document) {
      setDetailError('Select a document before adding a version');
      return;
    }
    const contentType =
      documentVersionForm.contentType.trim() ||
      documentVersionFile.type ||
      'application/octet-stream';
    setDetailError(null);
    setUploadingDocument(true);
    try {
      const result = await prepareDocumentUpload({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            name: `${document.name}-v${document.versionCount + 1}`,
            contentType,
          },
        },
      });
      const access = result.data?.prepareEmployeeDocumentUpload;
      if (!access) {
        throw new Error('Could not prepare the upload');
      }
      await uploadToSignedUrl(access, documentVersionFile);
      await addDocumentVersion({
        variables: {
          input: {
            employeeDocumentLinkId: documentVersionForm.employeeDocumentLinkId,
            contentType,
            storageKey: access.storageKey,
            sizeBytes: documentVersionFile.size,
            signatureStatus: documentVersionForm.signatureStatus,
            signedAt: documentVersionForm.signedAt
              ? `${documentVersionForm.signedAt}T00:00:00.000Z`
              : null,
            signatureProvider: documentVersionForm.signatureProvider || null,
            externalEnvelopeId: documentVersionForm.externalEnvelopeId || null,
          },
        },
      });
      setDocumentVersionForm(emptyDocumentVersionForm);
      setDocumentVersionFile(null);
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not add document version');
    } finally {
      setUploadingDocument(false);
    }
  };

  const onLoadDocumentAccess = async (document: EmployeeDocumentRecord): Promise<void> => {
    setDetailError(null);
    try {
      const result = await loadDocumentDownloadAccess({
        variables: { employeeDocumentLinkId: document.id },
      });
      const access = result.data?.employeeDocumentDownloadAccess;
      if (access) {
        setDocumentAccesses((current) => ({ ...current, [document.id]: access }));
      }
    } catch (caught) {
      setDetailError(
        caught instanceof Error ? caught.message : 'Could not prepare download access',
      );
    }
  };

  const onRequestDocumentSignature = async (document: EmployeeDocumentRecord): Promise<void> => {
    if (!detailEmployee?.workEmail) {
      setDetailError('A work email is required before requesting e-signature');
      return;
    }
    setDetailError(null);
    try {
      const result = await requestDocumentSignature({
        variables: {
          input: {
            employeeDocumentLinkId: document.id,
            signerEmail: detailEmployee.workEmail,
            signerName: fullName(detailEmployee),
            provider: 'manual',
          },
        },
      });
      const signatureRequest = result.data?.requestEmployeeDocumentSignature;
      if (signatureRequest) {
        setSignatureRequests((current) => ({ ...current, [document.id]: signatureRequest }));
      }
      await refetchDetail();
    } catch (caught) {
      setDetailError(
        caught instanceof Error ? caught.message : 'Could not request document signature',
      );
    }
  };

  const onReviseSalary = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    const annualAmount = Number(salaryRevisionForm.annualAmount);
    if (!salaryRevisionForm.salaryStructureId) {
      setDetailError('Select a salary structure before saving the adjustment');
      return;
    }
    if (!Number.isFinite(annualAmount) || annualAmount <= 0) {
      setDetailError('Salary amount must be greater than zero');
      return;
    }
    setDetailError(null);
    try {
      const result = await reviseSalary({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            salaryStructureId: salaryRevisionForm.salaryStructureId,
            effectiveDate: salaryRevisionForm.effectiveDate,
            annualAmount,
            reason: salaryRevisionForm.reason,
            note: salaryRevisionForm.note || null,
          },
        },
      });
      const revision = result.data?.reviseSalary;
      setSalaryRevisionForm((current) => ({
        ...current,
        salaryStructureId: revision?.salaryStructureId ?? current.salaryStructureId,
        effectiveDate: todayDateKey(),
        annualAmount: revision ? String(revision.annualAmount) : current.annualAmount,
        reason: 'merit',
        note: '',
      }));
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not revise salary');
    }
  };

  const onAwardBonus = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    setDetailError(null);
    try {
      await awardBonus({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            awardDate: bonusForm.awardDate,
            currency: bonusForm.currency,
            amount: Number(bonusForm.amount),
            reason: bonusForm.reason,
            note: bonusForm.note || null,
          },
        },
      });
      setBonusForm(emptyBonusForm);
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not award bonus');
    }
  };

  const onSaveHrRecord = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    setDetailError(null);
    try {
      await updateHrRecord({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            roleTitle: hrRecordForm.roleTitle || null,
            salaryBreakdown: hrRecordForm.salaryBreakdown || null,
            paymentMode: hrRecordForm.paymentMode || null,
            bankName: hrRecordForm.bankName || null,
            bankAccountTitle: hrRecordForm.bankAccountTitle || null,
            bankAccountNumber: hrRecordForm.bankAccountNumber || null,
            bankIban: hrRecordForm.bankIban || null,
            hardwareInfo: hrRecordForm.hardwareInfo || null,
            employeeRecordForm: hrRecordForm.employeeRecordForm || null,
          },
        },
      });
      // Bank details feed the derived onboarding task and the aggregate, so
      // both onboarding reads refresh alongside the record itself.
      await Promise.all([
        refetchHrRecord(),
        refetchDetail(),
        refetchOnboardingTasks(),
        refetchOnboardingProgress(),
      ]);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not save HR record');
    }
  };

  const onSeparate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee) return;
    const confirmed = await confirm({
      title: 'Separate this employee?',
      body: 'The employee will be marked as terminated and offboarding tasks will be created.',
      confirmLabel: 'Separate',
      tone: 'danger',
    });
    if (!confirmed) return;
    setDetailError(null);
    try {
      await separateEmployee({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            type: separationForm.type,
            effectiveDate: separationForm.effectiveDate,
            reason: separationForm.reason || undefined,
            resignationLetterDate: separationForm.resignationLetterDate || undefined,
            relievingDate: separationForm.relievingDate || undefined,
            newWorkplace: separationForm.newWorkplace || undefined,
            feedback: separationForm.feedback || undefined,
            leaveEncashed: separationForm.leaveEncashed,
          },
        },
      });
      setShowSeparation(false);
      await Promise.all([refetchDetail(), refetchDetail()]);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not record separation');
    }
  };

  const onSaveOffboardingTask = async (task: OffboardingTaskRecord): Promise<void> => {
    if (!detailEmployee) return;
    const draft = offboardingDrafts[task.taskKey];
    if (!draft) return;
    setDetailError(null);
    try {
      await updateOffboardingTask({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            taskKey: task.taskKey,
            status: draft.status,
            dueDate: draft.dueDate || null,
            notes: draft.notes || null,
          },
        },
      });
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not save offboarding task');
    }
  };

  const onUpsertExitInterview = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!detailEmployee || separations.length === 0) return;
    const separationId = separations[0]?.id;
    if (!separationId) return;
    setDetailError(null);
    try {
      await upsertExitInterview({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            separationId,
            status: exitInterviewForm.status,
            scheduledDate: exitInterviewForm.scheduledDate || undefined,
            summary: exitInterviewForm.summary || undefined,
            finalDecision: exitInterviewForm.finalDecision || undefined,
          },
        },
      });
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not save exit interview');
    }
  };

  const onCreateLogin = async (): Promise<void> => {
    if (!detailEmployee) return;
    setDetailError(null);
    try {
      await createWorkspaceUser({
        variables: {
          input: {
            email: detailEmployee?.workEmail ?? `${detailEmployee.employeeNumber}@example.com`,
            password: 'Temp1234!',
            employeeId: detailEmployee.id,
            roleId: undefined,
          },
        },
      });
      setDetailError('Login created for ' + detailEmployee.employeeNumber);
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not create login');
    }
  };

  const onSaveOnboardingTask = async (task: EmployeeOnboardingTask): Promise<void> => {
    if (!detailEmployee) return;
    const draft = onboardingDrafts[task.taskKey];
    if (!draft) return;
    setDetailError(null);
    try {
      await updateOnboardingTask({
        variables: {
          input: {
            employeeId: detailEmployee.id,
            taskKey: task.taskKey,
            status: draft.status,
            dueDate: draft.dueDate || null,
            notes: draft.notes || null,
          },
        },
      });
        await refetchOnboardingTasks();
        await refetchOnboardingProgress();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not save onboarding task');
    }
  };

  const onChangePhoto = (file: File): void => {
    if (!detailEmployee) return;
    if (file.size > 300_000) {
      setDetailError('Image must be under 300\u00A0KB.');
      return;
    }
    setDetailError(null);
    setPhotoNotice(null);
    const reader = new FileReader();
    reader.onload = () => {
      void updatePhoto({
        variables: { input: { employeeId: detailEmployee.id, photoUrl: String(reader.result) } },
      })
        .then(async () => {
          await refetchDetail();
          setPhotoNotice('Photo updated');
        })
        .catch((caught: unknown) =>
          setDetailError(caught instanceof Error ? caught.message : 'Could not save photo'),
        );
    };
    reader.readAsDataURL(file);
  };

  const onSetManager = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setDetailError(null);
    try {
      await setEmployeeManager({
        variables: {
          input: {
            employeeId,
            reportsToEmployeeId: managerForm.reportsToEmployeeId || null,
            effectiveDate: managerForm.effectiveDate,
          },
        },
      });
      await refetchDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Could not update the manager');
    }
  };

  const renderAccessDescriptor = (access: DocumentAccessDescriptor, title: string): JSX.Element => (
    <div className="document-access-note">
      <div className="document-access-title">{title}</div>
      <div className="document-access-line">
        <span>{access.method}</span>
        <code>{access.url}</code>
      </div>
      <div className="employee-secondary">Storage {access.storageKey}</div>
      <div className="employee-secondary">Expires {formatDateTime(access.expiresAt)}</div>
      {access.headers.length > 0 ? (
        <div className="employee-secondary">
          Headers {access.headers.map((header) => `${header.name}: ${header.value}`).join(', ')}
        </div>
      ) : null}
    </div>
  );

  const renderSignatureRequest = (request: DocumentSignatureRequestRecord): JSX.Element => (
    <div className="document-access-note">
      <div className="document-access-title">Signature request</div>
      <div className="document-access-line">
        <span>{request.signatureProvider}</span>
        <code>{request.signingUrl}</code>
      </div>
      <div className="employee-secondary">
        Envelope {request.externalEnvelopeId} · Expires {formatDateTime(request.expiresAt)}
      </div>
    </div>
  );

  if (!detailEmployee) {
    return (
      <section className="profile-page">
        <div className="detail-panel-empty">
          <IconUserCheck aria-hidden="true" size={theme.icon.size.xl} stroke={theme.icon.stroke.md} />
          <p>{detailLoading ? 'Loading employee…' : 'This employee could not be found.'}</p>
          <Link className="button button-secondary" to="/employees">
            Back to employees
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <Link className="profile-back" to="/employees">
        <IconArrowLeft aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        Employees
      </Link>

      <div className="profile-frame">
        {/* Identity column: never scrolls out of view, so who you are looking at
            and their headline facts stay put while you move between tabs. */}
        <aside className="profile-identity" aria-label="Employee identity">
              <div className="employee-photo-slot">
                {profile?.photoUrl ? (
                  <img
                    alt=""
                    className="employee-identity-photo"
                    fetchPriority="high"
                    height={40}
                    src={profile.photoUrl}
                    width={40}
                  />
                ) : (
                  <span className="employee-avatar" style={chipStyle(colorFor(detailEmployee.id))}>
                    {initials(detailEmployee)}
                  </span>
                )}
                {canManageHrRecord ? (
                  <label
                    className={`employee-photo-edit${savingPhoto ? ' is-saving' : ''}`}
                    htmlFor="employee-photo-input"
                    title={savingPhoto ? 'Saving photo…' : 'Change photo'}
                  >
                    {savingPhoto ? (
                      <IconLoader2 aria-hidden="true"
                        className="icon-spin"
                        size={theme.icon.size.sm}
                        stroke={theme.icon.stroke.sm}
                      />
                    ) : (
                      <IconCamera aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                    )}
                    <input
                      accept="image/*"
                      disabled={savingPhoto}
                      id="employee-photo-input"
                      name="employee-photo-input"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onChangePhoto(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>
          <h1 className="profile-name">{fullName(detailEmployee)}</h1>
          <div className="employee-meta">{detailEmployee.employeeNumber}</div>
          <StatusChip
            className="profile-identity-status"
            color={statusColors[detailEmployee.employmentStatus]}
            label={statusLabels[detailEmployee.employmentStatus]}
          />

          {photoNotice ? (
            <p className="form-success" role="status">
              {photoNotice}
            </p>
          ) : null}

          <div className="field-list profile-identity-facts">
            <div className="field-row">
              <span className="field-label">Role</span>
              <span className="field-value">{detailEmployee.roleTitle ?? '—'}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Worker type</span>
              <span className="field-value">{workerTypeLabels[detailEmployee.workerType]}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Hire date</span>
              <span className="field-value">{formatDate(detailEmployee.hireDate)}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Days since joining</span>
              <span className="field-value">{daysSince(detailEmployee.hireDate)}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Department</span>
              <span className="field-value">
                {detailEmployee.currentAssignment?.departmentName ?? '—'}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Manager</span>
              <span className="field-value">
                {detailEmployee.currentAssignment?.reportsToName ?? '—'}
              </span>
            </div>
          </div>
        </aside>

        <section className="profile-content">
          <nav className="profile-tabs" aria-label="Employee record sections">
            {PROFILE_TABS.map((entry) => (
              <button
                aria-current={tab === entry.key}
                className={`profile-tab${tab === entry.key ? ' is-active' : ''}`}
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          {detailLoading ? <p className="page-subtitle">Loading employee details…</p> : null}
          {detailError ? (
            <p className="auth-error" role="alert">
              {detailError}
            </p>
          ) : null}

          {tab === 'profile' ? (
            <>
            <DetailSection defaultOpen title="Employment">
              {canEditHrRecord ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginBottom: theme.spacing(3),
                  }}
                >
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setShowEdit((current) => !current)}
                  >
                    {showEdit ? 'Cancel' : 'Edit'}
                  </button>
                </div>
              ) : null}
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Status</span>
                  <StatusChip
                    color={statusColors[detailEmployee.employmentStatus]}
                    label={statusLabels[detailEmployee.employmentStatus]}
                  />
                </div>
                <div className="field-row">
                  <span className="field-label">Worker type</span>
                  <span className="field-value">{workerTypeLabels[detailEmployee.workerType]}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Role</span>
                  <span className="field-value">{detailEmployee.roleTitle ?? 'Not set'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Hire date</span>
                  <span className="field-value">{formatDate(detailEmployee.hireDate)}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Days since joining</span>
                  <span className="field-value">{daysSince(detailEmployee.hireDate)}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Probation</span>
                  <span className="field-value">
                    {detailEmployee.probationEndDate
                      ? `${daysUntil(detailEmployee.probationEndDate)} days left`
                      : 'Not set'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Date of birth</span>
                  <span className="field-value">
                    {detailEmployee.dateOfBirth ? formatDate(detailEmployee.dateOfBirth) : '-'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Work email</span>
                  <span className="field-value">{detailEmployee.workEmail ?? '-'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Phone</span>
                  <span className="field-value">{profile?.phone ?? '-'}</span>
                </div>
                {detailEmployee.middleName ? (
                  <div className="field-row">
                    <span className="field-label">Middle name</span>
                    <span className="field-value">{detailEmployee.middleName}</span>
                  </div>
                ) : null}
                {detailEmployee.salutation ? (
                  <div className="field-row">
                    <span className="field-label">Salutation</span>
                    <span className="field-value">{detailEmployee.salutation}</span>
                  </div>
                ) : null}
                {detailEmployee.scheduledConfirmationDate ? (
                  <div className="field-row">
                    <span className="field-label">Scheduled confirmation</span>
                    <span className="field-value">{formatDate(detailEmployee.scheduledConfirmationDate)}</span>
                  </div>
                ) : null}
                {detailEmployee.contractEndDate ? (
                  <div className="field-row">
                    <span className="field-label">Contract end</span>
                    <span className="field-value">{formatDate(detailEmployee.contractEndDate)}</span>
                  </div>
                ) : null}
                {detailEmployee.noticePeriodDays !== null ? (
                  <div className="field-row">
                    <span className="field-label">Notice period</span>
                    <span className="field-value">{detailEmployee.noticePeriodDays} days</span>
                  </div>
                ) : null}
              </div>
              {showEdit && canEditHrRecord ? (
                <form className="config-form compact-form" onSubmit={onUpdateEmployee} style={{ marginTop: theme.spacing(3) }}>
                  <div className="field-group">
                    <div className="field"><label htmlFor="edit-middle">Middle name</label><input id="edit-middle" name="edit-middle" value={editForm.middleName} onChange={(e) => setEditForm((c) => ({ ...c, middleName: e.target.value }))} /></div>
                    <div className="field"><label htmlFor="edit-salutation">Salutation</label><select id="edit-salutation" name="edit-salutation" value={editForm.salutation} onChange={(e) => setEditForm((c) => ({ ...c, salutation: e.target.value }))}><option value="">—</option><option value="Mr">Mr</option><option value="Ms">Ms</option><option value="Mrs">Mrs</option><option value="Mx">Mx</option><option value="Dr">Dr</option><option value="Prof">Prof</option></select></div>
                  </div>
                  <div className="field-group">
                    <div className="field"><label htmlFor="edit-scheduled">Scheduled confirmation</label><input id="edit-scheduled" name="edit-scheduled" type="date" value={editForm.scheduledConfirmationDate} onChange={(e) => setEditForm((c) => ({ ...c, scheduledConfirmationDate: e.target.value }))} /></div>
                    <div className="field"><label htmlFor="edit-final">Final confirmation</label><input id="edit-final" name="edit-final" type="date" value={editForm.finalConfirmationDate} onChange={(e) => setEditForm((c) => ({ ...c, finalConfirmationDate: e.target.value }))} /></div>
                  </div>
                  <div className="field-group">
                    <div className="field"><label htmlFor="edit-contract">Contract end</label><input id="edit-contract" name="edit-contract" type="date" value={editForm.contractEndDate} onChange={(e) => setEditForm((c) => ({ ...c, contractEndDate: e.target.value }))} /></div>
                    <div className="field"><label htmlFor="edit-notice">Notice days</label><input id="edit-notice" name="edit-notice" type="number" min={0} value={editForm.noticePeriodDays} onChange={(e) => setEditForm((c) => ({ ...c, noticePeriodDays: e.target.value }))} /></div>
                  </div>
                  <div className="field"><label htmlFor="edit-retirement">Retirement date</label><input id="edit-retirement" name="edit-retirement" type="date" value={editForm.retirementDate} onChange={(e) => setEditForm((c) => ({ ...c, retirementDate: e.target.value }))} /></div>
                  <div className="field"><label htmlFor="edit-workemail">Work email</label><input id="edit-workemail" name="edit-workemail" type="email" value={editForm.workEmail} onChange={(e) => setEditForm((c) => ({ ...c, workEmail: e.target.value }))} /></div>
                  <div className="field"><label htmlFor="edit-role">Role</label><input id="edit-role" name="edit-role" value={editForm.roleTitle} onChange={(e) => setEditForm((c) => ({ ...c, roleTitle: e.target.value }))} /></div>
                  <button className="button button-primary" type="submit" disabled={updatingEmployee}>{updatingEmployee ? 'Saving…' : 'Save changes'}</button>
                </form>
              ) : null}
            </DetailSection>

            <DetailSection title="Organization">
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Department</span>
                  <span className="field-value">{detailEmployee.currentAssignment?.departmentName ?? 'Not assigned'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Designation</span>
                  <span className="field-value">{detailEmployee.currentAssignment?.positionTitle ?? detailEmployee.roleTitle ?? '-'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Location</span>
                  <span className="field-value">{detailEmployee.currentAssignment?.locationName ?? '-'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Manager</span>
                  <span className="field-value">
                    {detailEmployee.currentAssignment?.reportsToName ?? 'Not set'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Assignment type</span>
                  <span className="field-value">{detailEmployee.currentAssignment?.assignmentType ?? '-'}</span>
                </div>
              </div>
              {canEditHrRecord ? (
                <form
                  className="manager-picker"
                  onSubmit={(event) => void onSetManager(event)}
                >
                  <div className="onboarding-field-pair">
                    <div className="field">
                      <label htmlFor="manager-select">Reports to</label>
                      <select
                        id="manager-select"
                        name="manager-select"
                        value={managerForm.reportsToEmployeeId}
                        onChange={(event) =>
                          setManagerForm((current) => ({
                            ...current,
                            reportsToEmployeeId: event.target.value,
                          }))
                        }
                      >
                        <option value="">No manager (top of the chart)</option>
                        {managerOptions.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.firstName} {candidate.lastName}
                            {candidate.roleTitle ? ` — ${candidate.roleTitle}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="manager-effective">Effective from</label>
                      <input
                        id="manager-effective"
                        name="manager-effective"
                        required
                        type="date"
                        value={managerForm.effectiveDate}
                        onChange={(event) =>
                          setManagerForm((current) => ({
                            ...current,
                            effectiveDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <p className="field-hint">
                    Changing the manager ends the current reporting line and starts a new one, so
                    past history is kept.
                  </p>
                  <button className="button button-secondary" disabled={savingManager} type="submit">
                    <IconDeviceFloppy aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {savingManager ? 'Saving…' : 'Update manager'}
                  </button>
                </form>
              ) : null}

              {detailEmployee.assignmentHistory && detailEmployee.assignmentHistory.length > 1 ? (
                <div style={{ marginTop: theme.spacing(3) }}>
                  <div className="field-label" style={{ marginBottom: theme.spacing(2) }}>Assignment history ({detailEmployee.assignmentHistory.length})</div>
                  <div className="record-list">
                    {detailEmployee.assignmentHistory.map((history) => (
                      <div className="record-item" key={history.id}>
                        <div>
                          <div className="employee-primary">{history.positionTitle ?? 'Assignment'} {history.departmentName ? `· ${history.departmentName}` : ''}</div>
                          <div className="employee-secondary">{formatDate(history.validFrom)} - {history.validTo ? formatDate(history.validTo) : 'Present'} {history.reportsToName ? `· Reports to ${history.reportsToName}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </DetailSection>

            <DetailSection title="Contact & emergency">
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Preferred contact</span>
                  <span className="field-value">{profile?.preferredContactChannel ?? '-'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Emergency contact</span>
                  <span className="field-value">{profile?.emergencyContactName ? `${profile.emergencyContactName} (${profile.emergencyContactRelation ?? '-'}) - ${profile.emergencyContactPhone ?? '-'}` : '-'}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Permanent address</span>
                  <span className="field-value">{profile?.permanentAddressLine1 ? `${profile.permanentAddressLine1}, ${profile.permanentCity ?? ''}` : '-'}</span>
                </div>
              </div>
            </DetailSection>

            {personalDetails ? (
              <DetailSection title="Personal details">
                <div className="field-list">
                  <div className="field-row"><span className="field-label">Passport</span><span className="field-value">{personalDetails.passportNumber ?? '-'}</span></div>
                  <div className="field-row"><span className="field-label">Marital status</span><span className="field-value">{personalDetails.maritalStatus ?? '-'}</span></div>
                  <div className="field-row"><span className="field-label">Blood group</span><span className="field-value">{personalDetails.bloodGroup ?? '-'}</span></div>
                  <div className="field-row"><span className="field-label">Bio</span><span className="field-value">{personalDetails.bio ?? '-'}</span></div>
                </div>
              </DetailSection>
            ) : null}

            {educations.length > 0 ? (
              <DetailSection title={`Education (${educations.length})`}>
                <div className="record-list">
                  {educations.map((edu) => (
                    <div className="record-item" key={edu.id}>
                      <div>
                        <div className="employee-primary">{edu.qualification} — {edu.schoolOrUniversity}</div>
                        <div className="employee-secondary">{edu.level} {edu.yearOfPassing ? `· ${edu.yearOfPassing}` : ''} {edu.majorSubjects ? `· ${edu.majorSubjects}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSection>
            ) : null}

            {workHistories.length > 0 ? (
              <DetailSection title={`External work history (${workHistories.length})`}>
                <div className="record-list">
                  {workHistories.map((history) => (
                    <div className="record-item" key={history.id}>
                      <div>
                        <div className="employee-primary">{history.companyName} {history.designation ? `— ${history.designation}` : ''}</div>
                        <div className="employee-secondary">{history.totalExperience ?? ''} {history.salary ? `· Salary ${history.salary}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSection>
            ) : null}
            </>
          ) : null}

          {tab === 'pay' ? (
            <>
            <EmployeeJobPayHub
              canApproveBankChanges={canEditHrRecord}
              canViewBilling={canViewBilling}
              canViewPayroll={canViewPayroll}
              canViewSalaryHistory={canViewCompensationHistory}
              currency={salary?.currency ?? 'PKR'}
              employeeId={employeeId}
            />
            {canEditHrRecord ? (
              <DetailSection title="Tethr HR record">
                {hrRecordLoading ? (
                  <p className="page-subtitle">Loading private HR record…</p>
                ) : null}
                <form className="config-form compact-form" onSubmit={onSaveHrRecord}>
                  <div className="field">
                    <label htmlFor="hr-role">Role</label>
                    <input
                      id="hr-role"
                      name="hr-role"
                      maxLength={160}
                      value={hrRecordForm.roleTitle}
                      onChange={(event) =>
                        setHrRecordForm((current) => ({
                          ...current,
                          roleTitle: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="hr-salary-breakdown">Salary breakdown</label>
                    <textarea
                      id="hr-salary-breakdown"
                      name="hr-salary-breakdown"
                      maxLength={8000}
                      value={hrRecordForm.salaryBreakdown}
                      onChange={(event) =>
                        setHrRecordForm((current) => ({
                          ...current,
                          salaryBreakdown: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="hr-payment-mode">Payment mode</label>
                      <select
                        id="hr-payment-mode"
                        name="hr-payment-mode"
                        value={hrRecordForm.paymentMode}
                      onChange={(event) =>
                        setHrRecordForm((current) => ({
                          ...current,
                          paymentMode: event.target.value,
                        }))
                      }
                    >
                      <option value="">—</option>
                      <option value="bank">Bank</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="hr-bank-name">Bank</label>
                      <input
                        id="hr-bank-name"
                        name="hr-bank-name"
                        maxLength={160}
                        value={hrRecordForm.bankName}
                        onChange={(event) =>
                          setHrRecordForm((current) => ({
                            ...current,
                            bankName: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hr-bank-title">Account title</label>
                      <input
                        id="hr-bank-title"
                        name="hr-bank-title"
                        maxLength={160}
                        value={hrRecordForm.bankAccountTitle}
                        onChange={(event) =>
                          setHrRecordForm((current) => ({
                            ...current,
                            bankAccountTitle: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="hr-bank-account">Account number</label>
                      <input
                        id="hr-bank-account"
                        name="hr-bank-account"
                        maxLength={80}
                        value={hrRecordForm.bankAccountNumber}
                        onChange={(event) =>
                          setHrRecordForm((current) => ({
                            ...current,
                            bankAccountNumber: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hr-bank-iban">IBAN</label>
                      <input
                        id="hr-bank-iban"
                        name="hr-bank-iban"
                        maxLength={80}
                        value={hrRecordForm.bankIban}
                        onChange={(event) =>
                          setHrRecordForm((current) => ({
                            ...current,
                            bankIban: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="hr-hardware">Hardware</label>
                    <textarea
                      id="hr-hardware"
                      name="hr-hardware"
                      maxLength={8000}
                      value={hrRecordForm.hardwareInfo}
                      onChange={(event) =>
                        setHrRecordForm((current) => ({
                          ...current,
                          hardwareInfo: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="hr-employee-form">Employee record form</label>
                    <textarea
                      id="hr-employee-form"
                      name="hr-employee-form"
                      maxLength={20000}
                      value={hrRecordForm.employeeRecordForm}
                      onChange={(event) =>
                        setHrRecordForm((current) => ({
                          ...current,
                          employeeRecordForm: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={savingHrRecord}
                    type="submit"
                  >
                    <IconDeviceFloppy aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {savingHrRecord ? 'Saving…' : 'Save HR record'}
                  </button>
                </form>
              </DetailSection>
            ) : null}
            <DetailSection
              badge={
                salary ? (
                  <span className="table-density">{formatMoney(salary.annualAmount, salary.currency)}</span>
                ) : undefined
              }
              title="Compensation"
            >
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Current salary</span>
                  <span className="field-value">
                    {salary ? formatMoney(salary.annualAmount, salary.currency) : '-'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Monthly salary</span>
                  <span className="field-value">
                    {salary ? formatMoney(salary.annualAmount / 12, salary.currency) : '-'}
                  </span>
                </div>
              </div>
              {canReviseSalary ? (
                <form className="config-form compact-form" onSubmit={onReviseSalary}>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="salary-structure">Salary structure</label>
                      <select
                        disabled={loadingSalaryStructures || availableSalaryStructures.length === 0}
                        id="salary-structure"
                        name="salary-structure"
                        required
                        value={salaryRevisionForm.salaryStructureId}
                        onChange={(event) =>
                          setSalaryRevisionForm((current) => ({
                            ...current,
                            salaryStructureId: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {loadingSalaryStructures ? 'Loading…' : 'Select structure'}
                        </option>
                        {availableSalaryStructures.map((structure) => (
                          <option key={structure.id} value={structure.id}>
                            {structure.code} · {structure.currency}
                          </option>
                        ))}
                      </select>
                      {!loadingSalaryStructures && availableSalaryStructures.length === 0 ? (
                        <p className="field-hint field-hint-warning">
                          No salary structures are configured yet.{' '}
                          <Link className="table-link" to="/compensation">
                            Create one in Pay
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    <div className="field">
                      <label htmlFor="salary-annual">New annual salary</label>
                      <input
                        id="salary-annual"
                        name="salary-annual"
                        min="0.01"
                        required
                        step="0.01"
                        type="number"
                        value={salaryRevisionForm.annualAmount}
                        onChange={(event) =>
                          setSalaryRevisionForm((current) => ({
                            ...current,
                            annualAmount: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="salary-effective">Effective date</label>
                      <input
                        id="salary-effective"
                        name="salary-effective"
                        required
                        type="date"
                        value={salaryRevisionForm.effectiveDate}
                        onChange={(event) =>
                          setSalaryRevisionForm((current) => ({
                            ...current,
                            effectiveDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="salary-reason">Reason</label>
                      <select
                        id="salary-reason"
                        name="salary-reason"
                        value={salaryRevisionForm.reason}
                        onChange={(event) =>
                          setSalaryRevisionForm((current) => ({
                            ...current,
                            reason: event.target.value as CompensationChangeReason,
                          }))
                        }
                      >
                        {Object.entries(compensationReasonLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="salary-note">Note</label>
                      <textarea
                        id="salary-note"
                        name="salary-note"
                        value={salaryRevisionForm.note}
                      onChange={(event) =>
                        setSalaryRevisionForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={revisingSalary || availableSalaryStructures.length === 0}
                    type="submit"
                  >
                    <IconCurrencyDollar aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {revisingSalary ? 'Saving…' : 'Save salary adjustment'}
                  </button>
                </form>
              ) : null}
              <div className="record-list">
                {bonuses.slice(0, 3).map((bonus) => (
                  <div className="record-item" key={bonus.id}>
                    <IconGift aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    <div>
                      <div className="employee-primary">
                        {formatMoney(bonus.amount, bonus.currency)}
                      </div>
                      <div className="employee-secondary">
                        {formatDate(bonus.awardDate)} · {bonus.reason}
                      </div>
                    </div>
                  </div>
                ))}
                {bonuses.length === 0 ? <p className="table-empty">No bonuses recorded.</p> : null}
              </div>
              {canAwardBonus ? (
                <form className="config-form compact-form" onSubmit={onAwardBonus}>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="bonus-date">Date</label>
                      <input
                        id="bonus-date"
                        name="bonus-date"
                        required
                        type="date"
                        value={bonusForm.awardDate}
                        onChange={(event) =>
                          setBonusForm((current) => ({
                            ...current,
                            awardDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="bonus-amount">Amount</label>
                      <input
                        id="bonus-amount"
                        name="bonus-amount"
                        required
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={bonusForm.amount}
                        onChange={(event) =>
                          setBonusForm((current) => ({ ...current, amount: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="bonus-currency">Currency</label>
                      <input
                        id="bonus-currency"
                        name="bonus-currency"
                        maxLength={3}
                        required
                        value={bonusForm.currency}
                        onChange={(event) =>
                          setBonusForm((current) => ({
                            ...current,
                            currency: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="bonus-reason">Reason</label>
                      <select
                        id="bonus-reason"
                        name="bonus-reason"
                        value={bonusForm.reason}
                        onChange={(event) =>
                          setBonusForm((current) => ({ ...current, reason: event.target.value }))
                        }
                      >
                        <option value="clientApproved">Client approved</option>
                        <option value="performance">Performance</option>
                        <option value="retention">Retention</option>
                        <option value="referral">Referral</option>
                        <option value="spot">Spot</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="bonus-note">Note</label>
                      <textarea
                        id="bonus-note"
                        name="bonus-note"
                        value={bonusForm.note}
                      onChange={(event) =>
                        setBonusForm((current) => ({ ...current, note: event.target.value }))
                      }
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={awardingBonus}
                    type="submit"
                  >
                    <IconGift aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {awardingBonus ? 'Saving…' : 'Award bonus'}
                  </button>
                </form>
              ) : null}
            </DetailSection>
            </>
          ) : null}

          {tab === 'documents' ? (
            <>
            <DetailSection
              badge={
                documents.length > 0 ? (
                  <span className="table-density">{documents.length} on file</span>
                ) : undefined
              }
              title="Documents"
            >
              <div className="record-list">
                {documents.map((document) => {
                  const downloadAccess = documentAccesses[document.id];
                  const signatureRequest = signatureRequests[document.id];
                  return (
                    <div className="record-item" key={document.id}>
                      <IconFileText aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                      <div>
                        <div className="employee-primary">{document.name}</div>
                        <div className="employee-secondary">
                          {document.category} · {document.visibility} · {document.classification} ·
                          v{document.latestVersionNumber} of {document.versionCount}
                        </div>
                        <div className="employee-secondary">{document.latestStorageKey}</div>
                        <div className="record-inline-actions">
                          <StatusChip
                            color={signatureStatusColors[document.signatureStatus]}
                            label={signatureStatusLabels[document.signatureStatus]}
                          />
                          {document.signedAt ? (
                            <span className="employee-secondary">
                              Signed {formatDate(document.signedAt.slice(0, 10))}
                            </span>
                          ) : null}
                          <button
                            className="button button-secondary"
                            disabled={loadingDocumentDownloadAccess}
                            type="button"
                            onClick={() => void onLoadDocumentAccess(document)}
                          >
                            <IconDownload aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                            Download URL
                          </button>
                          {canAttachDocument ? (
                            <button
                              className="button button-secondary"
                              disabled={requestingDocumentSignature || !detailEmployee.workEmail}
                              type="button"
                              onClick={() => void onRequestDocumentSignature(document)}
                            >
                              <IconSignature aria-hidden="true"
                                size={theme.icon.size.sm}
                                stroke={theme.icon.stroke.sm}
                              />
                              Request e-sign
                            </button>
                          ) : null}
                          {canAttachDocument ? (
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => {
                                setDocumentVersionFile(null);
                                setDocumentVersionForm({
                                  ...emptyDocumentVersionForm,
                                  employeeDocumentLinkId: document.id,
                                  contentType: document.contentType,
                                  sizeBytes: String(document.sizeBytes),
                                  signatureStatus: document.signatureStatus,
                                });
                              }}
                            >
                              New version
                            </button>
                          ) : null}
                        </div>
                        {downloadAccess
                          ? renderAccessDescriptor(downloadAccess, 'Download access')
                          : null}
                        {signatureRequest ? renderSignatureRequest(signatureRequest) : null}
                      </div>
                    </div>
                  );
                })}
                {documents.length === 0 ? (
                  <p className="table-empty">No client-visible documents yet.</p>
                ) : null}
              </div>
              {canAttachDocument && documents.length > 0 ? (
                <form className="config-form compact-form" onSubmit={onAddDocumentVersion}>
                  <div className="field">
                    <label htmlFor="document-version-link">Document</label>
                      <select
                        id="document-version-link"
                        name="document-version-link"
                        required
                      value={documentVersionForm.employeeDocumentLinkId}
                      onChange={(event) => {
                        const selectedDocument = documents.find(
                          (document) => document.id === event.target.value,
                        );
                        setDocumentVersionForm((current) => ({
                          ...current,
                          employeeDocumentLinkId: event.target.value,
                          contentType: selectedDocument?.contentType ?? current.contentType,
                          sizeBytes:
                            selectedDocument !== undefined
                              ? String(selectedDocument.sizeBytes)
                              : current.sizeBytes,
                          signatureStatus:
                            selectedDocument?.signatureStatus ?? current.signatureStatus,
                        }));
                        setDocumentVersionFile(null);
                      }}
                    >
                      <option value="">Select document</option>
                      {documents.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="document-version-file">File</label>
                      <input
                        id="document-version-file"
                        name="document-version-file"
                        required
                      type="file"
                      onChange={(event) =>
                        onDocumentVersionFileSelected(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-version-content-type">Content type</label>
                      <input
                        id="document-version-content-type"
                        name="document-version-content-type"
                        required
                        value={documentVersionForm.contentType}
                        onChange={(event) =>
                          setDocumentVersionForm((current) => ({
                            ...current,
                            contentType: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="document-version-size">Size bytes</label>
                      <input
                        id="document-version-size"
                        name="document-version-size"
                        readOnly
                        type="number"
                        value={documentVersionForm.sizeBytes}
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-version-signature">Signature</label>
                      <select
                        id="document-version-signature"
                        name="document-version-signature"
                        value={documentVersionForm.signatureStatus}
                        onChange={(event) =>
                          setDocumentVersionForm((current) => ({
                            ...current,
                            signatureStatus: event.target.value,
                          }))
                        }
                      >
                        {Object.entries(signatureStatusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="document-version-signed-at">Signed date</label>
                      <input
                        id="document-version-signed-at"
                        name="document-version-signed-at"
                        type="date"
                        value={documentVersionForm.signedAt}
                        onChange={(event) =>
                          setDocumentVersionForm((current) => ({
                            ...current,
                            signedAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-version-provider">Signature provider</label>
                      <input
                        id="document-version-provider"
                        name="document-version-provider"
                        maxLength={80}
                        value={documentVersionForm.signatureProvider}
                        onChange={(event) =>
                          setDocumentVersionForm((current) => ({
                            ...current,
                            signatureProvider: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="document-version-envelope">Envelope ID</label>
                      <input
                        id="document-version-envelope"
                        name="document-version-envelope"
                        maxLength={160}
                        value={documentVersionForm.externalEnvelopeId}
                        onChange={(event) =>
                          setDocumentVersionForm((current) => ({
                            ...current,
                            externalEnvelopeId: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={addingDocumentVersion || uploadingDocument}
                    type="submit"
                  >
                    <IconFileText aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {uploadingDocument
                      ? 'Uploading…'
                      : addingDocumentVersion
                        ? 'Adding…'
                        : 'Add version'}
                  </button>
                </form>
              ) : null}
              {canAttachDocument ? (
                <form className="config-form compact-form" onSubmit={onAttachDocument}>
                  <div className="field">
                    <label htmlFor="document-name">Name</label>
                      <input
                        id="document-name"
                        name="document-name"
                        required
                      value={documentForm.name}
                      onChange={(event) =>
                        setDocumentForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="document-file">File</label>
                      <input
                        id="document-file"
                        name="document-file"
                        required
                      type="file"
                      onChange={(event) => onDocumentFileSelected(event.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-content-type">Content type</label>
                      <input
                        id="document-content-type"
                        name="document-content-type"
                        required
                        value={documentForm.contentType}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            contentType: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="document-size">Size bytes</label>
                      <input
                        id="document-size"
                        name="document-size"
                        readOnly
                        type="number"
                        value={documentForm.sizeBytes}
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-category">Category</label>
                      <select
                        id="document-category"
                        name="document-category"
                        value={documentForm.category}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                      >
                        <option value="contract">Contract</option>
                        <option value="nda">NDA</option>
                        <option value="resume">Resume</option>
                        <option value="hardware">Hardware</option>
                        <option value="id">ID</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="document-visibility">Visibility</label>
                      <select
                        id="document-visibility"
                        name="document-visibility"
                        value={documentForm.visibility}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            visibility: event.target.value,
                          }))
                        }
                      >
                        <option value="client">Client</option>
                        <option value="employee">Employee</option>
                        <option value="tethr">Tethr</option>
                        <option value="all">All</option>
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-classification">Classification</label>
                      <select
                        id="document-classification"
                        name="document-classification"
                        value={documentForm.classification}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            classification: event.target.value,
                          }))
                        }
                      >
                        <option value="public">Public</option>
                        <option value="internal">Internal</option>
                        <option value="confidential">Confidential</option>
                        <option value="restricted">Restricted</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="document-signature">Signature</label>
                      <select
                        id="document-signature"
                        name="document-signature"
                        value={documentForm.signatureStatus}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            signatureStatus: event.target.value,
                          }))
                        }
                      >
                        {Object.entries(signatureStatusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="document-signed-at">Signed date</label>
                      <input
                        id="document-signed-at"
                        name="document-signed-at"
                        type="date"
                        value={documentForm.signedAt}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            signedAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="document-provider">Signature provider</label>
                      <input
                        id="document-provider"
                        name="document-provider"
                        maxLength={80}
                        value={documentForm.signatureProvider}
                        onChange={(event) =>
                          setDocumentForm((current) => ({
                            ...current,
                            signatureProvider: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="document-envelope">Envelope ID</label>
                    <input
                        id="document-envelope"
                        name="document-envelope"
                        maxLength={160}
                      value={documentForm.externalEnvelopeId}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          externalEnvelopeId: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={attachingDocument || uploadingDocument}
                    type="submit"
                  >
                    <IconFileText aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {uploadingDocument
                      ? 'Uploading…'
                      : attachingDocument
                        ? 'Attaching…'
                        : 'Attach document'}
                  </button>
                </form>
              ) : null}
            </DetailSection>
            </>
          ) : null}

          {tab === 'onboarding' ? (
            <>
            {canEditHrRecord ? (
              <DetailSection
                badge={
                  <span className="table-density">
                    {onboardingCompletedCount}/{onboardingTaskTotal} complete
                    {onboardingAllComplete ? ' · all done' : ''}
                  </span>
                }
                title="Onboarding"
              >
                {onboardingLoading ? (
                  <p className="page-subtitle">Loading onboarding checklist…</p>
                ) : null}
                <div className="record-list">
                  {onboardingTasks.map((task) => {
                    const draft = onboardingDrafts[task.taskKey] ?? {
                      status: task.status,
                      dueDate: task.dueDate ?? '',
                      notes: task.notes ?? '',
                    };
                    const hasChange =
                      draft.status !== task.status ||
                      draft.dueDate !== (task.dueDate ?? '') ||
                      draft.notes !== (task.notes ?? '');
                    return (
                      <div className="record-item" key={task.taskKey}>
                        <IconProgressCheck aria-hidden="true"
                          size={theme.icon.size.md}
                          stroke={theme.icon.stroke.md}
                        />
                        <div>
                          <div className="employee-primary">{task.title}</div>
                          <div className="record-inline-actions">
                            <StatusChip
                              color={onboardingStatusColors[draft.status]}
                              label={onboardingStatusLabels[draft.status]}
                            />
                            {task.completedAt ? (
                              <span className="employee-secondary">
                                Completed {formatDate(task.completedAt.slice(0, 10))}
                              </span>
                            ) : null}
                          </div>
                          <div className="onboarding-task-controls">
                            <div className="field">
                              <label htmlFor={`onboarding-status-${task.taskKey}`}>Status</label>
                              <select
                                id={`onboarding-status-${task.taskKey}`}
                                name={`onboarding-status-${task.taskKey}`}
                                value={draft.status}
                                onChange={(event) =>
                                  setOnboardingDrafts((current) => ({
                                    ...current,
                                    [task.taskKey]: {
                                      ...draft,
                                      status: event.target.value as EmployeeOnboardingTaskStatus,
                                    },
                                  }))
                                }
                              >
                                {Object.entries(onboardingStatusLabels).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`onboarding-due-${task.taskKey}`}>Due date</label>
                              <input
                                id={`onboarding-due-${task.taskKey}`}
                                name={`onboarding-due-${task.taskKey}`}
                                type="date"
                                value={draft.dueDate}
                                onChange={(event) =>
                                  setOnboardingDrafts((current) => ({
                                    ...current,
                                    [task.taskKey]: {
                                      ...draft,
                                      dueDate: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="field onboarding-task-notes">
                            <label htmlFor={`onboarding-notes-${task.taskKey}`}>Notes</label>
                            <textarea
                                id={`onboarding-notes-${task.taskKey}`}
                                name={`onboarding-notes-${task.taskKey}`}
                                value={draft.notes}
                              onChange={(event) =>
                                setOnboardingDrafts((current) => ({
                                  ...current,
                                  [task.taskKey]: {
                                    ...draft,
                                    notes: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <button
                            className="button button-secondary"
                            disabled={!hasChange || savingOnboardingTask}
                            type="button"
                            onClick={() => void onSaveOnboardingTask(task)}
                          >
                            <IconDeviceFloppy aria-hidden="true"
                              size={theme.icon.size.sm}
                              stroke={theme.icon.stroke.sm}
                            />
                            Save task
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!onboardingLoading && onboardingTasks.length === 0 ? (
                    <p className="table-empty">No onboarding tasks available.</p>
                  ) : null}
                </div>
              </DetailSection>
            ) : null}
            <DetailSection
              badge={
                assessments.length > 0 ? (
                  <span className="table-density">{assessments.length} recorded</span>
                ) : undefined
              }
              title="Assessments"
            >
              <div className="record-list">
                {assessments.map((assessment) => (
                  <div className="record-item" key={assessment.id}>
                    <IconClipboardCheck aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    <div>
                      <div className="employee-primary">{assessment.title}</div>
                      <div className="employee-secondary">
                        {formatDate(assessment.assessmentDate)}
                        {assessment.score !== null ? ` · ${assessment.score}/100` : ''}
                      </div>
                    </div>
                  </div>
                ))}
                {assessments.length === 0 ? (
                  <p className="table-empty">No assessments recorded.</p>
                ) : null}
              </div>
              {canRecordAssessment ? (
                <form className="config-form compact-form" onSubmit={onRecordAssessment}>
                  <div className="field">
                    <label htmlFor="assessment-title">Title</label>
                    <input
                        id="assessment-title"
                        name="assessment-title"
                        required
                      value={assessmentForm.title}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field-group">
                    <div className="field">
                      <label htmlFor="assessment-date">Date</label>
                      <input
                        id="assessment-date"
                        name="assessment-date"
                        required
                        type="date"
                        value={assessmentForm.assessmentDate}
                        onChange={(event) =>
                          setAssessmentForm((current) => ({
                            ...current,
                            assessmentDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="assessment-score">Score</label>
                      <input
                        id="assessment-score"
                        name="assessment-score"
                        max="100"
                        min="0"
                        type="number"
                        value={assessmentForm.score}
                        onChange={(event) =>
                          setAssessmentForm((current) => ({
                            ...current,
                            score: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="assessment-notes">Notes</label>
                      <textarea
                        id="assessment-notes"
                        name="assessment-notes"
                        value={assessmentForm.notes}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={recordingAssessment}
                    type="submit"
                  >
                    <IconDeviceFloppy aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {recordingAssessment ? 'Saving…' : 'Record assessment'}
                  </button>
                </form>
              ) : null}
            </DetailSection>
            </>
          ) : null}

          {tab === 'lifecycle' ? (
            <>
            <DetailSection title="Access">
              <p className="page-subtitle">Create a login for this employee or manage their account.</p>
              <button className="button button-secondary" type="button" onClick={() => void onCreateLogin()} disabled={creatingWorkspaceUser}>
                {creatingWorkspaceUser ? 'Creating…' : 'Create login'}
              </button>
            </DetailSection>
            <DetailSection title="Separation">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: theme.spacing(3),
                }}
              >
                <button className="button button-secondary" type="button" onClick={() => setShowSeparation((current) => !current)}>
                  {showSeparation ? 'Cancel' : 'Initiate separation'}
                </button>
              </div>
              {separations.length > 0 ? (
                <div className="record-list">
                  {separations.map((sep) => (
                    <div className="record-item" key={sep.id}>
                      <div>
                        <div className="employee-primary">{sep.type} — {sep.relievingDate ? formatDate(sep.relievingDate) : '-'}</div>
                        <div className="employee-secondary">{sep.reasonForLeaving ?? '-'} {sep.newWorkplace ? `· Next: ${sep.newWorkplace}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="page-subtitle">No separation on file.</p>
              )}
              {showSeparation ? (
                <form className="config-form compact-form" onSubmit={onSeparate} style={{ marginTop: theme.spacing(3) }}>
                  <div className="field">
                    <label htmlFor="sep-type">Type</label>
                    <select id="sep-type" name="sep-type" value={separationForm.type} onChange={(e) => setSeparationForm((c) => ({ ...c, type: e.target.value }))}>
                      <option value="resignation">Resignation</option>
                      <option value="termination">Termination</option>
                      <option value="retirement">Retirement</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <div className="field"><label htmlFor="sep-effective">Effective date</label><input id="sep-effective" name="sep-effective" type="date" required value={separationForm.effectiveDate} onChange={(e) => setSeparationForm((c) => ({ ...c, effectiveDate: e.target.value }))} /></div>
                    <div className="field"><label htmlFor="sep-relieving">Relieving date</label><input id="sep-relieving" name="sep-relieving" type="date" value={separationForm.relievingDate} onChange={(e) => setSeparationForm((c) => ({ ...c, relievingDate: e.target.value }))} /></div>
                  </div>
                  <div className="field"><label htmlFor="sep-reason">Reason</label><textarea id="sep-reason" name="sep-reason" value={separationForm.reason} onChange={(e) => setSeparationForm((c) => ({ ...c, reason: e.target.value }))} /></div>
                  <div className="field"><label htmlFor="sep-new">New workplace</label><input id="sep-new" name="sep-new" value={separationForm.newWorkplace} onChange={(e) => setSeparationForm((c) => ({ ...c, newWorkplace: e.target.value }))} /></div>
                  <div className="field"><label htmlFor="sep-feedback">Feedback</label><textarea id="sep-feedback" name="sep-feedback" value={separationForm.feedback} onChange={(e) => setSeparationForm((c) => ({ ...c, feedback: e.target.value }))} /></div>
                  <button className="button button-primary" type="submit" disabled={separatingEmployee}>{separatingEmployee ? 'Saving…' : 'Confirm separation'}</button>
                </form>
              ) : null}
              {offboardingTasks.length > 0 ? (
                <div style={{ marginTop: theme.spacing(4) }}>
                  <div className="section-title-row"><h4 className="section-title">Offboarding checklist</h4><span className="table-density">{offboardingCompletedCount}/{offboardingTasks.length} complete</span></div>
                  <div className="record-list">
                    {offboardingTasks.map((task) => {
                      const draft = offboardingDrafts[task.taskKey] ?? { status: task.status, dueDate: task.dueDate ?? '', notes: task.notes ?? '' };
                      const hasChange = draft.status !== task.status || draft.dueDate !== (task.dueDate ?? '') || draft.notes !== (task.notes ?? '');
                      return (
                        <div className="record-item" key={task.taskKey}>
                          <div>
                            <div className="employee-primary">{task.title}</div>
                            <div className="record-inline-actions">
                              <StatusChip
                                color={task.status === 'completed' ? 'green' : task.status === 'inProgress' ? 'amber' : 'gray'}
                                label={offboardingStatusLabels[task.status] ?? task.status}
                              />
                            </div>
                            <div className="onboarding-task-controls">
                              <div className="field"><label htmlFor={`offboarding-status-${task.taskKey}`}>Status</label><select id={`offboarding-status-${task.taskKey}`} name={`offboarding-status-${task.taskKey}`} value={draft.status} onChange={(e) => setOffboardingDrafts((c) => ({ ...c, [task.taskKey]: { ...draft, status: e.target.value } }))}><option value="notStarted">Not started</option><option value="inProgress">In progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option></select></div>
                              <div className="field"><label htmlFor={`offboarding-due-date-${task.taskKey}`}>Due date</label><input id={`offboarding-due-date-${task.taskKey}`} name={`offboarding-due-date-${task.taskKey}`} type="date" value={draft.dueDate} onChange={(e) => setOffboardingDrafts((c) => ({ ...c, [task.taskKey]: { ...draft, dueDate: e.target.value } }))} /></div>
                            </div>
                            <div className="field"><label htmlFor={`offboarding-notes-${task.taskKey}`}>Notes</label><textarea id={`offboarding-notes-${task.taskKey}`} name={`offboarding-notes-${task.taskKey}`} value={draft.notes} onChange={(e) => setOffboardingDrafts((c) => ({ ...c, [task.taskKey]: { ...draft, notes: e.target.value } }))} /></div>
                            <button className="button button-secondary" disabled={!hasChange || savingOffboardingTask} type="button" onClick={() => void onSaveOffboardingTask(task)}>Save task</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {separations.length > 0 ? (
                <div style={{ marginTop: theme.spacing(4) }}>
                  <h4 className="section-title">Exit interview</h4>
                  {exitInterviews.length > 0 ? (
                    <div className="record-list">
                      {exitInterviews.map((interview) => (
                        <div className="record-item" key={interview.id}>
                          <div>
                            <div className="employee-primary">{interview.status} {interview.scheduledDate ? `· ${formatDate(interview.scheduledDate)}` : ''}</div>
                            <div className="employee-secondary">{interview.summary ?? 'No summary'} {interview.finalDecision ? `· Decision: ${interview.finalDecision}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="page-subtitle">No exit interview recorded.</p>
                  )}
                  <form className="config-form compact-form" onSubmit={onUpsertExitInterview} style={{ marginTop: theme.spacing(3) }}>
                    <div className="field-group">
                      <div className="field"><label htmlFor="exit-status">Status</label><select id="exit-status" name="exit-status" value={exitInterviewForm.status} onChange={(e) => setExitInterviewForm((c) => ({ ...c, status: e.target.value }))}><option value="pending">Pending</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
                      <div className="field"><label htmlFor="exit-date">Scheduled date</label><input id="exit-date" name="exit-date" type="date" value={exitInterviewForm.scheduledDate} onChange={(e) => setExitInterviewForm((c) => ({ ...c, scheduledDate: e.target.value }))} /></div>
                    </div>
                    <div className="field"><label htmlFor="exit-summary">Summary</label><textarea id="exit-summary" name="exit-summary" value={exitInterviewForm.summary} onChange={(e) => setExitInterviewForm((c) => ({ ...c, summary: e.target.value }))} /></div>
                    <div className="field"><label htmlFor="exit-decision">Final decision</label><select id="exit-decision" name="exit-decision" value={exitInterviewForm.finalDecision} onChange={(e) => setExitInterviewForm((c) => ({ ...c, finalDecision: e.target.value }))}><option value="">—</option><option value="retained">Retained</option><option value="exitConfirmed">Exit confirmed</option></select></div>
                    <button className="button button-secondary" type="submit" disabled={savingExitInterview}>{savingExitInterview ? 'Saving…' : 'Save interview'}</button>
                  </form>
                </div>
              ) : null}
            </DetailSection>
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
};
