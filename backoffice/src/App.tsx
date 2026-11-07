import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleRoute } from './auth/RoleRoute';
import { AppShell } from './layouts/AppShell';
import { WorkspaceProvider } from './auth/WorkspaceContext';
import { RealtimeProvider } from './lib/realtime';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { RegisterPage } from './pages/RegisterPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OnboardingGate } from './features/onboarding/OnboardingGate';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { ProfilePage } from './features/profile/ProfilePage';
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
// Patient portal (ADR 0005): its own session, shell and API client, outside the staff routes.
const PortalRoutes = {
  Root: lazy(() => import('./portal/PortalRoot').then((m) => ({ default: m.PortalRoot }))),
  Guard: lazy(() => import('./portal/PortalRoot').then((m) => ({ default: m.PortalGuard }))),
  PublicOnly: lazy(() =>
    import('./portal/PortalRoot').then((m) => ({ default: m.PortalPublicOnly })),
  ),
  Shell: lazy(() => import('./portal/PortalShell').then((m) => ({ default: m.PortalShell }))),
  Login: lazy(() =>
    import('./portal/pages/LoginPage').then((m) => ({ default: m.PortalLoginPage })),
  ),
  Register: lazy(() =>
    import('./portal/pages/RegisterPage').then((m) => ({ default: m.PortalRegisterPage })),
  ),
  Invite: lazy(() =>
    import('./portal/pages/InvitePage').then((m) => ({ default: m.PortalInvitePage })),
  ),
  Welcome: lazy(() =>
    import('./portal/pages/WelcomePage').then((m) => ({ default: m.PortalWelcomePage })),
  ),
  Home: lazy(() => import('./portal/pages/HomePage').then((m) => ({ default: m.PortalHomePage }))),
  Book: lazy(() => import('./portal/pages/BookPage').then((m) => ({ default: m.PortalBookPage }))),
  Appointments: lazy(() =>
    import('./portal/pages/AppointmentsPage').then((m) => ({ default: m.PortalAppointmentsPage })),
  ),
  Health: lazy(() =>
    import('./portal/pages/HealthPage').then((m) => ({ default: m.PortalHealthPage })),
  ),
  Profile: lazy(() =>
    import('./portal/pages/ProfilePage').then((m) => ({ default: m.PortalProfilePage })),
  ),
  Assistant: lazy(() =>
    import('./portal/PortalAssistantRoute').then((m) => ({ default: m.PortalAssistantRoute })),
  ),
};
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
              <Route path="/portal" element={<PortalRoutes.Root />}>
                <Route element={<PortalRoutes.PublicOnly />}>
                  <Route path="login" element={<PortalRoutes.Login />} />
                  <Route path="register" element={<PortalRoutes.Register />} />
                  <Route path="invite" element={<PortalRoutes.Invite />} />
                </Route>
                <Route element={<PortalRoutes.Guard />}>
                  <Route path="welcome" element={<PortalRoutes.Welcome />} />
                  <Route element={<PortalRoutes.Shell />}>
                    <Route index element={<PortalRoutes.Home />} />
                    <Route path="book" element={<PortalRoutes.Book />} />
                    <Route path="appointments" element={<PortalRoutes.Appointments />} />
                    <Route path="assistant" element={<PortalRoutes.Assistant />} />
                    <Route path="health" element={<PortalRoutes.Health />} />
                    <Route path="profile" element={<PortalRoutes.Profile />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/portal" replace />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute>
                    <WorkspaceProvider>
                      <RealtimeProvider>
                        <OnboardingGate>
                          <AppShell />
                        </OnboardingGate>
                      </RealtimeProvider>
                    </WorkspaceProvider>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/profile" element={<ProfilePage />} />
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
                    <RoleRoute capability={['manageSettings', 'manageRoles']}>
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
