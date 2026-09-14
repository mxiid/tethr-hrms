import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import { useTheme } from '../../../../providers/theme/useTheme';

type PayrollReadinessBlocker = {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
};

type EmployeePayrollReadiness = {
  readonly employeeId: string;
  readonly displayName: string | null;
  readonly blockers: readonly PayrollReadinessBlocker[];
};

export type PayrollReadinessRecord = {
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly hardBlockerCount: number;
  readonly warningCount: number;
  readonly employees: readonly EmployeePayrollReadiness[];
};

type Props = {
  readonly readiness: PayrollReadinessRecord;
};

// "Who can be paid, and what's missing" — Phase 1 readiness spine. Every blocked
// name links to the employee record so finance can fix it at the source.
export const PayrollReadinessBanner = ({ readiness }: Props) => {
  const { theme } = useTheme();
  const isClear = readiness.hardBlockerCount === 0 && readiness.warningCount === 0;

  if (isClear) {
    return (
      <div className="payroll-readiness payroll-readiness--clear" role="status">
        <span className="payroll-readiness__head">
          <IconCircleCheck size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          All active employees are ready to be paid this period.
        </span>
      </div>
    );
  }

  return (
    <section
      className="payroll-readiness field-hint-warning"
      aria-label="Payroll readiness"
    >
      <div className="payroll-readiness__head">
        <IconAlertTriangle size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
        <span>
          {readiness.hardBlockerCount} employee{readiness.hardBlockerCount === 1 ? '' : 's'} can&apos;t
          be paid
          {readiness.warningCount > 0 ? ` · ${readiness.warningCount} warning${readiness.warningCount === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      <ul className="payroll-readiness__list">
        {readiness.employees.map((entry) => {
          const messages = entry.blockers.map((blocker) => blocker.message).join(' · ');
          const hasHard = entry.blockers.some((blocker) => blocker.severity === 'hard');
          return (
            <li key={entry.employeeId}>
              <Link className="table-link" to={`/employees/${entry.employeeId}`}>
                {entry.displayName ?? entry.employeeId}
              </Link>{' '}
              — {messages}
              {hasHard ? '' : ' (warning)'}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
