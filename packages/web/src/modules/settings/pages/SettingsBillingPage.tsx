import { BillingSettingsForm } from '../../finance/billing/components/BillingSettingsForm';

export const SettingsBillingPage = () => (
  <main className="page-frame page-frame-single">
    <div className="employees-content">
      <header className="page-header">
        <div>
          <h2 className="page-title">Billing</h2>
          <p className="page-subtitle">
            Commercial terms, invoice letterhead, and both addresses.
          </p>
        </div>
      </header>
      <BillingSettingsForm />
    </div>
  </main>
);
