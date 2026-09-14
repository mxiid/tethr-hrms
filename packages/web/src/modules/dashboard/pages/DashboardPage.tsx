import { DashboardGettingStarted } from '../components/DashboardGettingStarted';
import { DashboardWidgetBoard } from '../components/DashboardWidgetBoard';

export const DashboardPage = () => (
  <main className="employees-content" style={{ display: 'block' }}>
    <header className="page-header">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your workspace at a glance.</p>
      </div>
    </header>

    <DashboardGettingStarted />
    <DashboardWidgetBoard />
  </main>
);
