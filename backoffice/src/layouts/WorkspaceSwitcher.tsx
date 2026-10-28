import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, setAccessToken } from '../lib/api';

interface Membership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  role: string;
}

/**
 * Workspace switcher (FR-032, AC-011).
 *
 * Lists every clinic the user belongs to with their role in each, and switches
 * the session by calling POST /auth/switch-workspace, which re-issues a token
 * scoped to the chosen clinic (AC-012, AC-013).
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Membership[]>('/api/auth/memberships')
      .then(({ data }) => {
        if (cancelled) return;
        setMemberships(data);
        setActiveClinicId((current) => current ?? data[0]?.clinicId ?? null);
      })
      .catch(() => {
        // A user with no memberships simply sees no switcher.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchTo(clinicId: string) {
    if (clinicId === activeClinicId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{ accessToken: string }>('/api/auth/switch-workspace', {
        clinicId,
      });
      setAccessToken(data.accessToken);
      setActiveClinicId(clinicId);
      setOpen(false);
      // Reload so every screen refetches under the new scope.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.clinicId === activeClinicId) ?? memberships[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-h-10 items-center gap-2 rounded-[12px] border border-border bg-white px-3 text-sm text-text"
      >
        <span className="font-medium">{active.clinicName}</span>
        <span className="text-xs text-muted">{active.role}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-64 rounded-[12px] border border-border bg-white py-1 shadow-lg"
        >
          {memberships.map((m) => (
            <li key={m.membershipId}>
              <button
                type="button"
                role="option"
                aria-selected={m.clinicId === activeClinicId}
                disabled={busy}
                onClick={() => void switchTo(m.clinicId)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-bg ${
                  m.clinicId === activeClinicId ? 'bg-accent' : ''
                }`}
              >
                <span className="font-medium text-text">{m.clinicName}</span>
                <span className="text-xs text-muted">
                  {m.organizationName} — {m.role}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-border">
            <a href="/register" className="block px-3 py-2 text-sm text-[#0F766E] hover:bg-bg">
              {t('workspace.createOrganization')}
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
