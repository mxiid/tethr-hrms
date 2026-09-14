import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const MY_EMPLOYMENT_SUMMARY_QUERY = gql`
  query DashboardMyEmploymentSummary($asOf: String!) {
    myEmployee {
      id
      hireDate
      probationEndDate
      employmentStatus
      workerType
    }
    myCurrentSalaryRevision(asOf: $asOf) {
      id
      currency
      annualAmount
    }
  }
`;

type MyEmploymentSummaryData = {
  readonly myEmployee: {
    readonly id: string;
    readonly hireDate: string;
    readonly probationEndDate: string | null;
    readonly employmentStatus: string;
    readonly workerType: string;
  } | null;
  readonly myCurrentSalaryRevision: {
    readonly id: string;
    readonly currency: string;
    readonly annualAmount: number;
  } | null;
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: 'Active',
  onLeave: 'On leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

const tenureFrom = (hireDate: string): string => {
  const start = new Date(`${hireDate}T00:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 1) return 'New joiner';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts = [
    years > 0 ? `${years}y` : null,
    remainingMonths > 0 ? `${remainingMonths}m` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' ');
};

export const MY_EMPLOYMENT_SUMMARY_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'status', label: 'Status' },
  { id: 'workerType', label: 'Worker type' },
  { id: 'tenure', label: 'Tenure' },
  { id: 'annualSalary', label: 'Annual salary' },
  { id: 'probationEnds', label: 'Probation ends' },
];

export const useMyEmploymentSummaryData = (): WidgetData => {
  const asOf = new Date().toISOString().slice(0, 10);
  const { data, loading, error } = useQuery<MyEmploymentSummaryData>(MY_EMPLOYMENT_SUMMARY_QUERY, {
    variables: { asOf },
  });

  const employee = data?.myEmployee;
  const salary = data?.myCurrentSalaryRevision;

  return {
    loading,
    error: Boolean(error),
    values: {
      status: employee ? (STATUS_LABELS[employee.employmentStatus] ?? employee.employmentStatus) : '—',
      workerType: employee?.workerType ?? '—',
      tenure: employee ? tenureFrom(employee.hireDate) : '—',
      annualSalary: salary
        ? new Intl.NumberFormat('en', {
            currency: salary.currency,
            maximumFractionDigits: 0,
            style: 'currency',
          }).format(salary.annualAmount)
        : '—',
      probationEnds: employee?.probationEndDate ?? '—',
    },
  };
};
