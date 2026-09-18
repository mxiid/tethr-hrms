import { useMutation, useQuery } from '@apollo/client';
import { formatDate, formatDateTime, type ApprovalStatus } from '@hrms/shared';
import type { MainColorName } from '@hrms/ui';
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconFilterOff,
  IconPlaneDeparture,
  IconUserCheck,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState, type FormEvent, type MouseEvent } from 'react';

import { StatusChip } from '../../../components/chip/StatusChip';
import { useConfirm } from '../../../components/confirm/ConfirmProvider';
import { EmptyState } from '../../../components/empty-state/EmptyState';
import { SidePanel } from '../../../components/side-panel/SidePanel';
import {
  DataTable,
  toViewColumns,
  type ColumnDefinition,
} from '../../../components/table/DataTable';
import { useListView } from '../../../components/view-bar/useListView';
import { ViewBar } from '../../../components/view-bar/ViewBar';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  APPROVE_TEAM_LEAVE_REQUEST_MUTATION,
  LEAVE_TRIAGE_QUERY,
  REJECT_TEAM_LEAVE_REQUEST_MUTATION,
} from '../graphql/leave.operations';

type EmployeeRecord = {
  readonly id: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
};
type LeaveTypeRecord = { readonly id: string; readonly name: string; readonly code: string };
type LeaveRequestRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly leaveTypeId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly dayCount: number;
  readonly status: ApprovalStatus;
  readonly reason: string | null;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  readonly decidedByUserId: string | null;
  readonly decisionNote: string | null;
};
type LeaveTriageData = {
  readonly employees: readonly EmployeeRecord[];
  readonly leaveTypes: readonly LeaveTypeRecord[];
  readonly leaveRequestInbox: readonly LeaveRequestRecord[];
};

const statusLabel: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const statusColor: Record<ApprovalStatus, MainColorName> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'tomato',
  cancelled: 'gray',
};

const fullName = (employee: EmployeeRecord | undefined): string =>
  employee ? `${employee.firstName} ${employee.lastName}` : 'Employee';

export const LeaveTriagePage = () => {
  const { theme } = useTheme();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canDecide = user?.portal === 'tethr';
  const { data, loading, error, refetch } = useQuery<LeaveTriageData>(LEAVE_TRIAGE_QUERY);
  const [approveRequest, { loading: approving }] = useMutation(APPROVE_TEAM_LEAVE_REQUEST_MUTATION);
  const [rejectRequest, { loading: rejecting }] = useMutation(REJECT_TEAM_LEAVE_REQUEST_MUTATION);
  const requests = useMemo(() => data?.leaveRequestInbox ?? [], [data]);
  const employees = useMemo(
    () => new Map((data?.employees ?? []).map((employee) => [employee.id, employee])),
    [data?.employees],
  );
  const leaveTypes = useMemo(
    () => new Map((data?.leaveTypes ?? []).map((leaveType) => [leaveType.id, leaveType])),
    [data?.leaveTypes],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const view = useListView({ routeKey: '/leave' });
  const visibleRequests = useMemo(
    () =>
      requests.filter((request) => {
        const statuses = view.filters.status ?? [];
        const types = view.filters.type ?? [];
        if (statuses.length > 0 && !statuses.includes(request.status)) return false;
        if (types.length > 0 && !types.includes(request.leaveTypeId)) return false;
        return true;
      }),
    [requests, view.filters.status, view.filters.type],
  );
  const columns: readonly ColumnDefinition<LeaveRequestRecord>[] = [
    {
      key: 'employee',
      header: 'Employee',
      width: '24%',
      hideable: false,
      sortValue: (request) => fullName(employees.get(request.employeeId)),
      render: (request) => {
        const employee = employees.get(request.employeeId);
        return (
          <>
            <div className="employee-primary">{fullName(employee)}</div>
            <div className="employee-secondary">
              {employee?.employeeNumber ?? request.employeeId}
            </div>
          </>
        );
      },
    },
    {
      key: 'type',
      header: 'Type',
      width: '16%',
      sortValue: (request) => leaveTypes.get(request.leaveTypeId)?.name ?? 'Leave',
      render: (request) => leaveTypes.get(request.leaveTypeId)?.name ?? 'Leave',
    },
    {
      key: 'dates',
      header: 'Dates',
      width: '30%',
      sortValue: (request) => request.startDate,
      render: (request) => `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`,
    },
    {
      key: 'days',
      header: 'Days',
      width: '12%',
      align: 'right',
      sortValue: (request) => request.dayCount,
      render: (request) => request.dayCount.toFixed(1),
    },
    {
      key: 'status',
      header: 'Status',
      width: '18%',
      hideable: false,
      sortValue: (request) => request.status,
      render: (request) => (
        <StatusChip color={statusColor[request.status]} label={statusLabel[request.status]} />
      ),
    },
  ];
  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: (Object.keys(statusLabel) as ApprovalStatus[]).map((value) => ({
        value,
        label: statusLabel[value],
      })),
    },
    {
      key: 'type',
      label: 'Type',
      options: [...leaveTypes.values()].map((leaveType) => ({
        value: leaveType.id,
        label: leaveType.name,
      })),
    },
  ];
  const selectedEmployee = selected ? employees.get(selected.employeeId) : undefined;
  const [note, setNote] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const selectedTrail = selected
    ? [
        {
          key: 'employee',
          icon: IconPlaneDeparture,
          title: 'Employee submitted',
          meta: formatDateTime(selected.submittedAt),
          body: selected.reason ?? 'No reason provided.',
        },
        {
          key: 'client',
          icon: IconClock,
          title: user?.portal === 'client' ? 'Client review' : 'Client visibility',
          meta: selected.status === 'pending' ? 'Monitoring pending request' : 'Request visible',
          body:
            user?.portal === 'client'
              ? 'Shared request state for client-side planning.'
              : 'Client can monitor request status without resolving it.',
        },
        {
          key: 'tethr',
          icon: IconUserCheck,
          title: 'Tethr resolution',
          meta: selected.decidedAt ? formatDateTime(selected.decidedAt) : 'Awaiting decision',
          body:
            selected.decisionNote ??
            (selected.status === 'pending' ? 'No decision recorded yet.' : 'No decision note.'),
        },
      ]
    : [];

  const decide = async (action: 'approve' | 'reject'): Promise<void> => {
    if (!selected) return;
    setDecisionError(null);
    try {
      const mutation = action === 'approve' ? approveRequest : rejectRequest;
      await mutation({
        variables: { input: { leaveRequestId: selected.id, note: note || null } },
      });
      setNote('');
      await refetch();
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : 'Could not update leave request');
    }
  };

  const onApprove = (event: FormEvent): void => {
    event.preventDefault();
    void decide('approve');
  };

  const onReject = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.preventDefault();
    const confirmed = await confirm({
      title: 'Reject this leave request?',
      body: 'The employee will see the request as rejected.',
      confirmLabel: 'Reject',
      tone: 'danger',
    });
    if (!confirmed) return;
    await decide('reject');
  };

  return (
    <section className="list-with-panel">
      <section className="leave-content" aria-labelledby="leave-title">
        <header className="page-header">
          <div>
            <h1 className="page-title" id="leave-title">
              Leave triage
            </h1>
            <p className="page-subtitle">Review and decide on time-off requests.</p>
          </div>
        </header>

        <div className="metric-strip metric-strip-3 employee-metrics">
          <div className="metric-card">
            <div className="metric-label">Pending</div>
            <div className="metric-value">{loading ? '…' : pendingCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Approved</div>
            <div className="metric-value">
              {loading ? '…' : requests.filter((request) => request.status === 'approved').length}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total</div>
            <div className="metric-value">{loading ? '…' : requests.length}</div>
          </div>
        </div>

        <section className="table-shell" aria-label="Leave requests">
          <ViewBar
            columns={toViewColumns(columns)}
            count={visibleRequests.length}
            filters={filters}
            view={view}
            viewLabel="All requests"
          />
          <DataTable
            columns={columns}
            emptyState={
              error ? (
                <EmptyState
                  icon={IconAlertTriangle}
                  title="Could not load leave requests"
                  description="Is the API running, and are you still signed in?"
                />
              ) : requests.length === 0 ? (
                <EmptyState
                  icon={IconPlaneDeparture}
                  title="No leave requests yet"
                  description="Requests submitted by employees will show up here for review."
                />
              ) : (
                <EmptyState
                  icon={IconFilterOff}
                  title="No requests match these filters"
                  description="Clear a filter to see more."
                  action={
                    <button className="button button-secondary" onClick={view.clearFilters} type="button">
                      Clear filters
                    </button>
                  }
                />
              )
            }
            getRowKey={(request) => request.id}
            hiddenColumns={view.hiddenColumns}
            loading={loading && !error}
            onHideColumn={view.hideColumn}
            onRowClick={(request) => setSelectedId(request.id)}
            onSort={view.setSort}
            rows={error ? [] : visibleRequests}
            selectedRowKey={selected?.id ?? null}
            sorts={view.sorts}
            tableClassName="data-table leave-triage-table"
          />
        </section>
      </section>

      <SidePanel
        isOpen={selected != null}
        onClose={() => setSelectedId(null)}
        title="Leave request"
      >
        {selected ? (
          <section className="self-service-section">
            <div className="panel-title-row">
              <div>
                <div className="panel-kicker">
                  {leaveTypes.get(selected.leaveTypeId)?.name ?? 'Leave'}
                </div>
                <h2 className="panel-title">{fullName(selectedEmployee)}</h2>
              </div>
              <IconPlaneDeparture aria-hidden="true" size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
            </div>

            <div className="field-list">
              <div className="field-row">
                <span className="field-label">Status</span>
                <StatusChip color={statusColor[selected.status]} label={statusLabel[selected.status]} />
              </div>
              <div className="field-row">
                <span className="field-label">Dates</span>
                <span className="field-value">
                  {formatDate(selected.startDate)} - {formatDate(selected.endDate)}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Days</span>
                <span className="field-value">{selected.dayCount.toFixed(1)}</span>
              </div>
            </div>

            <div className="request-note">
              <div className="employee-secondary">Employee reason</div>
              <p>{selected.reason ?? '-'}</p>
            </div>

            <div className="record-list leave-handshake-list">
              {selectedTrail.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="record-item" key={item.key}>
                    <Icon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    <div>
                      <div className="employee-primary">{item.title}</div>
                      <div className="employee-secondary">{item.meta}</div>
                      <div className="leave-trail-note">{item.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {canDecide && selected.status === 'pending' ? (
              <form className="config-form" onSubmit={onApprove}>
                {decisionError ? (
                  <p className="auth-error" role="alert">
                    {decisionError}
                  </p>
                ) : null}
                <div className="field">
                  <label htmlFor="leave-decision-note">Decision note</label>
                  <textarea
                    id="leave-decision-note"
                    name="leave-decision-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <div className="page-actions">
                  <button className="button button-primary" disabled={approving} type="submit">
                    <IconCheck aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {approving ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={rejecting}
                    type="button"
                    onClick={onReject}
                  >
                    <IconX aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    {rejecting ? 'Rejecting…' : 'Reject'}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}
      </SidePanel>
    </section>
  );
};
