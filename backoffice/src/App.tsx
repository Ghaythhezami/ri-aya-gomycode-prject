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
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { PublicUiPage } from './pages/PublicUiPage';
import { RegisterPage } from './pages/RegisterPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { StaffDirectoryPage } from './pages/StaffDirectoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ClinicInformationSection } from './pages/settings/ClinicInformationSection';
import { WorkingHoursSection } from './pages/settings/WorkingHoursSection';
import { RolesPermissionsSection } from './pages/settings/RolesPermissionsSection';
import { PlaceholderSection } from './pages/settings/PlaceholderSection';

export default function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            {/* FR-037: the pending-approval screen is retired; registration is the only path. */}
            <Route path="/signup" element={<Navigate to="/register" replace />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/ui" element={<PublicUiPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <WorkspaceProvider>
                    <AppShell />
                  </WorkspaceProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<OverviewPage />} />
              <Route
                path="/appointments"
                element={<PlaceholderPage titleKey="nav.appointments" />}
              />
              <Route path="/calendar" element={<PlaceholderPage titleKey="nav.calendar" />} />
              <Route path="/patients" element={<PlaceholderPage titleKey="nav.patients" />} />
              <Route
                path="/staff"
                element={
                  <RoleRoute capability="manageStaff">
                    <StaffDirectoryPage />
                  </RoleRoute>
                }
              />
              <Route path="/waiting-list" element={<PlaceholderPage titleKey="nav.waiting" />} />
              <Route
                path="/analytics"
                element={
                  <RoleRoute capability="viewAnalytics">
                    <PlaceholderPage titleKey="nav.analytics" />
                  </RoleRoute>
                }
              />
              <Route
                path="/notifications"
                element={<PlaceholderPage titleKey="nav.notifications" />}
              />
              <Route
                path="/settings"
                element={
                  <RoleRoute capability="manageSettings">
                    <SettingsPage />
                  </RoleRoute>
                }
              >
                <Route index element={<Navigate to="clinic-information" replace />} />
                <Route path="clinic-information" element={<ClinicInformationSection />} />
                <Route
                  path="departments"
                  element={<PlaceholderSection titleKey="settings.departments" />}
                />
                <Route path="working-hours" element={<WorkingHoursSection />} />
                <Route
                  path="appointments"
                  element={
                    <PlaceholderSection titleKey="settings.appointments" to="/appointments" />
                  }
                />
                <Route
                  path="reminders"
                  element={<PlaceholderSection titleKey="settings.reminders" to="/notifications" />}
                />
                <Route path="roles-permissions" element={<RolesPermissionsSection />} />
                <Route
                  path="audit-log"
                  element={<PlaceholderSection titleKey="settings.auditLog" />}
                />
                <Route
                  path="appearance"
                  element={<PlaceholderSection titleKey="settings.appearance" />}
                />
              </Route>
              <Route path="/design-system" element={<DesignSystemPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </Provider>
  );
}
