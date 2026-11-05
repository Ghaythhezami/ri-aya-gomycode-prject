import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { can, type Capability } from '@riaya/shared';
import { useAuth } from './AuthContext';
import { ForbiddenPage } from '../pages/ForbiddenPage';

/**
 * Capability guard for a route (AC-005).
 *
 * Unauthenticated users are still handled by `ProtectedRoute`; an authenticated
 * user whose role lacks the capability sees the localized 403 page instead of a
 * silent redirect that hides the reason.
 */
export function RoleRoute({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!can(user.role, capability)) return <ForbiddenPage />;

  return children;
}
