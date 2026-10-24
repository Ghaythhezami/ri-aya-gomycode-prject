import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleRoute } from './auth/RoleRoute';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { PublicUiPage } from './pages/PublicUiPage';

export default function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/ui" element={<PublicUiPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
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
                  <RoleRoute roles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                    <PlaceholderPage titleKey="nav.staff" />
                  </RoleRoute>
                }
              />
              <Route path="/waiting-list" element={<PlaceholderPage titleKey="nav.waiting" />} />
              <Route
                path="/analytics"
                element={
                  <RoleRoute roles={['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR']}>
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
                  <RoleRoute roles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                    <PlaceholderPage titleKey="nav.settings" />
                  </RoleRoute>
                }
              />
              <Route path="/design-system" element={<DesignSystemPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </Provider>
  );
}
