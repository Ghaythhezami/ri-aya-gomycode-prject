import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { type Capability } from '@riaya/shared';
import { useAuth } from './AuthContext';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { canUser } from './permissions';

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
  /** One capability, or several where any one is enough. */
  capability: Capability | readonly Capability[];
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  const required = Array.isArray(capability) ? capability : [capability as Capability];
  if (!required.some((item) => canUser(user, item))) return <ForbiddenPage />;

  return children;
}
