import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { IconLock, IconRefresh } from '@tabler/icons-react';
import { Fragment, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';

import { downloadBase64File } from '../../../../app/download';
import { useTheme } from '../../../../providers/theme/useTheme';
import {
  BANK_ADVICE_CSV_QUERY,
  FINALIZE_PAYROLL_RUN_MUTATION,
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
  readonly amount: number;
};

type RunLineRecord = {
  readonly id: string;
  readonly employeeId: string;
  readonly displayName: string | null;
  readonly payableDays: number;
  readonly lopDays: number;
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
    readonly lines?: readonly RunLineRecord[];
  };
};

type PayslipRecord = {
  readonly id: string;
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

  const { data, loading, error: loadError, refetch } = useQuery<PayrollRunData>(
    PAYROLL_RUN_QUERY,
    { variables: { runId } },
  );
  const isFinalized = data?.payrollRun.status === 'finalized';

  const { data: payslipsData } = useQuery<{ readonly runPayslips: readonly PayslipRecord[] }>(
    RUN_PAYSLIPS_QUERY,
    { variables: { runId }, skip: !isFinalized },
  );

  const [regenerateRun, { loading: regenerating }] = useMutation(
    REGENERATE_PAYROLL_RUN_MUTATION,
  );
  const [finalizeRun, { loading: finalizing }] = useMutation(FINALIZE_PAYROLL_RUN_MUTATION);
  const [updateLine] = useMutation(UPDATE_PAYROLL_RUN_LINE_MUTATION);
  const [removeLine] = useMutation(REMOVE_PAYROLL_RUN_LINE_MUTATION);
  const [loadBankAdvice] = useLazyQuery<{ readonly bankAdviceCsv: string }>(
    BANK_ADVICE_CSV_QUERY,
    { fetchPolicy: 'no-cache' },
  );
  const [loadPayslipPdf] = useLazyQuery<{ readonly payslipPdf: string }>(
    PAYSLIP_PDF_QUERY,
    { fetchPolicy: 'no-cache' },
  );

  const runAction = async (action: () => Promise<unknown>, successMessage: string): Promise<void> => {
    setError(null);
    setMessage(null);
    try {
      await action();
      await refetch();
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed.');
    }
  };

  const onFinalize = async (): Promise<void> => {
    await runAction(
      () => finalizeRun({ variables: { runId } }),
      'Run finalized — payslips are locked and the billing handoff event was emitted.',
    );
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
          <p className="auth-error" role="alert">Could not load this payroll run.</p>
          <Link className="link-button" to="/payroll">Back to runs</Link>
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
                      'Draft recomputed from current salaries and leave.',
                    );
                  }}
                >
                  <IconRefresh size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                  {regenerating ? 'Recomputing…' : 'Regenerate'}
                </button>
                <button
                  className="button button-primary"
                  disabled={finalizing || lines.length === 0}
                  onClick={() => {
                    void onFinalize();
                  }}
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
            <Link className="button button-secondary" to="/payroll">
              All runs
            </Link>
          </div>
        </header>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <section className="table-shell" aria-labelledby="run-lines-title">
          <div className="table-title-row">
            <div className="table-title" id="run-lines-title">
              {isFinalized ? 'Locked lines (as disbursed)' : 'Draft lines'}
            </div>
            <div className="table-density">
              {loading ? 'Loading…' : `${lines.length} employee${lines.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Paid days</th>
                  <th>LOP</th>
                  <th>Gross</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th>Net pay</th>
                  {!isFinalized ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={isFinalized ? 7 : 8}>No lines — regenerate the draft.</td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <Fragment key={line.id}>
                      <tr>
                        <td>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => setExpandedLineId(expandedLineId === line.id ? null : line.id)}
                          >
                            <span className="employee-primary">{line.displayName ?? line.employeeId}</span>
                          </button>
                          {line.note ? <div className="employee-secondary">{line.note}</div> : null}
                        </td>
                        <td>{line.payableDays}</td>
                        <td>{line.lopDays}</td>
                        <td>{run ? formatMoney(line.grossAmount, run.currency) : '—'}</td>
                        <td>{run ? formatMoney(line.taxableAmount, run.currency) : '—'}</td>
                        <td>
                          {formatMoney(line.incomeTax, run?.currency ?? 'PKR')}
                          {line.taxOverrideAmount !== null ? (
                            <span
                              className="chip"
                              style={{ '--chip-color': 'var(--hrms-color-tag-amber)' } as CSSProperties}
                            >
                              <span className="chip-dot" />
                              override
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <strong>{formatMoney(line.netPayAmount, run?.currency ?? 'PKR')}</strong>
                        </td>
                        {!isFinalized ? (
                          <td>
                            <button
                              className="icon-button"
                              title="Remove line"
                              type="button"
                              onClick={() => {
                                void runAction(
                                  () => removeLine({ variables: { lineId: line.id, runId } }),
                                  'Line removed.',
                                );
                              }}
                            >
                              ✕
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
                                      {formatMoney(component.amount, run?.currency ?? 'PKR')}
                                      {component.taxable ? '' : ' · non-taxable'}
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
                  ))
                )}
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
              <div className="table-density">{payslipsData.runPayslips.length} snapshots</div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Payslip</th>
                    <th>Employee</th>
                    <th>Pay date</th>
                    <th>Paid / LOP</th>
                    <th>Gross</th>
                    <th>Tax</th>
                    <th>Net pay</th>
                    <th aria-label="Payslip PDF" />
                  </tr>
                </thead>
                <tbody>
                  {payslipsData.runPayslips.map((payslip) => (
                    <tr key={payslip.id}>
                      <td>
                        <div className="employee-primary">{payslip.payslipNumber}</div>
                      </td>
                      <td>
                        <div className="employee-primary">{payslip.employeeName}</div>
                        <div className="employee-secondary">{payslip.employeeNumber}</div>
                      </td>
                      <td>{payslip.payDate}</td>
                      <td>
                        {payslip.paidDays}
                        {payslip.lopDays > 0 ? ` / LOP ${payslip.lopDays}` : ''}
                      </td>
                      <td>{formatMoney(payslip.grossAmount, payslip.currency)}</td>
                      <td>{formatMoney(payslip.incomeTaxAmount, payslip.currency)}</td>
                      <td>
                        <strong>{formatMoney(payslip.netPayAmount, payslip.currency)}</strong>
                      </td>
                      <td>
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
                <span className="field-value">draft — fully recomputable</span>
              </li>
            </ul>
            <p className="field-hint">
              Finalizing writes an immutable payslip per line, locks the run, produces the bank
              advice file, and notifies downstream billing.
            </p>
            <button
              className="button button-primary button-full"
              disabled={finalizing || lines.length === 0}
              type="button"
              onClick={() => {
                void onFinalize();
              }}
            >
              {finalizing ? 'Finalizing…' : 'Finalize & lock'}
            </button>
          </div>
        ) : null}

        {isFinalized ? (
          <div className="config-form">
            <h3 className="section-title">Adjust a line?</h3>
            <p className="field-hint">
              This run is locked by design. Corrections ride the next monthly draft as catch-up
              amounts so issued history stays immutable.
            </p>
          </div>
        ) : null}
      </aside>
    </main>
  );
};
