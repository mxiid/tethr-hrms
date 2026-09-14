import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconExternalLink,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import { downloadBase64File } from '../../../app/download';
import { useTheme } from '../../../providers/theme/useTheme';
import {
  EMPLOYEE_PAYROLL_READINESS_QUERY,
  PAYSLIP_PDF_QUERY,
} from '../../finance/payroll/graphql/payroll.operations';

import { DetailSection } from './DetailSection';
import {
  DECIDE_BANK_CHANGE_MUTATION,
  EMPLOYEE_BANK_CHANGE_REQUESTS_QUERY,
} from '../graphql/employee.operations';
import {
  EMPLOYEE_ADJUSTMENTS_QUERY,
  EMPLOYEE_BILLING_MEMBER_QUERY,
  EMPLOYEE_BONUS_AWARDS_QUERY,
  EMPLOYEE_PAYSLIPS_QUERY,
  EMPLOYEE_SALARY_HISTORY_QUERY,
  FX_RATE_QUERY,
} from '../graphql/employee-pay.operations';

type Props = {
  readonly employeeId: string;
  readonly currency: string;
  readonly canViewSalaryHistory: boolean;
  readonly canViewPayroll: boolean;
  readonly canViewBilling: boolean;
  readonly canApproveBankChanges: boolean;
};

type BankChangeRequestRecord = {
  readonly id: string;
  readonly bankName: string | null;
  readonly bankAccountTitle: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIban: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly decisionNote: string | null;
};

type SalaryRevisionRecord = {
  readonly id: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly currency: string;
  readonly annualAmount: number;
  readonly reason: string;
  readonly note: string | null;
};

type PayslipRecord = {
  readonly id: string;
  readonly runId: string;
  readonly payslipNumber: string;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly payDate: string;
  readonly currency: string;
  readonly paidDays: number;
  readonly standardWorkingDays: number;
  readonly lopDays: number;
  readonly grossAmount: number;
  readonly incomeTaxAmount: number;
  readonly netPayAmount: number;
};

type AdjustmentRecord = {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly kind: string;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly note: string | null;
};

type BonusRecord = {
  readonly id: string;
  readonly awardDate: string;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly note: string | null;
};

type BillingMemberRecord = {
  readonly employeeId: string;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly monthlyRate: number;
  readonly rateCurrency: string;
};

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const monthLabel = (month: number): string => MONTH_LABELS[month - 1] ?? String(month);

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en', { currency, maximumFractionDigits: 0, style: 'currency' }).format(
    amount,
  );

export const EmployeeJobPayHub = ({
  employeeId,
  currency,
  canViewSalaryHistory,
  canViewPayroll,
  canViewBilling,
  canApproveBankChanges,
}: Props) => {
  const { theme } = useTheme();
  const today = new Date().toISOString().slice(0, 10);

  const { data: salaryData } = useQuery<{ readonly salaryRevisions: readonly SalaryRevisionRecord[] }>(
    EMPLOYEE_SALARY_HISTORY_QUERY,
    { skip: !canViewSalaryHistory, variables: { employeeId } },
  );
  const { data: payslipsData } = useQuery<{ readonly employeePayslips: readonly PayslipRecord[] }>(
    EMPLOYEE_PAYSLIPS_QUERY,
    { skip: !canViewPayroll, variables: { employeeId } },
  );
  const { data: adjustmentsData } = useQuery<{
    readonly payAdjustments: readonly AdjustmentRecord[];
  }>(EMPLOYEE_ADJUSTMENTS_QUERY, { skip: !canViewSalaryHistory, variables: { employeeId } });
  const { data: bonusesData } = useQuery<{ readonly bonusAwards: readonly BonusRecord[] }>(
    EMPLOYEE_BONUS_AWARDS_QUERY,
    { skip: !canViewSalaryHistory, variables: { employeeId } },
  );
  const { data: billingData } = useQuery<{ readonly billingMembers: readonly BillingMemberRecord[] }>(
    EMPLOYEE_BILLING_MEMBER_QUERY,
    { skip: !canViewBilling },
  );
  const { data: fxData } = useQuery<{ readonly exchangeRate: number | null }>(FX_RATE_QUERY, {
    skip: !canViewBilling,
    variables: { baseCurrency: 'PKR', quoteCurrency: 'USD', asOf: today },
  });
  const { data: readinessData } = useQuery<{
    readonly employeePayrollReadiness: {
      readonly employeeId: string;
      readonly blockers: readonly { readonly code: string; readonly severity: string; readonly message: string }[];
    } | null;
  }>(EMPLOYEE_PAYROLL_READINESS_QUERY, {
    skip: !canViewPayroll,
    variables: {
      employeeId,
      periodYear: Number(today.slice(0, 4)),
      periodMonth: Number(today.slice(5, 7)),
    },
  });
  const [loadPayslipPdf] = useLazyQuery<{ readonly payslipPdf: string }>(PAYSLIP_PDF_QUERY, {
    fetchPolicy: 'no-cache',
  });
  const { data: bankRequestsData } = useQuery<{
    readonly bankDetailChangeRequests: readonly BankChangeRequestRecord[];
  }>(EMPLOYEE_BANK_CHANGE_REQUESTS_QUERY, {
    skip: !canApproveBankChanges,
    variables: { employeeId },
  });
  const [decideBankChange] = useMutation(DECIDE_BANK_CHANGE_MUTATION, {
    refetchQueries: [{ query: EMPLOYEE_BANK_CHANGE_REQUESTS_QUERY, variables: { employeeId } }],
  });

  const revisions = [...(salaryData?.salaryRevisions ?? [])].sort((a, b) =>
    b.validFrom.localeCompare(a.validFrom),
  );
  const payslips = [...(payslipsData?.employeePayslips ?? [])].sort((a, b) =>
    `${b.periodYear}${String(b.periodMonth).padStart(2, '0')}`.localeCompare(
      `${a.periodYear}${String(a.periodMonth).padStart(2, '0')}`,
    ),
  );
  const adjustments = adjustmentsData?.payAdjustments ?? [];
  const bonuses = bonusesData?.bonusAwards ?? [];
  const member = (billingData?.billingMembers ?? []).find(
    (candidate) => candidate.employeeId === employeeId,
  );
  const fxRate = fxData?.exchangeRate ?? null;
  const readinessEntry = readinessData?.employeePayrollReadiness ?? null;
  const pendingBankRequests = (bankRequestsData?.bankDetailChangeRequests ?? []).filter(
    (request) => request.status === 'pending',
  );

  const monthlyCost = revisions[0] ? revisions[0].annualAmount / 12 : null;
  const costInBillingCurrency =
    monthlyCost !== null && fxRate
      ? member?.rateCurrency === 'USD'
        ? monthlyCost * fxRate
        : monthlyCost
      : null;
  const margin =
    member && costInBillingCurrency !== null ? member.monthlyRate - costInBillingCurrency : null;

  const downloadPayslip = async (payslip: PayslipRecord): Promise<void> => {
    const result = await loadPayslipPdf({ variables: { payslipId: payslip.id } });
    if (result.data) {
      downloadBase64File(`${payslip.payslipNumber}.pdf`, result.data.payslipPdf);
    }
  };

  return (
    <>
      {canViewPayroll ? (
        <DetailSection title="Pay readiness">
          {readinessEntry ? (
            <ul className="record-list">
              {readinessEntry.blockers.map((blocker) => (
                <li className="record-item" key={blocker.code}>
                  <span>
                    <IconAlertTriangle size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />{' '}
                    {blocker.message}
                  </span>
                  <span className="employee-secondary">
                    {blocker.severity === 'hard' ? 'blocks payroll' : 'warning'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">
              <IconCircleCheck size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} /> Ready to be
              paid — no blockers this period.
            </p>
          )}
        </DetailSection>
      ) : null}

      {canViewSalaryHistory ? (
        <DetailSection title="Salary history">
          {revisions.length === 0 ? (
            <p className="field-hint">No salary revisions recorded.</p>
          ) : (
            <ul className="record-list">
              {revisions.map((revision) => (
                <li className="record-item" key={revision.id}>
                  <span>
                    <strong>{formatMoney(revision.annualAmount, revision.currency)}</strong>
                    <span className="employee-secondary">
                      {' '}
                      / year · {revision.reason}
                    </span>
                  </span>
                  <span className="employee-secondary">
                    from {revision.validFrom}
                    {revision.validTo ? ` to ${revision.validTo}` : ' · current'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      ) : null}

      {canViewPayroll ? (
        <DetailSection title="Payslips">
          {payslips.length === 0 ? (
            <p className="field-hint">No payslips issued yet.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Paid / days</th>
                    <th>Gross</th>
                    <th>Tax</th>
                    <th>Net</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((payslip) => (
                    <tr key={payslip.id}>
                      <td>{`${monthLabel(payslip.periodMonth)} ${payslip.periodYear}`}</td>
                      <td>
                        {payslip.paidDays}/{payslip.standardWorkingDays}
                        {payslip.lopDays > 0 ? ` · LOP ${payslip.lopDays}` : ''}
                      </td>
                      <td>{formatMoney(payslip.grossAmount, payslip.currency)}</td>
                      <td>{formatMoney(payslip.incomeTaxAmount, payslip.currency)}</td>
                      <td>
                        <strong>{formatMoney(payslip.netPayAmount, payslip.currency)}</strong>
                      </td>
                      <td>
                        <div className="inline-actions-row">
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => {
                              void downloadPayslip(payslip);
                            }}
                          >
                            <IconDownload size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                            PDF
                          </button>
                          <Link className="table-link" to={`/payroll/${payslip.runId}`}>
                            Run
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>
      ) : null}

      {canViewSalaryHistory && (adjustments.length > 0 || bonuses.length > 0) ? (
        <DetailSection title="Adjustments & bonuses">
          <ul className="record-list">
            {bonuses.map((bonus) => (
              <li className="record-item" key={bonus.id}>
                <span>
                  <strong>{formatMoney(bonus.amount, bonus.currency)}</strong>
                  <span className="employee-secondary"> · bonus ({bonus.reason})</span>
                </span>
                <span className="employee-secondary">{bonus.awardDate}</span>
              </li>
            ))}
            {adjustments.map((adjustment) => (
              <li className="record-item" key={adjustment.id}>
                <span>
                  <strong>{formatMoney(adjustment.amount, adjustment.currency)}</strong>
                  <span className="employee-secondary"> · {adjustment.kind}</span>
                </span>
                <span className="employee-secondary">
                  {`${monthLabel(adjustment.periodMonth)} ${adjustment.periodYear}`}
                  {adjustment.sourceType ? ` · from ${adjustment.sourceType}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {canViewBilling ? (
        <DetailSection
          badge={
            member ? (
              <span className="table-density">
                {formatMoney(member.monthlyRate, member.rateCurrency)} / month
              </span>
            ) : undefined
          }
          title="Billing & margin"
        >
          {!member ? (
            <p className="field-hint field-hint-warning">
              Not in a billing group — no client rate is set for this employee.{' '}
              <Link className="table-link" to="/billing">
                Open billing <IconExternalLink size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
              </Link>
            </p>
          ) : (
            <div className="field-list">
              <div className="field-row">
                <span className="field-label">Billed rate</span>
                <span className="field-value">
                  {formatMoney(member.monthlyRate, member.rateCurrency)}
                  {member.groupName ? ` · ${member.groupName}` : ''}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Monthly cost</span>
                <span className="field-value">
                  {monthlyCost !== null ? formatMoney(monthlyCost, currency) : '—'}
                  {costInBillingCurrency !== null && member.rateCurrency !== currency
                    ? ` (≈ ${formatMoney(costInBillingCurrency, member.rateCurrency)})`
                    : ''}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Margin</span>
                <span className="field-value">
                  {margin === null
                    ? '— (no FX rate configured)'
                    : `${formatMoney(margin, member.rateCurrency)}${
                        member.monthlyRate > 0
                          ? ` · ${Math.round((margin / member.monthlyRate) * 100)}%`
                          : ''
                      }`}
                </span>
              </div>
              {margin !== null && margin < 0 ? (
                <p className="field-hint-warning">
                  Cost exceeds the billed rate for this employee — a raise would deepen the loss.
                </p>
              ) : null}
            </div>
          )}
        </DetailSection>
      ) : null}

      {canApproveBankChanges && pendingBankRequests.length > 0 ? (
        <DetailSection title="Bank change requests">
          <ul className="record-list">
            {pendingBankRequests.map((request) => (
              <li className="record-item" key={request.id}>
                <span>
                  {[request.bankName, request.bankAccountTitle, request.bankAccountNumber, request.bankIban]
                    .filter(Boolean)
                    .join(' · ') || 'Change requested'}
                  <span className="employee-secondary"> · requested {request.createdAt.slice(0, 10)}</span>
                </span>
                <span className="inline-actions-row">
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => {
                      void decideBankChange({
                        variables: { input: { requestId: request.id, approve: true } },
                      });
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      void decideBankChange({
                        variables: { input: { requestId: request.id, approve: false } },
                      });
                    }}
                  >
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}
    </>
  );
};
