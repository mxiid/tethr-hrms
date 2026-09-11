// Document-shaped view for payslip rendering (see invoice-pdf.types rationale).

export type PayslipPdfData = {
  readonly employer: {
    readonly name: string;
    readonly location: string;
  };
  readonly employee: {
    readonly name: string;
    readonly designation: string;
    readonly code: string;
    readonly dateOfJoining: string;
  };
  readonly period: string;
  readonly payDate: string | null;
  readonly payslipNumber: string;
  readonly currency: string;
  readonly paidDays: number;
  readonly lopDays: number;
  readonly earnings: readonly { readonly name: string; readonly amount: number }[];
  readonly deductions: readonly { readonly name: string; readonly amount: number }[];
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly taxableSalary: number;
  readonly netPayable: number;
  readonly notes: string | null;
};
