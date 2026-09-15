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
  // Employer-side cost on top of gross; rendered as a separate section and never
  // mixed into the employee's earnings/deductions.
  readonly employerContributions: readonly { readonly name: string; readonly amount: number }[];
  readonly employerCost: number;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly taxableSalary: number;
  readonly netPayable: number;
  // The profile facts applied to withholding, when any (rendered on the
  // computed line so the trail travels with the document).
  readonly taxProfileSummary: string | null;
  readonly notes: string | null;
};
