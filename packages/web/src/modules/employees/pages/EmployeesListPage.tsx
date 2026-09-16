import { useMutation, useQuery } from '@apollo/client';
import type { WorkerType } from '@hrms/shared';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconDeviceFloppy,
  IconFilterOff,
  IconPlus,
  IconSearch,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { StatusChip } from '../../../components/chip/StatusChip';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { FilterBar } from '../../../components/filter-bar/FilterBar';
import { FieldGroup } from '../../../components/record-panel/FieldGroup';
import { FieldRow } from '../../../components/record-panel/FieldRow';
import type { RecordFieldOption, RecordFieldType } from '../../../components/record-panel/FieldRow';
import { useInlineCreate } from '../../../components/record-panel/useInlineCreate';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import {
  DataTable,
  toViewColumns,
  type ColumnDefinition,
  type DraftRow,
} from '../../../components/table/DataTable';
import { useListView } from '../../../components/view-bar/useListView';
import { ViewBar } from '../../../components/view-bar/ViewBar';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import { EmployeeOrgChart } from '../components/EmployeeOrgChart';
import {
  chipStyle,
  colorFor,
  formatDate,
  fullName,
  initials,
  statusColors,
  statusLabels,
  workerTypeLabels,
  type CreateEmployeeData,
  type EmployeeRecord,
  type EmployeesData,
} from '../employee.shared';
import {
  CREATE_EMPLOYEE_MUTATION,
  EMPLOYEES_QUERY,
  SET_EMPLOYEE_MANAGER_MUTATION,
  UPDATE_EMPLOYEE_MUTATION,
} from '../graphql/employee.operations';

type EmployeeDraft = {
  employeeNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  salutation: string;
  workEmail: string;
  roleTitle: string;
  dateOfBirth: string;
  hireDate: string;
  probationEndDate: string;
  scheduledConfirmationDate: string;
  finalConfirmationDate: string;
  contractEndDate: string;
  noticePeriodDays: string;
  retirementDate: string;
  workerType: string;
};

type EmployeeFieldKey = keyof EmployeeDraft & string;

type EmployeeFieldDescriptor = {
  readonly key: EmployeeFieldKey;
  readonly label: string;
  readonly type: RecordFieldType;
  readonly autoComplete?: string;
  readonly inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal';
  readonly options?: readonly RecordFieldOption[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly min?: number;
  readonly spellCheck?: boolean;
};

type EmployeeFieldGroup = {
  readonly title: string;
  readonly fields: readonly EmployeeFieldDescriptor[];
};

const today = (): string => new Date().toISOString().slice(0, 10);

const emptyEmployeeDraft = (): EmployeeDraft => ({
  employeeNumber: '',
  firstName: '',
  middleName: '',
  lastName: '',
  salutation: '',
  workEmail: '',
  roleTitle: '',
  dateOfBirth: '',
  hireDate: today(),
  probationEndDate: '',
  scheduledConfirmationDate: '',
  finalConfirmationDate: '',
  contractEndDate: '',
  noticePeriodDays: '',
  retirementDate: '',
  workerType: 'permanent',
});

const isEmployeeDraftComplete = (draft: EmployeeDraft): boolean =>
  draft.employeeNumber.trim() !== '' &&
  draft.firstName.trim() !== '' &&
  draft.lastName.trim() !== '' &&
  draft.hireDate !== '';

const SALUTATION_OPTIONS: readonly RecordFieldOption[] = [
  { value: 'Mr', label: 'Mr' },
  { value: 'Ms', label: 'Ms' },
  { value: 'Mrs', label: 'Mrs' },
  { value: 'Mx', label: 'Mx' },
  { value: 'Dr', label: 'Dr' },
  { value: 'Prof', label: 'Prof' },
];

const WORKER_TYPE_OPTIONS: readonly RecordFieldOption[] = Object.entries(workerTypeLabels).map(
  ([value, label]) => ({ value, label }),
);

const EMPLOYEE_FIELD_GROUPS: readonly EmployeeFieldGroup[] = [
  {
    title: 'Work identity',
    fields: [
      {
        key: 'employeeNumber',
        label: 'Employee number',
        type: 'text',
        autoComplete: 'off',
        spellCheck: false,
        required: true,
      },
      {
        key: 'workEmail',
        label: 'Work email',
        type: 'email',
        autoComplete: 'email',
        spellCheck: false,
        placeholder: 'name@company.com',
      },
      {
        key: 'salutation',
        label: 'Salutation',
        type: 'select',
        options: SALUTATION_OPTIONS,
        placeholder: 'Not set',
      },
      { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
    ],
  },
  {
    title: 'Employment',
    fields: [
      { key: 'roleTitle', label: 'Role', type: 'text' },
      { key: 'hireDate', label: 'Hire date', type: 'date', required: true },
      { key: 'workerType', label: 'Worker type', type: 'select', options: WORKER_TYPE_OPTIONS },
    ],
  },
  {
    title: 'Probation & confirmation',
    fields: [
      { key: 'probationEndDate', label: 'Probation end', type: 'date' },
      { key: 'scheduledConfirmationDate', label: 'Scheduled confirmation', type: 'date' },
      { key: 'finalConfirmationDate', label: 'Final confirmation', type: 'date' },
    ],
  },
  {
    title: 'Contract & exit terms',
    fields: [
      { key: 'contractEndDate', label: 'Contract end', type: 'date' },
      { key: 'noticePeriodDays', label: 'Notice period (days)', type: 'number', inputMode: 'numeric', min: 0 },
      { key: 'retirementDate', label: 'Retirement date', type: 'date' },
    ],
  },
];

const DATE_FIELDS: readonly EmployeeFieldKey[] = [
  'dateOfBirth',
  'hireDate',
  'probationEndDate',
  'scheduledConfirmationDate',
  'finalConfirmationDate',
  'contractEndDate',
  'retirementDate',
];

const employeeRawValue = (employee: EmployeeRecord, key: EmployeeFieldKey): string => {
  switch (key) {
    case 'employeeNumber':
      return employee.employeeNumber;
    case 'firstName':
      return employee.firstName;
    case 'middleName':
      return employee.middleName ?? '';
    case 'lastName':
      return employee.lastName;
    case 'salutation':
      return employee.salutation ?? '';
    case 'workEmail':
      return employee.workEmail ?? '';
    case 'roleTitle':
      return employee.roleTitle ?? '';
    case 'noticePeriodDays':
      return employee.noticePeriodDays === null ? '' : String(employee.noticePeriodDays);
    case 'workerType':
      return employee.workerType;
    case 'dateOfBirth':
      return employee.dateOfBirth ?? '';
    case 'hireDate':
      return employee.hireDate;
    case 'probationEndDate':
      return employee.probationEndDate ?? '';
    case 'scheduledConfirmationDate':
      return employee.scheduledConfirmationDate ?? '';
    case 'finalConfirmationDate':
      return employee.finalConfirmationDate ?? '';
    case 'contractEndDate':
      return employee.contractEndDate ?? '';
    case 'retirementDate':
      return employee.retirementDate ?? '';
    default:
      return '';
  }
};

const fieldDisplay = (key: EmployeeFieldKey, raw: string): string | undefined => {
  if (raw === '') return undefined;
  if (key === 'workerType') return workerTypeLabels[raw as WorkerType] ?? raw;
  if (DATE_FIELDS.includes(key)) return formatDate(raw);
  return undefined;
};

const toCreateEmployeeInput = (draft: EmployeeDraft): Record<string, unknown> => ({
  employeeNumber: draft.employeeNumber.trim(),
  firstName: draft.firstName.trim(),
  middleName: draft.middleName.trim() || undefined,
  lastName: draft.lastName.trim(),
  salutation: draft.salutation || undefined,
  hireDate: draft.hireDate,
  workEmail: draft.workEmail.trim() || undefined,
  roleTitle: draft.roleTitle.trim() || undefined,
  dateOfBirth: draft.dateOfBirth || undefined,
  probationEndDate: draft.probationEndDate || undefined,
  scheduledConfirmationDate: draft.scheduledConfirmationDate || undefined,
  finalConfirmationDate: draft.finalConfirmationDate || undefined,
  contractEndDate: draft.contractEndDate || undefined,
  noticePeriodDays: draft.noticePeriodDays ? Number(draft.noticePeriodDays) : undefined,
  retirementDate: draft.retirementDate || undefined,
  workerType: draft.workerType,
});

// `employeeNumber` is immutable (not in UpdateEmployeeInput), and every other
// field sends only itself — a partial update, never the whole record.
const toUpdateEmployeeInput = (key: EmployeeFieldKey, value: string): Record<string, unknown> => {
  if (key === 'noticePeriodDays') {
    return { noticePeriodDays: value === '' ? null : Number(value) };
  }
  return { [key]: value === '' ? null : value };
};

const draftAsRecord = (draft: EmployeeDraft): EmployeeRecord => ({
  id: '__draft',
  employeeNumber: draft.employeeNumber,
  firstName: draft.firstName,
  middleName: draft.middleName || null,
  lastName: draft.lastName,
  salutation: draft.salutation || null,
  workEmail: draft.workEmail || null,
  roleTitle: draft.roleTitle || null,
  dateOfBirth: draft.dateOfBirth || null,
  hireDate: draft.hireDate,
  probationEndDate: draft.probationEndDate || null,
  scheduledConfirmationDate: draft.scheduledConfirmationDate || null,
  finalConfirmationDate: draft.finalConfirmationDate || null,
  contractEndDate: draft.contractEndDate || null,
  noticePeriodDays: draft.noticePeriodDays === '' ? null : Number(draft.noticePeriodDays),
  retirementDate: draft.retirementDate || null,
  holidayCalendarId: null,
  employmentStatus: 'active',
  workerType: (draft.workerType || 'permanent') as WorkerType,
  currentAssignment: null,
  assignmentHistory: [],
});

type NameHeaderProps = {
  readonly firstName: string;
  readonly lastName: string;
  readonly mode: 'create' | 'live';
  readonly onDraftChange?: (patch: Partial<EmployeeDraft>) => void;
  readonly onCommit?: (patch: { firstName?: string; lastName?: string }) => void;
};

// The name fields live in the panel header, as Twenty does. In create mode they
// write straight into the draft; in live mode blur/Enter commits each name.
const NameHeader = ({ firstName, lastName, mode, onDraftChange, onCommit }: NameHeaderProps) => {
  const [draft, setDraft] = useState({ firstName, lastName });
  useEffect(() => {
    setDraft({ firstName, lastName });
  }, [firstName, lastName]);

  const values = mode === 'create' ? { firstName, lastName } : draft;

  const update = (patch: { firstName?: string; lastName?: string }): void => {
    if (mode === 'create') {
      onDraftChange?.(patch);
      return;
    }
    setDraft((current) => ({ ...current, ...patch }));
  };

  const commitKey = (key: 'firstName' | 'lastName'): void => {
    if (mode === 'create') return;
    const committed = key === 'firstName' ? firstName : lastName;
    if (draft[key] !== committed) onCommit?.({ [key]: draft[key] });
  };

  return (
    <div className="record-panel-name">
      <input
        aria-label="First name"
        autoComplete="given-name"
        autoFocus={mode === 'create'}
        className="record-panel-name-input"
        name="first-name"
        onBlur={() => commitKey('firstName')}
        onChange={(event) => update({ firstName: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape' && mode === 'live') {
            // Escape reverts the name edit without closing the panel.
            event.preventDefault();
            event.stopPropagation();
            setDraft({ firstName, lastName });
          }
        }}
        placeholder="First name"
        value={values.firstName}
      />
      <input
        aria-label="Last name"
        autoComplete="family-name"
        className="record-panel-name-input"
        name="last-name"
        onBlur={() => commitKey('lastName')}
        onChange={(event) => update({ lastName: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape' && mode === 'live') {
            event.preventDefault();
            event.stopPropagation();
            setDraft({ firstName, lastName });
          }
        }}
        placeholder="Last name"
        value={values.lastName}
      />
    </div>
  );
};

export const EmployeesListPage = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useQuery<EmployeesData>(EMPLOYEES_QUERY);
  const [createEmployee] = useMutation<CreateEmployeeData>(CREATE_EMPLOYEE_MUTATION);
  const [updateEmployee, { loading: savingEmployee }] = useMutation(UPDATE_EMPLOYEE_MUTATION);
  const [setEmployeeManager, { loading: reassigning }] = useMutation(SET_EMPLOYEE_MANAGER_MUTATION);

  const employees = useMemo(() => data?.employees ?? [], [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The org chart is its own sub-nav tab, so the view follows the route rather
  // than local state — both views share the record panel below.
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const viewMode: 'directory' | 'orgChart' = pathname.endsWith('/org-chart')
    ? 'orgChart'
    : 'directory';
  const [searchTerm, setSearchTerm] = useState('');
  const [reassignError, setReassignError] = useState<string | null>(null);

  const canRestructure = Boolean(
    user?.roleKeys.includes('tethrAdmin') || user?.roleKeys.includes('tethrHr'),
  );

  const onReassign = async (employeeId: string, managerId: string | null): Promise<void> => {
    setReassignError(null);
    try {
      await setEmployeeManager({
        variables: {
          input: {
            employeeId,
            reportsToEmployeeId: managerId,
            effectiveDate: new Date().toISOString().slice(0, 10),
          },
        },
      });
      await refetch();
    } catch (caught) {
      setReassignError(
        caught instanceof Error ? caught.message : 'Could not change that reporting line',
      );
    }
  };

  const create = useInlineCreate<EmployeeDraft, EmployeeRecord>({
    createEmptyDraft: emptyEmployeeDraft,
    isComplete: isEmployeeDraftComplete,
    requiredFieldNames: ['first-name', 'last-name', 'employeeNumber', 'hireDate'],
    incompleteMessage:
      'Enter the employee number, first and last name, and hire date before creating the employee.',
    createRecord: async (draft) => {
      const result = await createEmployee({
        variables: { input: toCreateEmployeeInput(draft) },
      });
      await refetch();
      return result.data?.createEmployee ?? null;
    },
    onCreated: (record) => setSelectedId(record.id),
  });

  const view = useListView({ routeKey: '/employees' });
  // Status/worker-type filters narrow the dataset; the search term does not —
  // on the org chart it highlights and reveals instead of hiding the rest.
  const chartEmployees = useMemo(() => {
    const statuses = view.filters.status ?? [];
    const workerTypes = view.filters.workerType ?? [];
    return employees.filter((employee) => {
      if (statuses.length > 0 && !statuses.includes(employee.employmentStatus)) {
        return false;
      }
      if (workerTypes.length > 0 && !workerTypes.includes(employee.workerType)) {
        return false;
      }
      return true;
    });
  }, [employees, view.filters.status, view.filters.workerType]);

  const visibleEmployees = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (needle === '') return chartEmployees;
    return chartEmployees.filter((employee) =>
      [
        fullName(employee),
        employee.employeeNumber,
        employee.workEmail ?? '',
        employee.roleTitle ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [chartEmployees, searchTerm]);

  const columns: readonly ColumnDefinition<EmployeeRecord>[] = [
    {
      key: 'employee',
      header: 'Employee',
      width: '22%',
      hideable: false,
      sortValue: (employee) => fullName(employee),
      render: (employee) => (
        <div className="employee-name-cell">
          <span className="employee-avatar" style={chipStyle(colorFor(employee.id))}>
            {initials(employee)}
          </span>
          <div className="truncate">
            {/* A real link, not just the row click: the panel is hidden below
                1100px, so on a phone this is the only route into the record. */}
            <Link className="employee-primary employee-name-link" to={`/employees/${employee.id}`}>
              {fullName(employee)}
            </Link>
            <div className="employee-secondary">{employee.employeeNumber}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'workEmail',
      header: 'Work email',
      width: '22%',
      sortValue: (employee) => employee.workEmail ?? '',
      render: (employee) => <span className="truncate">{employee.workEmail ?? '—'}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      width: '18%',
      sortValue: (employee) => employee.roleTitle ?? '',
      render: (employee) => <span className="truncate">{employee.roleTitle ?? '—'}</span>,
    },
    {
      key: 'hireDate',
      header: 'Hire date',
      width: '14%',
      sortValue: (employee) => employee.hireDate,
      render: (employee) => <span className="truncate">{formatDate(employee.hireDate)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      hideable: false,
      sortValue: (employee) => employee.employmentStatus,
      render: (employee) => (
        <StatusChip
          color={statusColors[employee.employmentStatus]}
          label={statusLabels[employee.employmentStatus]}
        />
      ),
    },
    {
      key: 'workerType',
      header: 'Worker type',
      width: '12%',
      sortValue: (employee) => employee.workerType,
      render: (employee) => workerTypeLabels[employee.workerType],
    },
  ];
  const filterDefinitions = [
    {
      key: 'status',
      label: 'Status',
      options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
    },
    {
      key: 'workerType',
      label: 'Worker type',
      options: Object.entries(workerTypeLabels).map(([value, label]) => ({ value, label })),
    },
  ];

  const filtersActive =
    searchTerm.trim() !== '' ||
    (view.filters.status ?? []).length > 0 ||
    (view.filters.workerType ?? []).length > 0;
  const directoryFiltersActive =
    (view.filters.status ?? []).length > 0 || (view.filters.workerType ?? []).length > 0;

  const clearFilters = (): void => {
    setSearchTerm('');
    view.clearFilters();
  };

  const selected: EmployeeRecord | null =
    employees.find((employee) => employee.id === selectedId) ?? null;
  const isTethrWorkspace = user?.portal === 'tethr';
  const canOnboardEmployee = Boolean(
    user?.roleKeys.includes('tethrAdmin') || user?.roleKeys.includes('tethrHr'),
  );
  // employeeWrite lives on tethrAdmin/tethrHr, the same roles that may onboard;
  // everyone else (e.g. tethrFinance, clientMember) gets a read-only panel.
  const canEditEmployee = canOnboardEmployee;

  const commitField = async (
    employeeId: string,
    key: EmployeeFieldKey,
    value: string,
  ): Promise<void> => {
    if (key === 'employeeNumber') return;
    create.setError(null);
    try {
      await updateEmployee({
        variables: { input: { employeeId, ...toUpdateEmployeeInput(key, value) } },
      });
      await refetch();
    } catch (caught) {
      create.setError(caught instanceof Error ? caught.message : 'Could not save the change');
    }
  };

  const onRowClick = (employee: EmployeeRecord): void => {
    if (create.draft !== null) create.discard();
    setSelectedId(employee.id);
  };

  // A fresh draft takes over the panel; clearing the selection means discarding
  // it closes the panel rather than falling back to the last record opened.
  const startCreate = (): void => {
    setSelectedId(null);
    create.start();
  };

  const draftRow: DraftRow<EmployeeRecord> | null =
    create.draft !== null
      ? {
          rowKey: '__draft',
          renderCell: (column) => {
            const draft = create.draft;
            if (draft === null) return null;
            if (column.key === 'employee') {
              return (
                <div className="employee-name-cell">
                  <span className="employee-avatar" style={chipStyle('blue')}>
                    {`${draft.firstName.charAt(0)}${draft.lastName.charAt(0)}`.toUpperCase() || '?'}
                  </span>
                  <div className="truncate">
                    <div className="employee-primary">
                      {draft.firstName || draft.lastName
                        ? `${draft.firstName} ${draft.lastName}`.trim()
                        : 'New employee'}
                    </div>
                    <div className="employee-secondary">
                      {draft.employeeNumber || 'Number pending'}
                    </div>
                  </div>
                </div>
              );
            }
            return column.render(draftAsRecord(draft));
          },
        }
      : null;

  const panelOpen = viewMode !== 'orgChart' && (create.draft !== null || selected !== null);
  const closePanel = (): void => {
    if (create.draft !== null) {
      create.discard();
      return;
    }
    setSelectedId(null);
  };

  return (
    // The org chart needs the whole page: with the record panel taking 500px it
    // renders a 2700px tree into ~780px. Selection there opens the record instead.
    <section className={viewMode === 'orgChart' ? 'page-frame-wide' : 'list-with-panel'}>
      <section className="employees-content" aria-labelledby="employees-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="employees-title">
              {viewMode === 'orgChart' ? 'Org chart' : 'Employees'}
            </h1>
            <p className="page-subtitle">
              {viewMode === 'orgChart'
                ? 'See who reports to whom. Select anyone to open their record.'
                : isTethrWorkspace
                  ? 'Add employees and keep their records up to date.'
                  : "Your team's records, documents, and pay."}
            </p>
          </div>
          {canOnboardEmployee && viewMode !== 'orgChart' ? (
            <div className="page-actions">
              <button className="button button-primary" onClick={startCreate} type="button">
                <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                New employee
              </button>
            </div>
          ) : null}
        </header>

        <div className="directory-toolbar">
          <div className="directory-search">
            <IconSearch aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            <input
              aria-label="Search employees"
              autoComplete="off"
              name="employee-search"
              placeholder="Search name, number, email, or role"
              spellCheck={false}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          {/* On the directory the filters live in the view bar; the org chart has
              no table, so it keeps them inline. */}
          {viewMode === 'orgChart' ? (
            <FilterBar filters={filterDefinitions} values={view.filters} onChange={view.setFilter} />
          ) : null}
          {filtersActive ? (
            <button className="link-button directory-clear" type="button" onClick={clearFilters}>
              Clear all
            </button>
          ) : null}
          {viewMode === 'orgChart' ? (
            <span className="directory-count">
              {loading
                ? 'Loading…'
                : directoryFiltersActive
                  ? `${chartEmployees.length} of ${employees.length} people`
                  : `Total ${employees.length} ${employees.length === 1 ? 'person' : 'people'}`}
            </span>
          ) : null}
        </div>

        {viewMode === 'orgChart' && canRestructure ? (
          <p className="field-hint org-chart-hint">
            Drag someone onto their new manager to move them, or use the person icon on a card to
            pick from a list. Changes take effect today and keep the previous assignment as history.
          </p>
        ) : null}

        {reassignError ? (
          <p className="auth-error" role="alert">
            {reassignError}
          </p>
        ) : null}

        {viewMode === 'orgChart' ? (
          <div className="table-shell">
            {error ? (
              <EmptyState
                icon={IconAlertTriangle}
                title="Could not load employees"
                description="Is the API running, and are you still signed in?"
              />
            ) : !loading && employees.length === 0 ? (
              <EmptyState
                icon={IconUsersGroup}
                title="No employees yet"
                description={
                  canOnboardEmployee
                    ? 'Add your first employee to start building the directory.'
                    : 'No employees are available in this workspace yet.'
                }
                action={
                  canOnboardEmployee ? (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={startCreate}
                    >
                      <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                      New employee
                    </button>
                  ) : null
                }
              />
            ) : !loading && chartEmployees.length === 0 ? (
              <EmptyState
                icon={IconFilterOff}
                title="No result"
                description="Adjust your filters to show the people in this workspace."
                action={
                  <button className="button button-secondary" type="button" onClick={clearFilters}>
                    Clear all filters
                  </button>
                }
              />
            ) : (
              <EmployeeOrgChart
                employees={chartEmployees}
                reassigning={reassigning}
                searchTerm={searchTerm}
                selectedId={selectedId}
                onReassign={
                  canRestructure ? (id, managerId) => void onReassign(id, managerId) : undefined
                }
                onSelect={(employeeId) => navigate(`/employees/${employeeId}`)}
              />
            )}
          </div>
        ) : (
          <section className="table-shell" aria-label="Employees">
            <ViewBar
              columns={toViewColumns(columns)}
              count={visibleEmployees.length}
              filters={filterDefinitions}
              view={view}
              viewLabel="All employees"
            />
            <DataTable
              columns={columns}
              draftRow={draftRow}
              emptyState={
                error ? (
                  <EmptyState
                    icon={IconAlertTriangle}
                    title="Could not load employees"
                    description="Is the API running, and are you still signed in?"
                  />
                ) : employees.length === 0 ? (
                  <EmptyState
                    icon={IconUsersGroup}
                    title="No employees yet"
                    description={
                      canOnboardEmployee
                        ? 'Add your first employee to start building the directory.'
                        : 'No employees are available in this workspace yet.'
                    }
                    action={
                      canOnboardEmployee ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={startCreate}
                        >
                          <IconPlus aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                          New employee
                        </button>
                      ) : null
                    }
                  />
                ) : (
                  <EmptyState
                    icon={IconFilterOff}
                    title="No result"
                    description="Adjust your search or filters to show the people in this workspace."
                    action={
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={clearFilters}
                      >
                        Clear all filters
                      </button>
                    }
                  />
                )
              }
              getRowKey={(employee) => employee.id}
              hiddenColumns={view.hiddenColumns}
              loading={loading && !error}
              onHideColumn={view.hideColumn}
              onRowClick={onRowClick}
              onSort={view.setSort}
              rows={error ? [] : visibleEmployees}
              selectedRowKey={selected?.id ?? null}
              skeletonRows={6}
              sorts={view.sorts}
              tableClassName="employee-table"
            />
          </section>
        )}
      </section>

      <SidePanel
        ariaLabel={selected !== null ? fullName(selected) : undefined}
        headerContent={
          create.draft !== null ? (
            <NameHeader
              firstName={create.draft.firstName}
              lastName={create.draft.lastName}
              mode="create"
              onDraftChange={(patch) => create.patchDraft(patch)}
            />
          ) : selected !== null ? (
            canEditEmployee ? (
              <NameHeader
                firstName={selected.firstName}
                lastName={selected.lastName}
                mode="live"
                onCommit={(patch) => {
                  if (patch.firstName !== undefined) {
                    void commitField(selected.id, 'firstName', patch.firstName);
                  }
                  if (patch.lastName !== undefined) {
                    void commitField(selected.id, 'lastName', patch.lastName);
                  }
                }}
              />
            ) : (
              <h2 className="side-panel-title">{fullName(selected)}</h2>
            )
          ) : undefined
        }
        isOpen={panelOpen}
        onClose={closePanel}
        title={create.draft !== null ? 'New employee' : 'Employee'}
      >
        {create.draft !== null ? (
          <div>
            {EMPLOYEE_FIELD_GROUPS.map((group) => (
              <FieldGroup key={group.title} title={group.title}>
                {group.fields.map((field) => (
                  <FieldRow
                    alwaysEditing
                    key={field.key}
                    label={field.label}
                    autoComplete={field.autoComplete}
                    inputMode={field.inputMode}
                    min={field.min}
                    name={field.key}
                    onChange={(value) =>
                      create.patchDraft({ [field.key]: value } as Partial<EmployeeDraft>)
                    }
                    options={field.options}
                    placeholder={field.placeholder}
                    required={field.required}
                    spellCheck={field.spellCheck}
                    type={field.type}
                    value={create.draft?.[field.key] ?? ''}
                  />
                ))}
              </FieldGroup>
            ))}
            {create.error ? (
              <p className="auth-error record-panel-error" role="alert">
                {create.error}
              </p>
            ) : null}
            <div className="record-panel-actions">
              <button
                className="button button-primary"
                disabled={create.isSaving}
                onClick={() => void create.commit()}
                type="button"
              >
                <IconDeviceFloppy aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                {create.isSaving ? 'Creating…' : 'Create employee'}
              </button>
              <button className="button button-secondary" onClick={create.discard} type="button">
                Cancel
              </button>
            </div>
          </div>
        ) : selected !== null ? (
          <div>
            <div className="preview-identity">
              <span className="employee-avatar" style={chipStyle(colorFor(selected.id))}>
                {initials(selected)}
              </span>
              <div className="truncate">
                <div className="employee-meta">{selected.employeeNumber}</div>
                <StatusChip
                  color={statusColors[selected.employmentStatus]}
                  label={statusLabels[selected.employmentStatus]}
                />
              </div>
            </div>

            {EMPLOYEE_FIELD_GROUPS.map((group) => (
              <FieldGroup key={group.title} title={group.title}>
                {group.fields.map((field) => {
                  const raw = employeeRawValue(selected, field.key);
                  return (
                    <FieldRow
                      autoComplete={field.autoComplete}
                      display={fieldDisplay(field.key, raw)}
                      inputMode={field.inputMode}
                      key={field.key}
                      label={field.label}
                      name={field.key}
                      onCommit={(value) => void commitField(selected.id, field.key, value)}
                      options={field.options}
                      readOnly={
                        !canEditEmployee || field.key === 'employeeNumber' || savingEmployee
                      }
                      required={field.required}
                      spellCheck={field.spellCheck}
                      type={field.type}
                      value={raw}
                    />
                  );
                })}
                {group.title === 'Employment' ? (
                  <>
                    <div className="record-field">
                      <span className="record-field-label">Department</span>
                      <span className="record-field-value">
                        <span className="record-field-static">
                          {selected.currentAssignment?.departmentName ?? 'Not assigned'}
                        </span>
                      </span>
                    </div>
                    <div className="record-field">
                      <span className="record-field-label">Manager</span>
                      <span className="record-field-value">
                        <span className="record-field-static">
                          {selected.currentAssignment?.reportsToName ?? 'Not set'}
                        </span>
                      </span>
                    </div>
                  </>
                ) : null}
              </FieldGroup>
            ))}

            {create.error ? (
              <p className="auth-error record-panel-error" role="alert">
                {create.error}
              </p>
            ) : null}

            <Link className="button button-primary button-full" to={`/employees/${selected.id}`}>
              Open record
              <IconArrowRight aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            </Link>
          </div>
        ) : null}
      </SidePanel>
    </section>
  );
};
