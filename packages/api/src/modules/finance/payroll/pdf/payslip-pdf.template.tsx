import type { ReactNode } from 'react';

import { formatNumberWithCommas } from '../../../../core/pdf/formatting';

import type { PayslipPdfData } from './payslip-pdf.types';

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  INR: '\u20B9',
  PKR: '\u20A8',
};

const money = (value: number, currency: string): string =>
  `${CURRENCY_SYMBOL[currency] ?? `${currency} `}${formatNumberWithCommas(value)}`;

const SummaryRow = ({ label, value }: { label: string; value: string }): ReactNode => (
  <div className="flex text-sm py-1">
    <div className="w-40 text-gray-600">{label}</div>
    <div className="text-gray-500 px-2">:</div>
    <div className="text-gray-800 font-medium flex-1">
      {value || <span className="text-gray-300">—</span>}
    </div>
  </div>
);

// Ported from Invoify's Zoho-style payslip: same layout, but the Earnings /
// Deductions columns are driven by the run's snapshotted component lines
// instead of fixed manual fields.
export const PayslipPdfTemplate = (data: PayslipPdfData): ReactNode => {
  const { employer, employee } = data;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <section style={{ fontFamily: 'Manrope, sans-serif' }}>
        <div className="flex flex-col p-6 sm:p-10 bg-white rounded-xl min-h-[60rem]">
          <div className="flex justify-between items-start pb-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{employer.name}</h1>
                <p className="text-sm text-gray-500">{employer.location}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Payslip For the Month</p>
              <p className="text-lg font-bold text-gray-900">{data.period}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-3">
                Employee Summary
              </p>
              <SummaryRow label="Employee Name" value={employee.name} />
              <SummaryRow label="Designation" value={employee.designation} />
              <SummaryRow label="Employee ID" value={employee.code} />
              <SummaryRow label="Date of Joining" value={employee.dateOfJoining} />
              <SummaryRow label="Pay Period" value={data.period} />
              {data.payDate ? <SummaryRow label="Pay Date" value={data.payDate} /> : null}
              <SummaryRow label="Payslip #" value={data.payslipNumber} />
            </div>

            <div className="border border-green-200 bg-green-50 rounded-lg p-5">
              <div className="border-l-4 border-green-500 pl-3">
                <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums whitespace-nowrap">
                  {money(data.netPayable, data.currency)}
                </p>
                <p className="text-sm text-gray-600 mt-1">Employee Net Pay</p>
              </div>
              <div className="mt-4 pt-3 border-t border-green-200 space-y-1">
                <div className="flex text-sm">
                  <span className="w-32 text-gray-600">Paid Days</span>
                  <span className="text-gray-500 px-2">:</span>
                  <span className="text-gray-800 font-medium">{data.paidDays}</span>
                </div>
                <div className="flex text-sm">
                  <span className="w-32 text-gray-600">LOP Days</span>
                  <span className="text-gray-500 px-2">:</span>
                  <span className="text-gray-800 font-medium">{data.lopDays}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-b md:border-b-0 md:border-r border-gray-200">
                <div className="flex justify-between px-5 py-3 border-b border-gray-200">
                  <p className="text-xs font-bold text-gray-800 tracking-wider uppercase">Earnings</p>
                  <p className="text-xs font-bold text-gray-800 tracking-wider uppercase">Amount</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.earnings.map((row) => (
                    <div className="flex justify-between px-5 py-3" key={row.name}>
                      <p className="text-sm text-gray-800">{row.name}</p>
                      <p className="text-sm font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {money(row.amount, data.currency)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between px-5 py-3 bg-gray-50 border-t border-gray-200">
                  <p className="text-sm font-bold text-gray-800">Gross Earnings</p>
                  <p className="text-sm font-bold text-gray-800 tabular-nums whitespace-nowrap">
                    {money(data.grossEarnings, data.currency)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex justify-between px-5 py-3 border-b border-gray-200">
                  <p className="text-xs font-bold text-gray-800 tracking-wider uppercase">
                    Deductions
                  </p>
                  <p className="text-xs font-bold text-gray-800 tracking-wider uppercase">Amount</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.deductions.map((row) => (
                    <div className="flex justify-between px-5 py-3" key={row.name}>
                      <p className="text-sm text-gray-800">{row.name}</p>
                      <p className="text-sm font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {money(row.amount, data.currency)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between px-5 py-3 bg-gray-50 border-t border-gray-200">
                  <p className="text-sm font-bold text-gray-800">Total Deductions</p>
                  <p className="text-sm font-bold text-gray-800 tabular-nums whitespace-nowrap">
                    {money(data.totalDeductions, data.currency)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 italic px-1">
            <span className="font-semibold text-gray-600 not-italic">Computed:</span>
            <span className="ml-2">Taxable Salary {money(data.taxableSalary, data.currency)}</span>
            <span className="mx-2">•</span>
            <span>Net Pay {money(data.netPayable, data.currency)}</span>
          </div>

          <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex justify-between items-center">
              <div className="px-5 py-4">
                <p className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Total Net Payable
                </p>
                <p className="text-xs text-gray-500 mt-1">Gross Earnings − Total Deductions</p>
              </div>
              <div className="bg-green-50 border-l border-green-200 px-6 py-4">
                <p className="text-xl md:text-2xl font-bold text-gray-900 tabular-nums whitespace-nowrap">
                  {money(data.netPayable, data.currency)}
                </p>
              </div>
            </div>
          </div>

          {data.notes ? (
            <div className="mt-6">
              <p className="text-sm font-semibold text-blue-600">Notes:</p>
              <p className="text-sm text-gray-800 whitespace-pre-line">{data.notes}</p>
            </div>
          ) : null}

          <div className="mt-10 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500 italic">
              — This document has been automatically generated and does not require a signature. —
            </p>
          </div>
        </div>
      </section>
    </>
  );
};
