import { Injectable } from '@nestjs/common';
import { renderToStaticMarkup } from 'react-dom/server';

import { amountInWords, formatLongDate } from '../../../../core/pdf/formatting';
import { PdfRendererService } from '../../../../core/pdf/pdf-renderer.service';
import type { ClientBillingConfig } from '../entities/client-billing-config.entity';
import { InvoiceLine } from '../entities/invoice-line.entity';
import { Invoice } from '../entities/invoice.entity';

import { InvoiceAddendumPdfTemplate } from './invoice-addendum.template';
import { InvoicePdfTemplate } from './invoice-pdf.template';
import type { InvoicePdfData } from './invoice-pdf.types';

const pad2 = (value: number): string => String(value).padStart(2, '0');
const money = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

// Line kind → the category string finance's sheet has always used; the
// addendum groups on it and the consolidation rule keys off it.
const categoryForKind = (kind: string): string => {
  if (kind === 'fee') return 'Fee';
  if (kind === 'expense') return 'Expense';
  return 'Salary';
};

const detailedItems = (lines: readonly InvoiceLine[]) =>
  lines.map((line) => ({
    name: line.employeeName ?? '-',
    description:
      line.monthLabel != null ? `${line.description} (${line.monthLabel})` : line.description,
    category: categoryForKind(line.kind),
    month: line.monthLabel ?? '',
    quantity: String(Number(line.quantity)),
    unitPrice: money(Number(line.unitPrice)),
    total: money(Number(line.total)),
  }));

// Builds Invoify-shaped documents from billing state and renders them through
// the shared headless-browser pipeline. Two documents per invoice, matching
// finance's manual flow: a consolidated client-facing invoice (one
// "Professional Services" line) plus an itemized addendum statement.
@Injectable()
export class InvoicePdfService {
  constructor(private readonly renderer: PdfRendererService) {}

  async renderInvoicePdf(
    invoice: Invoice,
    config: ClientBillingConfig,
    groupName: string,
  ): Promise<Buffer> {
    const data = this.toTemplateData(invoice, config, groupName);
    const html = renderToStaticMarkup(InvoicePdfTemplate(data));
    return this.renderer.renderHtmlToPdf(html);
  }

  async renderAddendumPdf(
    invoice: Invoice,
    lines: readonly InvoiceLine[],
    config: ClientBillingConfig,
    groupName: string,
  ): Promise<Buffer> {
    const data = this.toTemplateData(invoice, config, groupName);
    const detailed: InvoicePdfData = {
      ...data,
      invoice: { ...data.invoice, items: detailedItems(lines) },
    };
    const html = renderToStaticMarkup(InvoiceAddendumPdfTemplate(detailed));
    return this.renderer.renderHtmlToPdf(html);
  }

  private toTemplateData(
    invoice: Invoice,
    config: ClientBillingConfig,
    groupName: string,
  ): InvoicePdfData {
    const periodEndInclusiveDate = new Date(`${invoice.periodEndExclusive}T00:00:00Z`);
    periodEndInclusiveDate.setUTCDate(periodEndInclusiveDate.getUTCDate() - 1);
    const billingPeriodEnd = `${periodEndInclusiveDate.getUTCFullYear()}-${pad2(
      periodEndInclusiveDate.getUTCMonth() + 1,
    )}-${pad2(periodEndInclusiveDate.getUTCDate())}`;

    // Consolidation rule (ported from Invoify's generatePdfService): when items
    // carry categories, the client-facing invoice shows ONE line and the
    // addendum carries the breakdown.
    const periodStart = formatLongDate(invoice.periodStart);
    const periodEnd = formatLongDate(billingPeriodEnd);
    const consolidatedItems = [
      {
        name: invoice.type === 'expenses' ? 'Reimbursable Engagement Expenses' : 'Professional Services',
        description:
          invoice.type === 'expenses'
            ? `Reimbursable expenses incurred during the engagement period ${periodStart} \u2013 ${periodEnd}`
            : `Independent professional services rendered for the period ${periodStart} \u2013 ${periodEnd}`,
        category: '',
        month: '',
        quantity: '1',
        unitPrice: money(Number(invoice.subTotal)),
        total: money(Number(invoice.subTotal)),
      },
    ];

    // Issued documents render from the snapshot frozen at issue; drafts still
    // render live config because they are editable working state. When a
    // snapshot exists it is authoritative for every field — a value that was
    // empty at issue stays empty, rather than picking up a later setup edit.
    const frozen = invoice.issuedSnapshot;
    const sender = frozen
      ? {
          name: frozen.senderName ?? 'Tethr Pvt. Ltd.',
          address: frozen.senderAddress ?? '',
          zipCode: frozen.senderZipCode ?? '',
          city: frozen.senderCity ?? '',
          country: frozen.senderCountry ?? '',
          email: frozen.senderEmail ?? '',
          phone: frozen.senderPhone ?? '',
        }
      : {
          name: config.senderName ?? 'Tethr Pvt. Ltd.',
          address: config.senderAddress ?? '',
          zipCode: config.senderZipCode ?? '',
          city: config.senderCity ?? '',
          country: config.senderCountry ?? '',
          email: config.senderEmail ?? '',
          phone: config.senderPhone ?? '',
        };
    const bankSwift = frozen ? frozen.bankSwift : config.bankSwift;
    const bankName = frozen ? frozen.bankName : config.bankName;
    const bankAccountName = frozen ? frozen.bankAccountName : config.bankAccountName;
    const bankAccountNumber = frozen ? frozen.bankAccountNumber : config.bankAccountNumber;
    const paymentTermsNetDays = frozen
      ? frozen.paymentTermsNetDays
      : config.paymentTermsNetDays;

    return {
      logoDataUrl: frozen ? frozen.logoDataUrl : config.invoiceLogoDataUrl,
      signatureDataUrl: frozen ? frozen.signatureDataUrl : config.signatureDataUrl,
      sender,
      receiver: {
        name: invoice.receiverName ?? groupName,
        address: invoice.receiverAddress ?? '',
        zipCode: invoice.receiverZipCode ?? '',
        city: invoice.receiverCity ?? '',
        country: invoice.receiverCountry ?? '',
        email: invoice.receiverEmail ?? '',
        phone: invoice.receiverPhone ?? '',
      },
      invoice: {
        number: invoice.number ?? 'DRAFT',
        issueDate: invoice.issueDate ?? '',
        dueDate: invoice.dueDate ?? '',
        billingPeriodStart: invoice.periodStart,
        billingPeriodEnd,
        currency: invoice.currency,
        items: consolidatedItems,
        subTotal: Number(invoice.subTotal),
        totalAmount: Number(invoice.totalAmount),
        totalInWords: amountInWords(Number(invoice.totalAmount), invoice.currency),
        additionalNotes: bankSwift ? `SWIFT/BIC: ${bankSwift}` : null,
        paymentTerms: `Net ${paymentTermsNetDays}`,
        bank:
          bankName || bankAccountName || bankAccountNumber
            ? {
                name: bankName ?? '',
                accountName: bankAccountName ?? '',
                accountNumber: bankAccountNumber ?? '',
              }
            : null,
      },
    };
  }
}

