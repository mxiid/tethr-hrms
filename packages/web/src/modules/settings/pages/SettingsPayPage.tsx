import { BenefitPlansPanel } from '../../benefits/components/BenefitPlansPanel';
import { PaySetupPanel } from '../../finance/compensation/components/PaySetupPanel';

export const SettingsPayPage = () => (
  <main className="page-frame page-frame-single">
    <div className="employees-content">
      <header className="page-header">
        <div>
          <h2 className="page-title">Pay</h2>
          <p className="page-subtitle">
            The earnings and deductions this workspace pays, and the structures that split them.
          </p>
        </div>
      </header>
      <PaySetupPanel />
      <BenefitPlansPanel />
    </div>
  </main>
);
