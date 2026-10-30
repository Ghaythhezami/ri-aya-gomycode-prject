import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, ChevronDown } from 'lucide-react';
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
        className="flex h-11 max-w-56 items-center gap-2.5 rounded-[12px] border border-border bg-white ps-1.5 pe-3 text-sm text-text transition hover:border-primary/30"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-accent text-primary">
          <Building2 size={16} />
        </span>
        <span className="hidden min-w-0 flex-col items-start leading-tight lg:flex">
          <span className="max-w-36 truncate font-semibold text-navy">{active.clinicName}</span>
          <span className="max-w-36 truncate text-[11px] text-muted">{active.role}</span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute end-0 z-30 mt-2 w-72 rounded-[18px] border border-border bg-white p-2 shadow-[0_20px_40px_-16px_rgba(21,40,63,0.3)]"
        >
          {memberships.map((m) => {
            const selected = m.clinicId === activeClinicId;
            return (
              <li key={m.membershipId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={busy}
                  onClick={() => void switchTo(m.clinicId)}
                  className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-sm transition ${
                    selected ? 'bg-accent' : 'hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${
                      selected
                        ? 'bg-linear-to-br from-teal to-blue text-white'
                        : 'bg-slate-100 text-muted'
                    }`}
                  >
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-navy">{m.clinicName}</span>
                    <span className="block truncate text-xs text-muted">
                      {m.organizationName} — {m.role}
                    </span>
                  </span>
                  {selected ? <Check size={16} className="shrink-0 text-primary" /> : null}
                </button>
              </li>
            );
          })}
          <li className="mt-1 border-t border-border pt-1">
            <a
              href="/register"
              className="flex min-h-10 items-center gap-2 rounded-[12px] px-3 text-sm font-semibold text-primary transition hover:bg-accent"
            >
              {t('workspace.createOrganization')}
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
