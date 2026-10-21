import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleRoute } from './auth/RoleRoute';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { DesignSystemPage } from './pages/DesignSystemPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
    </QueryClientProvider>
  );
}
