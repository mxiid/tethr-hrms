import { gql, useQuery } from '@apollo/client';

import type { WidgetData, WidgetFieldDefinition } from './types';

const EMPLOYEE_COUNTS_QUERY = gql`
  query DashboardEmployeeCounts {
    employees {
      id
      employmentStatus
    }
  }
`;

type EmployeeCountsData = {
  employees: ReadonlyArray<{ id: string; employmentStatus: string }>;
};

export const EMPLOYEE_COUNTS_FIELDS: readonly WidgetFieldDefinition[] = [
  { id: 'total', label: 'Employees' },
  { id: 'active', label: 'Active' },
  { id: 'onLeave', label: 'On leave' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'terminated', label: 'Terminated' },
];

export const useEmployeeCountsData = (): WidgetData => {
  const { data, loading, error } = useQuery<EmployeeCountsData>(EMPLOYEE_COUNTS_QUERY);
  const employees = data?.employees ?? [];
  const countWhere = (status: string): number =>
    employees.filter((employee) => employee.employmentStatus === status).length;

  return {
    loading,
    error: Boolean(error),
    values: {
      total: employees.length,
      active: countWhere('active'),
      onLeave: countWhere('onLeave'),
      suspended: countWhere('suspended'),
      terminated: countWhere('terminated'),
    },
    breakdown: [
      { id: 'active', label: 'Active', value: countWhere('active') },
      { id: 'onLeave', label: 'On leave', value: countWhere('onLeave') },
      { id: 'suspended', label: 'Suspended', value: countWhere('suspended') },
      { id: 'terminated', label: 'Terminated', value: countWhere('terminated') },
    ],
  };
};
