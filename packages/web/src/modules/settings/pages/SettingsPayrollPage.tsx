import { TaxSlabsPanel } from '../../finance/payroll/components/TaxSlabsPanel';

export const SettingsPayrollPage = () => (
  <main className="page-frame page-frame-single">
    <div className="employees-content">
      <header className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Workspace payroll configuration.</p>
        </div>
      </header>
      <TaxSlabsPanel />
    </div>
  </main>
);
