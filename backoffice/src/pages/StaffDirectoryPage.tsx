import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { can, formatDate, negotiateLocale } from '@riaya/shared';
import { useAuth } from '../auth/AuthContext';
import { useWorkspace } from '../auth/WorkspaceContext';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  displayStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
  expiresAt: string;
  createdAt: string;
}

interface Member {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string | null;
}

/** The roles a member may be moved to; an existing SUPER_ADMIN keeps its own. */
const ASSIGNABLE_ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const;

/**
 * Staff directory for the active clinic (FR-027, FR-048).
 *
 * Lists the clinic's members with their role and last login, and every
 * invitation with exactly one lifecycle status (PENDING, ACCEPTED, REJECTED,
 * CANCELLED or the derived EXPIRED). An admin can invite, resend or cancel an
 * invitation, and change a member's role in place (FR-045). Suspension stays on
 * the membership endpoint (FR-018); the server still enforces every rule, so the
 * controls here only decide what is worth showing.
 */
export function StaffDirectoryPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { active } = useWorkspace();
  const canManage = can(active?.role, 'manageStaff');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('RECEPTIONIST');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [invitationList, memberList] = await Promise.all([
        api.get<Invitation[]>('/api/invitations'),
        api.get<Member[]>('/api/memberships'),
      ]);
      setInvitations(invitationList.data);
      setMembers(memberList.data);
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
    setSending(true);
    try {
      // Invite into the clinic the admin is currently working in, not their first
      // membership: the link the server emails carries this exact clinic.
      const clinicId = active?.clinicId;
      if (!clinicId) {
        setError(t('staff.noClinic'));
        return;
      }
      const { data } = await api.post<{ deliveryStatus: 'SENT' | 'FAILED' }>('/api/invitations', {
        email,
        clinicId,
        role,
      });
      setEmail('');
      // The row is created even when the provider fails (NFR-016), so report
      // the delivery outcome instead of a blind "sent".
      if (data.deliveryStatus === 'FAILED') {
        setError(t('staff.inviteDeliveryFailed'));
      } else {
        setMessage(t('staff.invited'));
      }
      await load();
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      setError(
        code === 'INVITATION_ALREADY_PENDING'
          ? t('staff.inviteAlreadyPending')
          : code === 'ALREADY_A_MEMBER'
            ? t('staff.alreadyMember')
            : t('staff.inviteError'),
      );
    } finally {
      setSending(false);
    }
  }

  /** Cancel a pending invitation; its token can never be used again (FR-043). */
  async function cancel(id: string) {
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/api/invitations/${id}/cancel`);
      setMessage(t('staff.cancelled'));
      await load();
    } catch {
      setError(t('staff.actionError'));
    }
  }

  /**
   * Change a member's role in this clinic (FR-045, AC-058).
   *
   * The server refuses a change that would leave the organization with no super
   * admin, so that refusal is reported as its own message rather than a generic
   * failure (AC-059).
   */
  async function changeRole(membershipId: string, nextRole: string) {
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/api/memberships/${membershipId}/role`, { role: nextRole });
      setMessage(t('staff.roleChanged'));
      await load();
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      setError(
        code === 'LAST_SUPER_ADMIN'
          ? t('staff.lastSuperAdmin')
          : code === 'SELF_ROLE_CHANGE'
            ? t('staff.selfRoleError')
            : t('staff.roleError'),
      );
    }
  }

  /** Re-issue the token and re-send the email for a pending invitation (EC-019). */
  async function resend(id: string) {
    setError(null);
    setMessage(null);
    try {
      const { data } = await api.post<{ deliveryStatus: 'SENT' | 'FAILED' }>(
        `/api/invitations/${id}/resend`,
      );
      if (data.deliveryStatus === 'FAILED') {
        setError(t('staff.resendDeliveryFailed'));
      } else {
        setMessage(t('staff.resent'));
      }
      await load();
    } catch {
      setError(t('staff.actionError'));
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-navy">{t('staff.title')}</h1>
        <p className="mt-2 text-muted">{t('staff.subtitle')}</p>
      </header>

      <form
        onSubmit={invite}
        className="relative flex flex-wrap items-end gap-3 overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-(--shadow-soft)"
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
              className="min-h-11 rounded-md border border-border-strong/70 bg-surface px-3 text-text shadow-(--shadow-soft)"
            >
              <option value="CLINIC_ADMIN">{t('roles.CLINIC_ADMIN')}</option>
              <option value="DOCTOR">{t('roles.DOCTOR')}</option>
              <option value="RECEPTIONIST">{t('roles.RECEPTIONIST')}</option>
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={sending || !email.includes('@')}>
          {sending ? t('staff.sending') : t('staff.invite')}
        </Button>
      </form>

      {sending ? (
        <p role="status" className="text-sm text-muted">
          {t('staff.sendingMessage')}
        </p>
      ) : null}
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-(--shadow-soft)">
        <h2 className="border-b border-border px-5 py-4 text-base font-semibold text-navy">
          {t('staff.members')}
        </h2>
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-md" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('staff.noMembers')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted/70 text-start text-xs font-semibold tracking-wide text-muted uppercase">
                <th className="px-5 py-3 text-start">{t('staff.member')}</th>
                <th className="px-5 py-3 text-start">{t('staff.role')}</th>
                <th className="px-5 py-3 text-start">{t('staff.lastLogin')}</th>
                <th className="px-5 py-3 text-start">{t('staff.status')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.userId === user?.id;
                return (
                  <tr
                    key={member.membershipId}
                    className="border-t border-border transition hover:bg-surface-muted/60"
                  >
                    <td className="px-5 py-3 text-text">
                      <div>
                        {member.firstName} {member.lastName}
                      </div>
                      <div className="text-xs text-muted">{member.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      {canManage && !isSelf ? (
                        <select
                          aria-label={t('staff.role')}
                          value={member.role}
                          onChange={(e) => void changeRole(member.membershipId, e.target.value)}
                          className="min-h-11 rounded-md border border-border-strong/70 bg-surface px-3 text-text shadow-(--shadow-soft)"
                        >
                          {[
                            ...(member.role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : []),
                            ...ASSIGNABLE_ROLES,
                          ].map((option) => (
                            <option key={option} value={option}>
                              {t(`roles.${option}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted">
                          {t(`roles.${member.role}`)}
                          {isSelf ? (
                            <span className="block text-xs text-muted">{t('staff.ownRole')}</span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {member.lastLoginAt
                        ? formatDate(
                            new Date(member.lastLoginAt),
                            negotiateLocale(i18n.resolvedLanguage),
                            active?.clinicTimezone,
                          )
                        : t('staff.never')}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {t(`staff.memberStatus.${member.status}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-(--shadow-soft)">
        <h2 className="border-b border-border px-5 py-4 text-base font-semibold text-navy">
          {t('staff.pending')}
        </h2>
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-md" />
            ))}
          </div>
        ) : invitations.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('staff.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted/70 text-start text-xs font-semibold tracking-wide text-muted uppercase">
                <th className="px-5 py-3 text-start">{t('staff.email')}</th>
                <th className="px-5 py-3 text-start">{t('staff.role')}</th>
                <th className="px-5 py-3 text-start">{t('staff.status')}</th>
                <th className="px-5 py-3 text-start">{t('staff.expires')}</th>
                <th className="px-5 py-3 text-start">{t('staff.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => {
                const isPending = inv.displayStatus === 'PENDING';
                return (
                  <tr
                    key={inv.id}
                    className="border-t border-border transition hover:bg-surface-muted/60"
                  >
                    <td className="px-5 py-3 text-text">{inv.email}</td>
                    <td className="px-5 py-3 text-muted">{t(`roles.${inv.role}`)}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {t(`staff.statusLabel.${inv.displayStatus}`)}
                      </span>
                      {inv.displayStatus === 'PENDING' && inv.deliveryStatus === 'FAILED' && (
                        <span className="ms-2 text-xs text-error">{t('staff.deliveryFailed')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(
                        new Date(inv.expiresAt),
                        negotiateLocale(i18n.resolvedLanguage),
                        active?.clinicTimezone,
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isPending && (
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" onClick={() => resend(inv.id)}>
                            {t('staff.resend')}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => cancel(inv.id)}>
                            {t('staff.cancel')}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
