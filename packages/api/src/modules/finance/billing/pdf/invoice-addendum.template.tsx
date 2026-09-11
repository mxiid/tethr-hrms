import type { ReactNode } from 'react';

import { formatLongDate, formatNumberWithCommas } from '../../../../core/pdf/formatting';

import type { InvoicePdfData } from './invoice-pdf.types';

const formatDate = formatLongDate;
const money = formatNumberWithCommas;

// Ported from Invoify's AddendumTemplate: the itemized "Service/Expense Detail
// Statement" that accompanies the consolidated invoice. Items group by Month,
// then Category, with per-category subtotals, per-month totals, and the
// PE-safe disclaimer finance sends clients today.
export const InvoiceAddendumPdfTemplate = (data: InvoicePdfData): ReactNode => {
  const { sender, receiver, invoice } = data;
  const isExpenses = invoice.items.some((item) => item.category === 'Expense');

  const documentTitle = isExpenses ? 'Expense Detail Statement' : 'Service Detail Statement';

  const documentDescription = isExpenses
    ? `This document provides an itemized breakdown of reimbursable expenses referenced in Invoice #${invoice.number}, incurred during the engagement period ${formatDate(invoice.billingPeriodStart)} \u2013 ${formatDate(invoice.billingPeriodEnd)}. This statement is furnished solely for transparency and record-keeping purposes in connection with the independent service engagement between the parties.`
    : `This document provides an itemized breakdown of the independent professional services referenced in Invoice #${invoice.number}, rendered during the engagement period ${formatDate(invoice.billingPeriodStart)} \u2013 ${formatDate(invoice.billingPeriodEnd)}. This statement is furnished solely for transparency and record-keeping purposes in connection with the independent service engagement between the parties.`;

  // Group items by Month, then Category within each month.
  type Item = InvoicePdfData['invoice']['items'][number];
  const groupedByMonth = invoice.items.reduce(
    (months, item) => {
      const month = item.month || 'Unspecified Period';
      const category = item.category || 'Uncategorized';
      if (!months[month]) months[month] = {};
      if (!months[month][category]) months[month][category] = [];
      months[month][category].push(item);
      return months;
    },
    {} as Record<string, Record<string, Item[]>>,
  );

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <section style={{ fontFamily: 'Manrope, sans-serif' }}>
        <div className="flex flex-col p-4 sm:p-10 bg-white rounded-xl min-h-[60rem]">
          <div className="flex justify-between">
            <div>
              {data.logoDataUrl ? (
                <img src={data.logoDataUrl} width={140} height={100} alt={`Logo of ${sender.name}`} />
              ) : null}
              <h1 className="mt-2 text-lg md:text-xl font-semibold text-blue-600">{sender.name}</h1>
            </div>
            <div className="text-right">
              <h2 className="text-2xl md:text-3xl font-semibold text-gray-800">{documentTitle}</h2>
              <span className="mt-1 block text-gray-500">Reference: Invoice #{invoice.number}</span>
              <span className="mt-1 block text-sm text-gray-400">
                Engagement Period: {formatDate(invoice.billingPeriodStart)} {'\u2013'}{' '}
                {formatDate(invoice.billingPeriodEnd)}
              </span>
              <address className="mt-4 not-italic text-gray-800">
                {sender.address}
                <br />
                {sender.zipCode}, {sender.city}
                <br />
                {sender.country}
                <br />
              </address>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Prepared for:</h3>
              <h3 className="text-lg font-semibold text-gray-800">{receiver.name}</h3>
              <address className="mt-2 not-italic text-gray-500">
                {receiver.address ? `${receiver.address}` : null}
                {receiver.zipCode ? `, ${receiver.zipCode}` : null}
                <br />
                {receiver.city}, {receiver.country}
                <br />
              </address>
            </div>
            <div className="sm:text-right space-y-2">
              <dl className="grid sm:grid-cols-6 gap-x-3">
                <dt className="col-span-3 font-semibold text-gray-800">Invoice date:</dt>
                <dd className="col-span-3 text-gray-500">{formatDate(invoice.issueDate)}</dd>
              </dl>
              <dl className="grid sm:grid-cols-6 gap-x-3">
                <dt className="col-span-3 font-semibold text-gray-800">Due date:</dt>
                <dd className="col-span-3 text-gray-500">{formatDate(invoice.dueDate)}</dd>
              </dl>
              <dl className="grid sm:grid-cols-6 gap-x-3">
                <dt className="col-span-3 font-semibold text-gray-800">Billing period:</dt>
                <dd className="col-span-3 text-gray-500">
                  {formatDate(invoice.billingPeriodStart)} {' \u2013 '}
                  {formatDate(invoice.billingPeriodEnd)}
                </dd>
              </dl>
            </div>
          </div>

          <div className="mt-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">{documentDescription}</p>
          </div>

          <div className="mt-4">
            {Object.entries(groupedByMonth).map(([month, categories]) => {
              const monthTotal = Object.values(categories)
                .flat()
                .reduce((sum, item) => sum + Number(item.total), 0);

              return (
                <div key={month} className="mb-6">
                  <div className="bg-blue-600 px-4 py-3 rounded-t-lg">
                    <h3 className="text-lg font-bold text-white tracking-wide">{month}</h3>
                  </div>

                  <div className="border-l-4 border-blue-600 pl-3 pr-0 pt-3 pb-2">
                    {Object.entries(categories).map(([category, items]) => {
                      const categorySubtotal = items.reduce(
                        (sum, item) => sum + Number(item.total),
                        0,
                      );

                      return (
                        <div key={`${month}-${category}`} className="mb-4">
                          <div className="bg-gray-100 px-3 py-2 rounded-t-lg">
                            <h4 className="font-semibold text-gray-800">{category}</h4>
                          </div>

                          <div className="border border-gray-200 rounded-b-lg">
                            <div className="hidden sm:grid sm:grid-cols-12 px-3 py-1 border-b border-gray-200">
                              <div className="col-span-4 text-xs font-medium text-gray-500 uppercase">Item</div>
                              <div className="col-span-3 text-xs font-medium text-gray-500 uppercase">Description</div>
                              <div className="col-span-1 text-xs font-medium text-gray-500 uppercase">Qty</div>
                              <div className="col-span-2 text-xs font-medium text-gray-500 uppercase">Rate</div>
                              <div className="col-span-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</div>
                            </div>

                            {items.map((item, index) => (
                              <div
                                key={index}
                                className="grid grid-cols-3 sm:grid-cols-12 px-3 py-2 border-b border-gray-100 gap-y-1"
                              >
                                <div className="col-span-full sm:col-span-4">
                                  <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                                </div>
                                <div className="col-span-full sm:col-span-3">
                                  <p className="text-xs text-gray-600 whitespace-pre-line">{item.description}</p>
                                </div>
                                <div className="sm:col-span-1">
                                  <p className="text-sm text-gray-800">{item.quantity}</p>
                                </div>
                                <div className="sm:col-span-2">
                                  <p className="text-sm text-gray-800">
                                    {item.unitPrice} {invoice.currency}
                                  </p>
                                </div>
                                <div className="sm:col-span-2">
                                  <p className="text-sm text-right text-gray-800">
                                    {item.total} {invoice.currency}
                                  </p>
                                </div>
                              </div>
                            ))}

                            <div className="grid sm:grid-cols-12 px-3 py-2 bg-gray-50">
                              <div className="sm:col-span-10 text-right">
                                <p className="text-sm font-semibold text-gray-700">{category} Subtotal:</p>
                              </div>
                              <div className="sm:col-span-2 text-right">
                                <p className="text-sm font-semibold text-gray-800">
                                  {money(categorySubtotal)} {invoice.currency}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="grid sm:grid-cols-12 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mt-2">
                      <div className="sm:col-span-10 text-right">
                        <p className="text-sm font-bold text-blue-800">{month} Total:</p>
                      </div>
                      <div className="sm:col-span-2 text-right">
                        <p className="text-sm font-bold text-blue-800">
                          {money(monthTotal)} {invoice.currency}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex sm:justify-end">
            <div className="sm:text-right space-y-2 w-full sm:w-auto">
              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-3">
                <dt className="col-span-1 sm:col-span-3 font-semibold text-gray-800">Subtotal:</dt>
                <dd className="col-span-1 sm:col-span-2 text-gray-500 sm:text-right">
                  {money(invoice.subTotal)} {invoice.currency}
                </dd>
              </dl>
              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-3">
                <dt className="col-span-1 sm:col-span-3 font-semibold text-gray-800">Total:</dt>
                <dd className="col-span-1 sm:col-span-2 text-gray-500 sm:text-right">
                  {money(invoice.totalAmount)} {invoice.currency}
                </dd>
              </dl>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 italic">
              This document is a non-binding supplementary statement provided for informational and
              record-keeping purposes only, in connection with the independent service engagement
              between {sender.name} and {receiver.name}. It does not constitute a separate invoice,
              contract, or agreement, and does not create any additional payment obligations beyond
              those stated in Invoice #{invoice.number}. The relationship between the parties is
              that of independent contracting entities. Nothing in this document shall be construed
              as establishing an employment relationship, agency, partnership, joint venture, or
              any form of permanent establishment of either party in the jurisdiction of the other.
            </p>
          </div>

          {data.signatureDataUrl ? (
            <div className="mt-6">
              <p className="font-semibold text-gray-800">Signature:</p>
              <img src={data.signatureDataUrl} width={120} height={60} alt={`Signature of ${sender.name}`} />
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
};
