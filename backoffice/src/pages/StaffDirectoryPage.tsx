import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

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
      <header>
        <h1 className="text-xl font-semibold text-text">{t('staff.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('staff.subtitle')}</p>
      </header>

      <form
        onSubmit={invite}
        className="flex flex-wrap items-end gap-3 rounded-[12px] border border-border bg-white p-4"
      >
        <div className="min-w-56 flex-1">
          <Field label={t('staff.email')}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
        </div>
        <div>
          <Field label={t('staff.role')}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="min-h-11 rounded-[12px] border border-border bg-white px-3 text-text"
            >
              <option value="CLINIC_ADMIN">{t('roles.CLINIC_ADMIN')}</option>
              <option value="DOCTOR">{t('roles.DOCTOR')}</option>
              <option value="RECEPTIONIST">{t('roles.RECEPTIONIST')}</option>
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={!email.includes('@')}>
          {t('staff.invite')}
        </Button>
      </form>

      {message && <p className="text-sm text-[#16A34A]">{message}</p>}
      {error && (
        <p role="alert" className="text-sm text-[#DC2626]">
          {error}
        </p>
      )}

      <section className="rounded-[12px] border border-border bg-white">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-text">
          {t('staff.pending')}
        </h2>
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-[#F7F9FC]" />
            ))}
          </div>
        ) : invitations.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('staff.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="px-4 py-2">{t('staff.email')}</th>
                <th className="px-4 py-2">{t('staff.role')}</th>
                <th className="px-4 py-2">{t('staff.expires')}</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-t border-border">
                  <td className="px-4 py-2 text-text">{inv.email}</td>
                  <td className="px-4 py-2 text-muted">{t(`roles.${inv.role}`)}</td>
                  <td className="px-4 py-2 text-muted">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
