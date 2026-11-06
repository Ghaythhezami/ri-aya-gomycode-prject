import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleRoute } from './auth/RoleRoute';
import { AppShell } from './layouts/AppShell';
import { WorkspaceProvider } from './auth/WorkspaceContext';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { RegisterPage } from './pages/RegisterPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AppointmentsPage } from './features/appointments/AppointmentsPage';
import { AppointmentDetailPage } from './features/appointments/AppointmentDetailPage';
import { PatientsPage } from './features/patients/PatientsPage';
import { PatientProfilePage } from './features/patients/PatientProfilePage';
import { DoctorsPage } from './features/doctors/DoctorsPage';
import { DoctorDetailPage } from './features/doctors/DoctorDetailPage';
import { WaitingListPage } from './features/queue/WaitingListPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
const CalendarPage = lazy(() =>
  import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const PublicDisplayPage = lazy(() =>
  import('./features/display/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);
const SelfCheckInPage = lazy(() =>
  import('./features/display/SelfCheckInPage').then((m) => ({ default: m.SelfCheckInPage })),
);
const SmartSchedulingPage = lazy(() =>
  import('./features/scheduling/SmartSchedulingPage').then((m) => ({
    default: m.SmartSchedulingPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const PublicUiPage = lazy(() =>
  import('./pages/PublicUiPage').then((m) => ({ default: m.PublicUiPage })),
);
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const DesignSystemPage = lazy(() =>
  import('./pages/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })),
);

function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg" role="status" aria-busy="true">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" />
    </div>
  );
}

/**
 * Route table. Base path comes from Vite's `base` (`/app/` when the backoffice is
 * served next to the marketing site), so links stay root-relative inside the app.
 */
export default function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              {/* FR-037: the pending-approval screen is retired; registration is the only path. */}
              <Route path="/signup" element={<Navigate to="/register" replace />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/ui" element={<PublicUiPage />} />
              {/* QUE-2: public screens, no authentication and no personal data. */}
              <Route path="/display/:clinicId" element={<PublicDisplayPage />} />
              <Route path="/check-in/:clinicId" element={<SelfCheckInPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <WorkspaceProvider>
                      <AppShell />
                    </WorkspaceProvider>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/appointments" element={<AppointmentsPage />} />
                <Route path="/appointments/:id" element={<AppointmentDetailPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/patients" element={<PatientsPage />} />
                <Route path="/patients/:id" element={<PatientProfilePage />} />
                <Route path="/doctors" element={<DoctorsPage />} />
                <Route path="/doctors/:id" element={<DoctorDetailPage />} />
                <Route path="/staff" element={<Navigate to="/doctors" replace />} />
                <Route path="/waiting-list" element={<WaitingListPage />} />
                <Route
                  path="/scheduling"
                  element={
                    <RoleRoute capability="viewScheduling">
                      <SmartSchedulingPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <RoleRoute capability="viewAnalytics">
                      <AnalyticsPage />
                    </RoleRoute>
                  }
                />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route
                  path="/settings/*"
                  element={
                    <RoleRoute capability="manageSettings">
                      <SettingsPage />
                    </RoleRoute>
                  }
                />
                <Route path="/design-system" element={<DesignSystemPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </Provider>
  );
}
