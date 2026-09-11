import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceUsersPage } from '../modules/access/pages/WorkspaceUsersPage';
import { TimeAttendancePage } from '../modules/attendance/pages/TimeAttendancePage';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { AccessPendingPage } from '../modules/auth/pages/AccessPendingPage';
import { LoginPage } from '../modules/auth/pages/LoginPage';
import { SignUpPage } from '../modules/auth/pages/SignUpPage';
import { ClientWorkspacePage } from '../modules/client/pages/ClientWorkspacePage';
import { ClientPortfolioPage } from '../modules/clients/pages/ClientPortfolioPage';
import { CompensationPage } from '../modules/finance/compensation/pages/CompensationPage';
import { DashboardPage } from '../modules/dashboard/pages/DashboardPage';
import { EmployeeProfilePage } from '../modules/employees/pages/EmployeeProfilePage';
import { EmployeesListPage } from '../modules/employees/pages/EmployeesListPage';
import { AnnouncementsPage } from '../modules/engagement/pages/AnnouncementsPage';
import { FeedbackInboxPage } from '../modules/engagement/pages/FeedbackInboxPage';
import { BillingPage } from '../modules/finance/billing/pages/BillingPage';
import { InvoiceDetailPage } from '../modules/finance/billing/pages/InvoiceDetailPage';
import { PayrollPage } from '../modules/finance/payroll/pages/PayrollPage';
import { PayrollRunDetailPage } from '../modules/finance/payroll/pages/PayrollRunDetailPage';
import { LeaveTriagePage } from '../modules/leave/pages/LeaveTriagePage';
import { HiringRequestsPage } from '../modules/recruitment/pages/HiringRequestsPage';
import { EmployeeWorkspacePage } from '../modules/self-service/pages/EmployeeWorkspacePage';
import { MyProfilePage } from '../modules/self-service/pages/MyProfilePage';

import { AppShell } from './AppShell';
import { portalHome } from './portal';
import { RequireAuth } from './RequireAuth';
import { RequirePortal } from './RequirePortal';

const PortalHomeRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={portalHome(user?.portal ?? 'none')} replace />;
};

// Thin routing: public auth routes, then the authenticated app behind RequireAuth
// and the AppShell layout (architecture.md §5.6).
export const AppRouter = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/access" element={<AccessPendingPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route element={<RequirePortal portals={['tethr']} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<RequirePortal portals={['tethr']} />}>
            <Route path="/feedback" element={<FeedbackInboxPage />} />
          </Route>
          <Route
            element={
              <RequirePortal portals={['tethr']} roleKeys={['tethrAdmin', 'tethrFinance']} />
            }
          >
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/payroll/:runId" element={<PayrollRunDetailPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/billing/:invoiceId" element={<InvoiceDetailPage />} />
          </Route>
          <Route element={<RequirePortal portals={['tethr']} roleKeys={['tethrAdmin']} />}>
            <Route path="/clients" element={<ClientPortfolioPage />} />
          </Route>
          <Route element={<RequirePortal portals={['tethr', 'client', 'employee']} />}>
            <Route path="/announcements" element={<AnnouncementsPage />} />
          </Route>
          <Route element={<RequirePortal portals={['tethr', 'client']} />}>
            <Route path="/employees" element={<EmployeesListPage />} />
            {/* Same page, org-chart view: the preview rail and its selection are
                shared, so the view is a route rather than a separate component. */}
            <Route path="/employees/org-chart" element={<EmployeesListPage />} />
            <Route path="/employees/:employeeId" element={<EmployeeProfilePage />} />
            <Route path="/attendance" element={<TimeAttendancePage />} />
            <Route path="/hiring" element={<HiringRequestsPage />} />
            <Route path="/leave" element={<LeaveTriagePage />} />
          </Route>
          <Route
            element={
              <RequirePortal
                portals={['tethr', 'client']}
                roleKeys={['tethrAdmin', 'tethrHr', 'tethrFinance', 'clientAdmin']}
              />
            }
          >
            <Route path="/compensation" element={<CompensationPage />} />
          </Route>
          <Route
            element={
              <RequirePortal
                portals={['tethr', 'client']}
                roleKeys={['tethrAdmin', 'clientAdmin']}
              />
            }
          >
            <Route path="/users" element={<WorkspaceUsersPage />} />
          </Route>
          <Route element={<RequirePortal portals={['client']} />}>
            <Route path="/client" element={<ClientWorkspacePage />} />
          </Route>
          <Route element={<RequirePortal portals={['employee']} />}>
            <Route path="/me" element={<EmployeeWorkspacePage />} />
            <Route path="/me/profile" element={<MyProfilePage />} />
            {/* Each employee tool is its own page; the shared component reads the
                segment so back/forward and shared links behave. */}
            <Route path="/me/attendance" element={<EmployeeWorkspacePage />} />
            <Route path="/me/leave" element={<EmployeeWorkspacePage />} />
            <Route path="/me/payslips" element={<EmployeeWorkspacePage />} />
            <Route path="/me/holidays" element={<EmployeeWorkspacePage />} />
            <Route path="/me/feedback" element={<EmployeeWorkspacePage />} />
          </Route>
          <Route path="/" element={<PortalHomeRedirect />} />
        </Route>
      </Route>
      <Route path="*" element={<PortalHomeRedirect />} />
    </Routes>
  </BrowserRouter>
);
