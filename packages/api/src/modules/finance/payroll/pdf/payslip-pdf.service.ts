import { Injectable } from '@nestjs/common';
import { renderToStaticMarkup } from 'react-dom/server';

import { PdfRendererService } from '../../../../core/pdf/pdf-renderer.service';
import type { PayslipLine } from '../entities/payslip-line.entity';
import { Payslip } from '../entities/payslip.entity';

import { PayslipPdfTemplate } from './payslip-pdf.template';
import type { PayslipPdfData } from './payslip-pdf.types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

// Renders the Zoho-style payslip from an immutable snapshot. Earnings and
// deductions come straight from the snapshotted component lines; income tax is
// a run column rather than a line, so the mapper appends it to the deductions
// column to keep the document's ledger complete.
@Injectable()
export class PayslipPdfService {
  constructor(private readonly renderer: PdfRendererService) {}

  async renderPayslipPdf(
    payslip: Payslip,
    lines: readonly PayslipLine[],
    employer: { readonly name: string; readonly location: string },
  ): Promise<Buffer> {
    const data = this.toTemplateData(payslip, lines, employer);
    const html = renderToStaticMarkup(PayslipPdfTemplate(data));
    return this.renderer.renderHtmlToPdf(html);
  }

  private toTemplateData(
    payslip: Payslip,
    lines: readonly PayslipLine[],
    employer: { readonly name: string; readonly location: string },
  ): PayslipPdfData {
    const earnings = lines
      .filter((line) => line.category === 'earning')
      .map((line) => ({ name: line.componentName, amount: Number(line.amount) }));
    const deductionLines = lines
      .filter((line) => line.category === 'deduction')
      .map((line) => ({ name: line.componentName, amount: Number(line.amount) }));
    const deductions = [
      ...deductionLines,
      { name: 'Income Tax', amount: round2(Number(payslip.incomeTaxAmount)) },
    ];

    return {
      employer,
      employee: {
        name: payslip.employeeName,
        designation: payslip.roleTitle ?? '',
        code: payslip.employeeNumber,
        dateOfJoining: payslip.hireDate,
      },
      period: `${payslip.periodYear}-${String(payslip.periodMonth).padStart(2, '0')}`,
      payDate: payslip.payDate,
      payslipNumber: payslip.payslipNumber,
      currency: payslip.currency,
      paidDays: Number(payslip.paidDays),
      lopDays: Number(payslip.lopDays),
      earnings,
      deductions,
      grossEarnings:
        earnings.length > 0
          ? round2(earnings.reduce((sum, row) => sum + row.amount, 0))
          : Number(payslip.grossAmount),
      totalDeductions: round2(deductions.reduce((sum, row) => sum + row.amount, 0)),
      taxableSalary: Number(payslip.taxableAmount),
      netPayable: Number(payslip.netPayAmount),
      notes: payslip.notes,
    };
  }
}
