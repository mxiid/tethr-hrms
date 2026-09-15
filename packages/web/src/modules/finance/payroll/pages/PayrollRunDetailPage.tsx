import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { IconAlertTriangle, IconLock, IconRefresh, IconTable, IconX } from '@tabler/icons-react';
import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { downloadBase64File } from '../../../../app/download';
import { StatusChip } from '../../../../components/chip/StatusChip';
import { EmptyState } from '../../../../components/empty-state/EmptyState';
import { Modal } from '../../../../components/modal/Modal';
import { SkeletonRows } from '../../../../components/skeleton/Skeleton';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  PayrollReadinessBanner,
  type PayrollReadinessRecord,
} from '../components/PayrollReadinessBanner';
import {
  BANK_ADVICE_CSV_QUERY,
  FINALIZE_PAYROLL_RUN_MUTATION,
  MARK_PAYROLL_RUN_PAID_MUTATION,
  PAYROLL_READINESS_QUERY,
  PAYROLL_RUN_QUERY,
  REMOVE_PAYROLL_RUN_LINE_MUTATION,
  REGENERATE_PAYROLL_RUN_MUTATION,
  RUN_PAYSLIPS_QUERY,
  PAYSLIP_PDF_QUERY,
  UPDATE_PAYROLL_RUN_LINE_MUTATION,
} from '../graphql/payroll.operations';

type LineComponentRecord = {
  readonly id: string;
  readonly componentCode: string;
  readonly componentName: string;
  readonly category: string;
  readonly taxable: boolean;
  readonly dependsOnPaymentDays: boolean;
  readonly defaultAmount: number;
  readonly amount: number;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
};

type RunLineRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly displayName: string | null;
  readonly roleTitle: string | null;
  readonly hireDate: string | null;
  readonly employmentStatus: string | null;
  readonly payableDays: number;
  readonly lopDays: number;
  readonly standardWorkingDays: number;
  readonly grossAmount: number;
  readonly taxOverrideAmount: number | null;
  readonly note: string | null;
  readonly totalEarnings: number;
  readonly taxableAmount: number;
  readonly incomeTax: number;
  readonly netPayAmount: number;
  readonly components: readonly LineComponentRecord[];
};

type PayrollRunData = {
  readonly payrollRun: {
    readonly id: string;
    readonly periodYear: number;
    readonly periodMonth: number;
    readonly status: string;
    readonly currency: string;
    readonly standardWorkingDays: number;
    readonly finalizedAt: string | null;
    readonly payDate: string | null;
    readonly finalizeOverrideReason: string | null;
    readonly grossTotal: number;
    readonly deductionsTotal: number;
    readonly netTotal: number;
    readonly employerContributionTotal: number;
    readonly employerCostTotal: number;
    readonly paidAt: string | null;
    readonly paymentReference: string | null;
    readonly isStale: boolean;
    readonly staleReason: string | null;
    readonly lines?: readonly RunLineRecord[];
  };
};

type PayslipRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly payslipNumber: string;
  readonly employeeNumber: string;
  readonly employeeName: string;
  readonly payDate: string;
  readonly currency: string;
  readonly paidDays: number;
  readonly lopDays: number;
  readonly grossAmount: number;
  readonly taxableAmount: number;
  readonly incomeTaxAmount: number;
  readonly netPayAmount: number;
  readonly notes: string | null;
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

const downloadCsv = (filename: string, contents: string): void => {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

export const PayrollRunDetailPage = () => {
  const { theme } = useTheme();
  const runId = useParams<{ runId: string }>().runId ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [taxInputs, setTaxInputs] = useState<Record<string, string>>({});
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeReason, setFinalizeReason] = useState('');

  const { data, loading, error: loadError, refetch } = useQuery<PayrollRunData>(
    PAYROLL_RUN_QUERY,
    { variables: { runId } },
  );
  const isFinalized = data?.payrollRun.status === 'finalized';

  const { data: payslipsData } = useQuery<{ readonly runPayslips: readonly PayslipRecord[] }>(
    RUN_PAYSLIPS_QUERY,
    { variables: { runId }, skip: !isFinalized },
  );

  const { data: readinessData } = useQuery<{ readonly payrollReadiness: PayrollReadinessRecord }>(
    PAYROLL_READINESS_QUERY,
    {
      variables: {
        periodYear: data?.payrollRun.periodYear,
        periodMonth: data?.payrollRun.periodMonth,
      },
      skip: !data?.payrollRun || isFinalized,
    },
  );

  const [regenerateRun, { loading: regenerating }] = useMutation(
    REGENERATE_PAYROLL_RUN_MUTATION,
  );
  const [finalizeRun, { loading: finalizing }] = useMutation(FINALIZE_PAYROLL_RUN_MUTATION);
  const [updateLine] = useMutation(UPDATE_PAYROLL_RUN_LINE_MUTATION);
  const [removeLine] = useMutation(REMOVE_PAYROLL_RUN_LINE_MUTATION);
  const [markRunPaid, { loading: markingPaid }] = useMutation(MARK_PAYROLL_RUN_PAID_MUTATION);
  const [loadBankAdvice] = useLazyQuery<{ readonly bankAdviceCsv: string }>(
    BANK_ADVICE_CSV_QUERY,
    { fetchPolicy: 'no-cache' },
  );
  const [loadPayslipPdf] = useLazyQuery<{ readonly payslipPdf: string }>(
    PAYSLIP_PDF_QUERY,
    { fetchPolicy: 'no-cache' },
  );

  const runAction = async (action: () => Promise<unknown>, successMessage: string): Promise<boolean> => {
    setError(null);
    setMessage(null);
    try {
      await action();
      await refetch();
      setMessage(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed.');
      return false;
    }
  };

  const submitFinalize = async (overrideReason?: string): Promise<void> => {
    const ok = await runAction(
      () => finalizeRun({ variables: { runId, overrideReason } }),
      'Run finalized — payslips are locked and the billing handoff event was emitted.',
    );
    if (!ok) return;
    setFinalizeOpen(false);
    setFinalizeReason('');
  };

  const requestFinalize = (): void => {
    const readiness = readinessData?.payrollReadiness;
    // While readiness is still loading we can't know whether blockers exist; a
    // reasonless finalize would be rejected by the server, so wait (the button
    // is disabled in that state) rather than guessing.
    if (!readiness) return;
    if (readiness.hardBlockerCount > 0) {
      setFinalizeReason('');
      setFinalizeOpen(true);
      return;
    }
    void submitFinalize();
  };

  const onUpdateLineTax = async (lineId: string, raw: string): Promise<void> => {
    const value = raw.trim();
    await runAction(
      () =>
        updateLine({
          variables: {
            input: {
              lineId,
              taxOverrideAmount: value === '' ? null : Number(value),
            },
          },
        }),
      value === '' ? 'Tax override cleared — engine value restored.' : 'Tax override saved.',
    );
  };

  const onDownloadBankAdvice = async (): Promise<void> => {
    setError(null);
    try {
      const result = await loadBankAdvice({ variables: { runId } });
      if (!result.data) return;
      downloadCsv(
        `bank-advice-${data?.payrollRun.periodYear}-${String(data?.payrollRun.periodMonth).padStart(2, '0')}.csv`,
        result.data.bankAdviceCsv,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build bank advice.');
    }
  };

  if (loadError) {
    return (
      <main className="page-frame">
        <div className="employees-content">
          <EmptyState
            icon={IconAlertTriangle}
            title="Could not load this payroll run"
            description="It may have been removed, or the API is unreachable."
            action={
              <Link className="button button-secondary" to="/payroll">
                Back to runs
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const run = data?.payrollRun;
  const lines = run?.lines ?? [];
  const totalNet = lines.reduce((sum, line) => sum + line.netPayAmount, 0);

  return (
    <main className="page-frame">
      <div className="employees-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">
              {run ? `${monthLabel(run.periodMonth)} ${run.periodYear}` : 'Payroll run'}
            </h1>
            <p className="page-subtitle">
              {run
                ? `${lines.length} line${lines.length === 1 ? '' : 's'} · ${run.standardWorkingDays} working days · ${formatMoney(totalNet, run.currency)} net`
                : ''}
            </p>
          </div>
          <div className="page-actions">
            {run && !isFinalized ? (
              <>
                <button
                  className="button button-secondary"
                  disabled={regenerating}
                  type="button"
                  onClick={() => {
                    void runAction(
                      () => regenerateRun({ variables: { runId } }),
                      'Draft updated with the latest salaries and leave.',
                    );
                  }}
                >
                  <IconRefresh size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  {regenerating ? 'Recomputing…' : 'Regenerate'}
                </button>
                <button
                  className="button button-primary"
                  disabled={finalizing || lines.length === 0 || readinessData === undefined}
                  onClick={requestFinalize}
                  title={readinessData === undefined ? 'Checking readiness…' : undefined}
                  type="button"
                >
                  <IconLock size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  {finalizing ? 'Finalizing…' : 'Finalize run'}
                </button>
              </>
            ) : null}
            {isFinalized ? (
              <button className="button button-secondary" type="button" onClick={() => void onDownloadBankAdvice()}>
                Download bank advice
              </button>
            ) : null}
            {isFinalized && !run?.paidAt ? (
              <button
                className="button button-primary"
                disabled={markingPaid}
                type="button"
                onClick={() =>
                  void runAction(
                    async () => {
                      const reference = window.prompt('Payment reference (optional)') ?? null;
                      await markRunPaid({
                        variables: { runId, paymentReference: reference || null },
                      });
                    },
                    'Run marked as paid.',
                  )
                }
              >
                {markingPaid ? 'Saving…' : 'Mark as paid'}
              </button>
            ) : null}
            {isFinalized && run?.paidAt ? (
              <StatusChip
                color="green"
                label={`Paid${run.paymentReference ? ` · ${run.paymentReference}` : ''}`}
              />
            ) : null}
            <Link className="button button-secondary" to="/payroll">
              All runs
            </Link>
          </div>
        </header>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        {run?.isStale && !isFinalized ? (
          <p className="field-hint-warning" role="status">
            Salary changed since this draft{run.staleReason ? `: ${run.staleReason}` : ''} —
            regenerate before finalizing.
          </p>
        ) : null}
        {readinessData?.payrollReadiness ? (
          <PayrollReadinessBanner readiness={readinessData.payrollReadiness} />
        ) : null}

        <section className="table-shell" aria-labelledby="run-lines-title">
          <div className="table-title-row">
            <div className="table-title" id="run-lines-title">
              {isFinalized ? 'Locked lines (as disbursed)' : 'Draft lines'}
            </div>
            <div className="table-density">
              {loading ? '…' : `${lines.length} employee${lines.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <colgroup>
                <col style={{ width: isFinalized ? '34%' : '30%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                {!isFinalized ? <col style={{ width: '4%' }} /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="cell-numeric">Paid days</th>
                  <th className="cell-numeric">LOP</th>
                  <th className="cell-numeric">Gross</th>
                  <th className="cell-numeric">Taxable</th>
                  <th className="cell-numeric">Tax</th>
                  <th className="cell-numeric">Net pay</th>
                  {!isFinalized ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows columnCount={isFinalized ? 7 : 8} rows={4} /> : null}
                {!loading && lines.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={isFinalized ? 7 : 8}>
                      <EmptyState
                        icon={IconTable}
                        title="No lines in this run"
                        description="Regenerate the draft to pull in current salaries and leave."
                      />
                    </td>
                  </tr>
                ) : null}
                {!loading &&
                  lines.map((line) => (
                    <Fragment key={line.id}>
                      <tr>
                        <td data-label="Employee">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => setExpandedLineId(expandedLineId === line.id ? null : line.id)}
                          >
                            <span className="employee-primary">{line.displayName ?? line.employeeId}</span>
                          </button>
                          <div className="employee-secondary">
                            {[line.roleTitle, line.hireDate ? `joined ${line.hireDate}` : null, line.employmentStatus]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                          <div className="employee-secondary">
                            <Link className="table-link" to={`/employees/${line.employeeId}`}>
                              View employee record
                            </Link>
                          </div>
                          {line.note ? <div className="employee-secondary">{line.note}</div> : null}
                        </td>
                        <td className="cell-numeric" data-label="Paid days">{line.payableDays}</td>
                        <td className="cell-numeric" data-label="LOP">{line.lopDays}</td>
                        <td className="cell-numeric" data-label="Gross">{run ? formatMoney(line.grossAmount, run.currency) : '—'}</td>
                        <td className="cell-numeric" data-label="Taxable">{run ? formatMoney(line.taxableAmount, run.currency) : '—'}</td>
                        <td className="cell-numeric" data-label="Tax">
                          {formatMoney(line.incomeTax, run?.currency ?? 'PKR')}
                          {line.taxOverrideAmount !== null ? (
                            <StatusChip color="amber" label="override" />
                          ) : null}
                        </td>
                        <td className="cell-numeric" data-label="Net pay">
                          <strong>{formatMoney(line.netPayAmount, run?.currency ?? 'PKR')}</strong>
                        </td>
                        {!isFinalized ? (
                          <td data-label="Actions">
                            <button
                              className="icon-button row-hover-action"
                              title="Remove line"
                              type="button"
                              onClick={() => {
                                void runAction(
                                  () => removeLine({ variables: { lineId: line.id, runId } }),
                                  'Line removed.',
                                );
                              }}
                            >
                              <IconX size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                      {expandedLineId === line.id ? (
                        <tr>
                          <td colSpan={isFinalized ? 7 : 8}>
                            <div className="record-list">
                              {line.components.length === 0 ? (
                                <div className="record-item">No component breakdown.</div>
                              ) : (
                                line.components.map((component) => (
                                  <div className="record-item" key={component.id}>
                                    <span>
                                      {component.componentName}{' '}
                                      <span className="employee-secondary">({component.componentCode})</span>
                                    </span>
                                    <span>
                                      {component.dependsOnPaymentDays &&
                                      component.defaultAmount !== component.amount ? (
                                        <span className="employee-secondary">
                                          {formatMoney(component.defaultAmount, run?.currency ?? 'PKR')} ×{' '}
                                          {line.payableDays}/{line.standardWorkingDays} ={' '}
                                        </span>
                                      ) : null}
                                      <strong>
                                        {formatMoney(component.amount, run?.currency ?? 'PKR')}
                                      </strong>
                                      {component.taxable ? '' : ' · non-taxable'}
                                      {component.sourceType ? ` · from ${component.sourceType}` : ''}
                                    </span>
                                  </div>
                                ))
                              )}
                              {!isFinalized ? (
                                <div className="record-inline-actions">
                                  <input
                                    aria-label={`Tax override for ${line.displayName ?? line.employeeId}`}
                                    min={0}
                                    placeholder="Engine tax"
                                    step="0.01"
                                    type="number"
                                    value={
                                      taxInputs[line.id] ??
                                      (line.taxOverrideAmount === null ? '' : String(line.taxOverrideAmount))
                                    }
                                    onChange={(event) =>
                                      setTaxInputs((current) => ({
                                        ...current,
                                        [line.id]: event.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    className="button button-secondary"
                                    type="button"
                                    onClick={() => {
                                      void onUpdateLineTax(
                                        line.id,
                                        taxInputs[line.id] ??
                                          (line.taxOverrideAmount === null
                                            ? ''
                                            : String(line.taxOverrideAmount)),
                                      );
                                    }}
                                  >
                                    Save override
                                  </button>
                                  <span className="field-hint">Blank = engine-computed withholding</span>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {isFinalized && payslipsData ? (
          <section className="table-shell" aria-labelledby="payslips-title">
            <div className="table-title-row">
              <div className="table-title" id="payslips-title">
                Issued payslips
              </div>
              <div className="table-density">{payslipsData.runPayslips.length} payslips</div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <colgroup>
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Payslip</th>
                    <th>Employee</th>
                    <th>Pay date</th>
                    <th className="cell-numeric">Paid / LOP</th>
                    <th className="cell-numeric">Gross</th>
                    <th className="cell-numeric">Tax</th>
                    <th className="cell-numeric">Net pay</th>
                    <th aria-label="Payslip PDF" />
                  </tr>
                </thead>
                <tbody>
                  {payslipsData.runPayslips.map((payslip) => (
                    <tr key={payslip.id}>
                      <td data-label="Payslip">
                        <div className="employee-primary">{payslip.payslipNumber}</div>
                      </td>
                      <td data-label="Employee">
                        <Link className="table-link" to={`/employees/${payslip.employeeId}`}>
                          {payslip.employeeName}
                        </Link>
                        <div className="employee-secondary">{payslip.employeeNumber}</div>
                      </td>
                      <td data-label="Pay date">{payslip.payDate}</td>
                      <td className="cell-numeric" data-label="Paid / LOP">
                        {payslip.paidDays}
                        {payslip.lopDays > 0 ? ` / LOP ${payslip.lopDays}` : ''}
                      </td>
                      <td className="cell-numeric" data-label="Gross">{formatMoney(payslip.grossAmount, payslip.currency)}</td>
                      <td className="cell-numeric" data-label="Tax">{formatMoney(payslip.incomeTaxAmount, payslip.currency)}</td>
                      <td className="cell-numeric" data-label="Net pay">
                        <strong>{formatMoney(payslip.netPayAmount, payslip.currency)}</strong>
                      </td>
                      <td data-label="PDF">
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => {
                            void (async () => {
                              setError(null);
                              try {
                                const result = await loadPayslipPdf({
                                  variables: { payslipId: payslip.id },
                                });
                                if (!result.data) return;
                                downloadBase64File(
                                  `${payslip.payslipNumber}.pdf`,
                                  result.data.payslipPdf,
                                );
                              } catch (cause) {
                                setError(
                                  cause instanceof Error ? cause.message : 'Could not render PDF.',
                                );
                              }
                            })();
                          }}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="employee-detail-panel compensation-actions-panel" aria-label="Run actions">
        <div className="panel-title-row">
          <div>
            <div className="panel-kicker">Finance operations</div>
            <h2 className="panel-title">{isFinalized ? 'Run locked' : 'Review draft'}</h2>
          </div>
          <IconLock size={theme.icon.size.lg} stroke={theme.icon.stroke.lg} />
        </div>

        {!isFinalized && run ? (
          <div className="config-form">
            <h3 className="section-title">Finalize checklist</h3>
            <ul className="field-list">
              <li className="field-row">
                <span>Lines</span>
                <span className="field-value">{lines.length}</span>
              </li>
              <li className="field-row">
                <span>Total net payable</span>
                <span className="field-value">{formatMoney(totalNet, run.currency)}</span>
              </li>
              <li className="field-row">
                <span>Status</span>
                <span className="field-value">Draft — editable until you finalize</span>
              </li>
            </ul>
            <p className="field-hint">
              Finalizing locks the run and creates a payslip for everyone. Use the Finalize button
              above; you can then download bank advice for payment.
            </p>
          </div>
        ) : null}

        {isFinalized ? (
          <div className="config-form">
            <h3 className="section-title">Adjust a line?</h3>
            <p className="field-hint">
              This run is locked to protect issued payslips. Corrections go into the next monthly
              run.
            </p>
          </div>
        ) : null}
      </aside>

      <Modal
        isOpen={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        title="Finalize with blockers"
        width="sm"
      >
        <p className="field-hint">
          {readinessData?.payrollReadiness
            ? `${readinessData.payrollReadiness.hardBlockerCount} employee${
                readinessData.payrollReadiness.hardBlockerCount === 1 ? '' : 's'
              } still have hard blockers. Finalizing anyway needs a written reason — it is recorded on the run.`
            : 'Finalizing anyway needs a written reason — it is recorded on the run.'}
        </p>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <form
          className="config-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!finalizeReason.trim()) return;
            void submitFinalize(finalizeReason.trim());
          }}
        >
          <div className="field">
            <label htmlFor="finalize-reason">Reason</label>
            <textarea
              id="finalize-reason"
              autoFocus
              placeholder="e.g. Bank details pending for two joiners; paying this cycle and correcting next month."
              required
              rows={3}
              value={finalizeReason}
              onChange={(event) => setFinalizeReason(event.target.value)}
            />
          </div>
          <button
            className="button button-primary button-full"
            disabled={finalizing || !finalizeReason.trim()}
            type="submit"
          >
            <IconLock size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {finalizing ? 'Finalizing…' : 'Finalize anyway'}
          </button>
        </form>
      </Modal>
    </main>
  );
};
