import type { ReactNode } from 'react';

import { formatLongDate, formatNumberWithCommas } from '../../../../core/pdf/formatting';

import type { InvoicePdfData } from './invoice-pdf.types';

const formatDate = formatLongDate;
const money = formatNumberWithCommas;

// Layout ported from Invoify's InvoiceLayout: Manrope via Google Fonts, white
// card on A4. Tailwind classes compile at render time from the CDN stylesheet
// the PdfRendererService injects — same mechanism, same pixels.

const InvoiceLayout = ({ children }: { children: ReactNode }): ReactNode => (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <section style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div className="flex flex-col p-4 sm:p-10 bg-white rounded-xl min-h-[60rem]">{children}</div>
    </section>
  </>
);

export const InvoicePdfTemplate = (data: InvoicePdfData): ReactNode => {
  const { sender, receiver, invoice } = data;
  return (
    <InvoiceLayout>
      <div className="flex justify-between">
        <div>
          {data.logoDataUrl ? (
            <img src={data.logoDataUrl} width={140} height={100} alt={`Logo of ${sender.name}`} />
          ) : null}
          <h1 className="mt-2 text-lg md:text-xl font-semibold text-blue-600">{sender.name}</h1>
        </div>
        <div className="text-right">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-800">Invoice #</h2>
          <span className="mt-1 block text-gray-500">{invoice.number}</span>
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
          <h3 className="text-lg font-semibold text-gray-800">Bill to:</h3>
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
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-2">
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
      </div>

      <div className="mt-3">
        <div className="border border-gray-200 p-1 rounded-lg space-y-1">
          <div className="hidden sm:grid sm:grid-cols-5">
            <div className="sm:col-span-2 text-xs font-medium text-gray-500 uppercase">Item</div>
            <div className="text-left text-xs font-medium text-gray-500 uppercase">Qty</div>
            <div className="text-left text-xs font-medium text-gray-500 uppercase">Rate</div>
            <div className="text-right text-xs font-medium text-gray-500 uppercase">Amount</div>
          </div>
          <div className="hidden sm:block border-b border-gray-200"></div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-y-1">
            {invoice.items.map((item, index) => (
              <div className="contents" key={`${item.name}-${item.description}-${index}`}>
                <div className="col-span-full sm:col-span-2 border-b border-gray-300">
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{item.description}</p>
                </div>
                <div className="border-b border-gray-300">
                  <p className="text-gray-800">{item.quantity}</p>
                </div>
                <div className="border-b border-gray-300">
                  <p className="text-gray-800">
                    {item.unitPrice} {invoice.currency}
                  </p>
                </div>
                <div className="border-b border-gray-300">
                  <p className="sm:text-right text-gray-800">
                    {item.total} {invoice.currency}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="sm:hidden border-b border-gray-200"></div>
        </div>
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
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-3">
            <dt className="col-span-1 sm:col-span-3 font-semibold text-gray-800">
              Total in words:
            </dt>
            <dd className="col-span-1 sm:col-span-2 text-gray-500 sm:text-right">
              <em>
                {invoice.totalInWords} {invoice.currency}
              </em>
            </dd>
          </dl>
        </div>
      </div>

      <div>
        <div className="my-4">
          {invoice.additionalNotes ? (
            <div className="my-2">
              <p className="font-semibold text-blue-600">Additional notes:</p>
              <p className="font-regular text-gray-800">{invoice.additionalNotes}</p>
            </div>
          ) : null}
          <div className="my-2">
            <p className="font-semibold text-blue-600">Payment terms:</p>
            <p className="font-regular text-gray-800">{invoice.paymentTerms}</p>
          </div>
          {invoice.bank ? (
            <div className="my-2">
              <span className="font-semibold text-md text-gray-800">
                Please send the payment to this address
                <p className="text-sm">Bank: {invoice.bank.name}</p>
                <p className="text-sm">Account name: {invoice.bank.accountName}</p>
                <p className="text-sm">Account no: {invoice.bank.accountNumber}</p>
              </span>
            </div>
          ) : null}
        </div>
        <p className="text-gray-500 text-sm">
          If you have any questions concerning this invoice, use the following contact information:
        </p>
        <div>
          <p className="block text-sm font-medium text-gray-800">{sender.email}</p>
          <p className="block text-sm font-medium text-gray-800">{sender.phone}</p>
        </div>
      </div>

      {data.signatureDataUrl ? (
        <div className="mt-6">
          <p className="font-semibold text-gray-800">Signature:</p>
          <img src={data.signatureDataUrl} width={120} height={60} alt={`Signature of ${sender.name}`} />
        </div>
      ) : null}
    </InvoiceLayout>
  );
};
