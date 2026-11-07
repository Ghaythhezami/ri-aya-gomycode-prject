import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getAccessToken, setAccessToken } from '../lib/api';

export interface Membership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  /** Organization name per language, when entered (pick with `pickLocalized`). */
  organizationNameI18n?: Partial<Record<'en' | 'fr' | 'ar', string>>;
  clinicId: string;
  clinicName: string;
  /** Clinic name per language, when entered (pick with `pickLocalized`). */
  clinicNameI18n?: Partial<Record<'en' | 'fr' | 'ar', string>>;
  clinicTimezone: string;
  role: string;
}

interface WorkspaceValue {
  memberships: Membership[];
  active: Membership | null;
  loading: boolean;
  switching: boolean;
  switchTo: (clinicId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * The active clinic from the access token's `clinic_id` claim.
 *
 * The token is the authority the server uses, so reading the same claim keeps
 * the footer in step with the session after a switch and a reload. The value is
 * display-only; the server still enforces scope.
 */
function tokenClinicId(): string | null {
  const token = getAccessToken();
  if (!token) return null;

  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { clinic_id?: unknown };
    return typeof decoded.clinic_id === 'string' ? decoded.clinic_id : null;
  } catch {
    return null;
  }
}

/**
 * One owner for memberships and the active clinic (RISK-003).
 *
 * `WorkspaceSwitcher` and the sidebar footer both read this, so the active
 * clinic cannot disagree between the two places it is shown.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get<Membership[]>('/api/auth/memberships')
      .then(({ data }) => {
        if (cancelled) return;
        setMemberships(data);
        const fromToken = tokenClinicId();
        const initial =
          data.find((membership) => membership.clinicId === fromToken)?.clinicId ??
          data[0]?.clinicId ??
          null;
        setActiveClinicId(initial);
      })
      .catch(() => {
        // A user with no memberships simply has no active workspace.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const switchTo = useCallback(
    async (clinicId: string) => {
      if (clinicId === activeClinicId) return;

      setSwitching(true);
      try {
        const { data } = await api.post<{ accessToken: string }>('/api/auth/switch-workspace', {
          clinicId,
        });
        setAccessToken(data.accessToken);
        setActiveClinicId(clinicId);
        // Reload so every screen refetches under the new scope.
        window.location.reload();
      } finally {
        setSwitching(false);
      }
    },
    [activeClinicId],
  );

  const value = useMemo<WorkspaceValue>(() => {
    const active =
      memberships.find((membership) => membership.clinicId === activeClinicId) ??
      memberships[0] ??
      null;

    return { memberships, active, loading, switching, switchTo };
  }, [memberships, activeClinicId, loading, switching, switchTo]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}
