import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Mail, Send, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api';
import { AuthAlert, AuthInput } from '../common/AuthInput';
import { Field } from '../common/Input';

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Staff directory for the active clinic (FR-027).
 *
 * Shows pending invitations with their role and expiry, and lets an admin
 * invite a new person. Suspension lives on the membership endpoint (FR-018).
 */
export function StaffDirectoryPage() {
  const { t } = useTranslation();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('RECEPTIONIST');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<PendingInvitation[]>('/api/invitations');
      setInvitations(data);
    } catch {
      setError(t('staff.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const memberships = await api.get<Array<{ clinicId: string }>>('/api/auth/memberships');
      const clinicId = memberships.data[0]?.clinicId;
      if (!clinicId) {
        setError(t('staff.noClinic'));
        return;
      }
      await api.post('/api/invitations', { email, clinicId, role });
      setEmail('');
      setMessage(t('staff.invited'));
      await load();
    } catch {
      setError(t('staff.inviteError'));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-linear-to-br from-teal to-blue text-white shadow-[0_12px_24px_-10px_rgba(21,101,192,0.6)]">
          <Users size={24} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">{t('staff.title')}</h1>
          <p className="mt-0.5 text-muted">{t('staff.subtitle')}</p>
        </div>
      </header>

      <form onSubmit={invite} className="panel p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2 text-sm font-bold text-navy">
          <UserPlus size={18} className="text-primary" />
          {t('staff.invite')}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <Field label={t('staff.email')}>
              <AuthInput
                icon={<Mail size={18} />}
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="w-full sm:w-56">
            <Field label={t('staff.role')}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-13 w-full rounded-[14px] border border-border bg-slate-50/70 px-4 text-text transition hover:border-slate-300 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 focus:outline-none"
              >
                <option value="CLINIC_ADMIN">{t('roles.CLINIC_ADMIN')}</option>
                <option value="DOCTOR">{t('roles.DOCTOR')}</option>
                <option value="RECEPTIONIST">{t('roles.RECEPTIONIST')}</option>
              </select>
            </Field>
          </div>
          <button
            type="submit"
            disabled={!email.includes('@')}
            className="btn-brand inline-flex h-13 items-center gap-2 rounded-[14px] px-6 font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
          >
            <Send size={17} className="rtl:-scale-x-100" />
            {t('staff.invite')}
          </button>
        </div>
      </form>

      {message && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[14px] border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-success"
        >
          <CheckCircle2 size={17} />
          {message}
        </p>
      )}
      {error && <AuthAlert>{error}</AuthAlert>}

      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-border/80 px-5 py-4 sm:px-6">
          <h2 className="text-base font-bold text-navy">{t('staff.pending')}</h2>
          {!loading && invitations.length > 0 ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-primary">
              {invitations.length}
            </span>
          ) : null}
        </header>
        {loading ? (
          <div className="space-y-3 p-5 sm:p-6" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-[12px] bg-slate-100" />
            ))}
          </div>
        ) : invitations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-primary">
              <Mail size={22} />
            </span>
            <p className="mt-4 text-sm font-medium text-muted">{t('staff.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-start text-xs font-semibold tracking-wide text-muted uppercase">
                  <th className="px-6 py-3 text-start">{t('staff.email')}</th>
                  <th className="px-6 py-3 text-start">{t('staff.role')}</th>
                  <th className="px-6 py-3 text-start">{t('staff.expires')}</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-border/80 transition hover:bg-slate-50/60"
                  >
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-accent to-[#e3f0fd] text-xs font-bold text-navy uppercase">
                          {inv.email[0]}
                        </span>
                        <span className="font-medium text-text">{inv.email}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
                        {t(`roles.${inv.role}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} />
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
