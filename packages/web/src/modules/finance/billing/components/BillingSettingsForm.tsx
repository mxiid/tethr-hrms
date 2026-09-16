import { useMutation, useQuery } from '@apollo/client';
import { useState, type FormEvent } from 'react';

import {
  BILLING_PAGE_DATA_QUERY,
  UPDATE_BILLING_CONFIG_MUTATION,
} from '../graphql/billing.operations';

type BillingConfigRecord = {
  readonly id: string;
  readonly feeAmount: number;
  readonly feeCurrency: string;
  readonly paymentTermsNetDays: number;
  readonly anchorDay: number;
  readonly receiverName: string | null;
  readonly receiverAddress: string | null;
  readonly receiverZipCode: string | null;
  readonly receiverCity: string | null;
  readonly receiverCountry: string | null;
  readonly receiverPhone: string | null;
  readonly senderAddress: string | null;
  readonly senderZipCode: string | null;
  readonly senderCity: string | null;
  readonly senderCountry: string | null;
  readonly senderPhone: string | null;
  readonly invoiceLogoDataUrl: string | null;
  readonly signatureDataUrl: string | null;
};

type BillingSettingsData = { readonly billingConfig: BillingConfigRecord };

/**
 * The full billing setup — commercial terms, letterhead and both addresses.
 * It lives on `/settings/billing`, not in a modal: it is a page's worth of
 * configuration wearing a form.
 */
export const BillingSettingsForm = () => {
  const { data, loading } = useQuery<BillingSettingsData>(BILLING_PAGE_DATA_QUERY);
  const [updateConfig, { loading: saving }] = useMutation(UPDATE_BILLING_CONFIG_MUTATION, {
    refetchQueries: [{ query: BILLING_PAGE_DATA_QUERY }],
  });

  const [feeAmount, setFeeAmount] = useState('');
  const [netDays, setNetDays] = useState('');
  const [anchorDay, setAnchorDay] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [addressForm, setAddressForm] = useState({
    senderAddress: '', senderZipCode: '', senderCity: '', senderCountry: '', senderPhone: '',
    receiverAddress: '', receiverZipCode: '', receiverCity: '', receiverCountry: '', receiverPhone: '',
  });
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [logoFileName, setLogoFileName] = useState('');
  const [signatureFileName, setSignatureFileName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const config = data?.billingConfig;

  const readFileAsDataUrl = (file: File, setter: (dataUrl: string) => void): void => {
    if (file.size > 300_000) {
      setFormError('Image must be under 300 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    try {
      await updateConfig({
        variables: {
          input: {
            ...(feeAmount !== '' ? { feeAmount: Number(feeAmount) } : {}),
            ...(netDays !== '' ? { paymentTermsNetDays: Number(netDays) } : {}),
            ...(anchorDay !== '' ? { anchorDay: Number(anchorDay) } : {}),
            ...(receiverName !== '' ? { receiverName } : {}),
            ...Object.fromEntries(
              Object.entries(addressForm).filter(([, value]) => value !== ''),
            ),
            ...(logoDataUrl ? { invoiceLogoDataUrl: logoDataUrl } : {}),
            ...(signatureDataUrl ? { signatureDataUrl } : {}),
          },
        },
      });
      setNotice('Billing settings saved.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save billing settings.');
    }
  };

  if (loading) {
    return <p className="field-hint">Loading billing settings…</p>;
  }

  return (
    <section className="table-shell">
      <div className="table-title-row">
        <div className="table-title">Commercial terms, letterhead & addresses</div>
      </div>
      <div className="settings-section-body">
        {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
        {notice ? (
          <p className="form-success" role="status">
            {notice}
          </p>
        ) : null}
        <form className="config-form" onSubmit={(event) => void onSave(event)}>
          <h3 className="section-title">Commercial terms</h3>
          <p className="field-hint">Current: ${config?.feeAmount ?? '—'} PEPM · Net {config?.paymentTermsNetDays ?? '—'} · anchor day {config?.anchorDay ?? '—'}</p>
          <div className="field"><label htmlFor="fee-amount">PEPM fee (USD)</label>
            <input id="fee-amount" min={0} placeholder={String(config?.feeAmount ?? '')} step="0.01" type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="net-days">Payment terms (net days)</label>
            <input id="net-days" min={0} placeholder={String(config?.paymentTermsNetDays ?? '')} type="number" value={netDays} onChange={(e) => setNetDays(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="anchor-day">Anchor day</label>
            <input id="anchor-day" max={28} min={1} placeholder={String(config?.anchorDay ?? '')} type="number" value={anchorDay} onChange={(e) => setAnchorDay(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="receiver-name">Client receiver name</label>
            <input id="receiver-name" placeholder={config?.receiverName ?? 'SynAck Solutions LLC'} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
          </div>

          <h3 className="section-title">Letterhead</h3>
          <div className="field">
            <label htmlFor="invoice-logo">Invoice logo (PNG/JPG, ≤300 KB)</label>
            <div className="file-input">
              <label className="file-input-trigger" htmlFor="invoice-logo">
                Choose file
              </label>
              <span className="file-input-name">{logoFileName || 'No file chosen'}</span>
              <input
                accept="image/*"
                className="file-input-native"
                id="invoice-logo"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setLogoFileName(file.name);
                    readFileAsDataUrl(file, setLogoDataUrl);
                  }
                }}
              />
            </div>
          </div>
          {config?.invoiceLogoDataUrl || logoDataUrl ? (
            <img
              alt="Invoice logo preview"
              src={logoDataUrl || config?.invoiceLogoDataUrl || undefined}
              style={{ maxHeight: 60, marginBottom: 8, objectFit: 'contain' }}
            />
          ) : null}
          <div className="field">
            <label htmlFor="signature-image">Signature image (≤300 KB)</label>
            <div className="file-input">
              <label className="file-input-trigger" htmlFor="signature-image">
                Choose file
              </label>
              <span className="file-input-name">{signatureFileName || 'No file chosen'}</span>
              <input
                accept="image/*"
                className="file-input-native"
                id="signature-image"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setSignatureFileName(file.name);
                    readFileAsDataUrl(file, setSignatureDataUrl);
                  }
                }}
              />
            </div>
          </div>
          {config?.signatureDataUrl || signatureDataUrl ? (
            <img
              alt="Signature preview"
              src={signatureDataUrl || config?.signatureDataUrl || undefined}
              style={{ maxHeight: 40, marginBottom: 8, objectFit: 'contain' }}
            />
          ) : null}

          <h3 className="section-title">Sender (Tethr) address</h3>
          <div className="field"><label htmlFor="sender-address">Street address</label>
            <input id="sender-address" placeholder={config?.senderAddress ?? '152, Street 23, G-10/2'} value={addressForm.senderAddress} onChange={(e) => setAddressForm((f) => ({ ...f, senderAddress: e.target.value }))} />
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="sender-zip">Zip</label>
              <input id="sender-zip" placeholder={config?.senderZipCode ?? '42201'} value={addressForm.senderZipCode} onChange={(e) => setAddressForm((f) => ({ ...f, senderZipCode: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="sender-city">City</label>
              <input id="sender-city" placeholder={config?.senderCity ?? 'Islamabad'} value={addressForm.senderCity} onChange={(e) => setAddressForm((f) => ({ ...f, senderCity: e.target.value }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="sender-country">Country</label>
              <input id="sender-country" placeholder={config?.senderCountry ?? 'Pakistan'} value={addressForm.senderCountry} onChange={(e) => setAddressForm((f) => ({ ...f, senderCountry: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="sender-phone">Phone</label>
              <input id="sender-phone" placeholder={config?.senderPhone ?? '+92 332 8883847'} value={addressForm.senderPhone} onChange={(e) => setAddressForm((f) => ({ ...f, senderPhone: e.target.value }))} />
            </div>
          </div>

          <h3 className="section-title">Receiver (client) address</h3>
          <div className="field"><label htmlFor="receiver-address">Street address</label>
            <input id="receiver-address" placeholder={config?.receiverAddress ?? '7709 Inwood Ave'} value={addressForm.receiverAddress} onChange={(e) => setAddressForm((f) => ({ ...f, receiverAddress: e.target.value }))} />
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="receiver-zip">Zip</label>
              <input id="receiver-zip" placeholder={config?.receiverZipCode ?? '21228'} value={addressForm.receiverZipCode} onChange={(e) => setAddressForm((f) => ({ ...f, receiverZipCode: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="receiver-city">City</label>
              <input id="receiver-city" placeholder={config?.receiverCity ?? 'Baltimore'} value={addressForm.receiverCity} onChange={(e) => setAddressForm((f) => ({ ...f, receiverCity: e.target.value }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="receiver-country">Country</label>
              <input id="receiver-country" placeholder={config?.receiverCountry ?? 'United States'} value={addressForm.receiverCountry} onChange={(e) => setAddressForm((f) => ({ ...f, receiverCountry: e.target.value }))} />
            </div>
            <div className="field"><label htmlFor="receiver-phone">Phone</label>
              <input id="receiver-phone" placeholder={config?.receiverPhone ?? '+1 443 805 9476'} value={addressForm.receiverPhone} onChange={(e) => setAddressForm((f) => ({ ...f, receiverPhone: e.target.value }))} />
            </div>
          </div>

          <button className="button button-secondary button-full" disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </div>
    </section>
  );
};
