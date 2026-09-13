import { PaySetupPanel } from '../../finance/compensation/components/PaySetupPanel';

export const SettingsPayPage = () => (
  <main className="page-frame page-frame-single">
    <div className="employees-content">
      <header className="page-header">
        <div>
          <h1 className="page-title">Pay</h1>
          <p className="page-subtitle">
            The earnings and deductions this workspace pays, and the structures that split them.
          </p>
        </div>
      </header>
      <PaySetupPanel />
    </div>
  </main>
);
