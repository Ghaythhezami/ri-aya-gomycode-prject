import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, negotiateLocale } from '@riaya/shared';
import { useAuth } from '../auth/AuthContext';
import { canUser } from '../auth/permissions';
import { useWorkspace } from '../auth/WorkspaceContext';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input, Select } from '../common/Input';
import { Modal } from '../common/Modal';
import { Skeleton } from '../common/Skeleton';
import { EmptyState, ErrorState } from '../common/States';
import { useToast } from '../common/Toast';
import { DataTable, type Column } from '../common/Table';
import {
  useAssignRoleMutation,
  useRolesQuery,
  useStaffMembersQuery,
} from '../features/settings/api';
import { errorText } from '../features/settings/apiError';
import type { StaffMemberDto } from '../features/settings/api';

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  roleKey?: string | null;
  roleName?: string | null;
  expiresAt: string;
  createdAt: string;
}

type MemberRow = StaffMemberDto & { id: string };

/** System roles offered while the roles list is not available (never SUPER_ADMIN). */
const FALLBACK_ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];

/**
 * Staff directory for the active clinic (FR-027): members with a role select (system and
 * custom roles, optimistic with rollback), pending invitations, and an invitation dialog
 * whose role select includes custom roles.
 */
export function StaffDirectoryPage() {
  const { t, i18n } = useTranslation();
  const { active } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const canAssign = canUser(user, 'manageStaff');
  const canInvite = canUser(user, 'inviteStaff');
  const roles = useRolesQuery();
  const members = useStaffMembersQuery();
  const [assign] = useAssignRoleMutation();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('RECEPTIONIST');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const formId = useId();

  // SUPER_ADMIN is only assignable by a super admin.
  const roleOptions = (
    roles.data?.roles.map((r) => ({ key: r.key, name: r.displayName })) ??
    FALLBACK_ROLES.map((key) => ({ key, name: t(`roles.${key}`) }))
  ).filter((r) => r.key !== 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN');
  const roleName = (key: string | null | undefined, fallback: string) =>
    roles.data?.roles.find((r) => r.key === key)?.displayName ?? fallback;

  async function load() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const { data } = await api.get<PendingInvitation[]>('/api/invitations');
      setInvitations(data);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeRole(member: MemberRow, nextKey: string) {
    if (nextKey === member.roleKey) return;
    setPendingId(member.membershipId);
    try {
      await assign({
        membershipId: member.membershipId,
        roleKey: nextKey,
        roleName: roleName(nextKey, nextKey),
      }).unwrap();
      toast.success(t('settings.team.roleChanged', { name: member.name }));
    } catch (error) {
      toast.error(errorText(t, error));
    } finally {
      setPendingId(null);
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setInviteError(null);
    setSending(true);
    try {
      const memberships = await api.get<Array<{ clinicId: string }>>('/api/auth/memberships');
      const clinicId = memberships.data[0]?.clinicId;
      if (!clinicId) {
        setInviteError(t('staff.noClinic'));
        return;
      }
      await api.post('/api/invitations', { email, clinicId, roleKey });
      setEmail('');
      setDialogOpen(false);
      toast.success(t('staff.invited'));
      await load();
    } catch {
      setInviteError(t('staff.inviteError'));
    } finally {
      setSending(false);
    }
  }

  const memberRows: MemberRow[] = (members.data ?? []).map((m) => ({ ...m, id: m.membershipId }));
  const memberColumns: Column<MemberRow>[] = [
    {
      key: 'name',
      header: t('settings.team.member'),
      sortable: true,
      render: (m) => (
        <span>
          <span className="font-medium text-text">{m.name}</span>
          {m.userId === user?.id && (
            <span className="ms-2 text-xs text-muted">({t('settings.team.you')})</span>
          )}
          <span className="block text-xs text-muted">{m.email}</span>
        </span>
      ),
    },
    {
      key: 'roleName',
      header: t('staff.role'),
      sortable: true,
      render: (m) => {
        const own = m.userId === user?.id;
        if (!canAssign) return <span>{roleName(m.roleKey, m.roleName)}</span>;
        // The current role is always an option, even a role the list does not offer.
        const options = roleOptions.some((r) => r.key === m.roleKey)
          ? roleOptions
          : [...roleOptions, { key: m.roleKey, name: m.roleName }];
        return (
          <Select
            value={m.roleKey}
            disabled={own || pendingId === m.membershipId}
            aria-label={t('settings.team.roleOf', { name: m.name })}
            aria-busy={pendingId === m.membershipId || undefined}
            title={own ? t('settings.team.ownRole') : undefined}
            onChange={(e) => void changeRole(m, e.target.value)}
          >
            {options.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </Select>
        );
      },
    },
    {
      key: 'status',
      header: t('settings.team.status'),
      render: (m) =>
        m.status === 'SUSPENDED' ? t('settings.team.suspended') : t('settings.team.active'),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text">{t('staff.title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('staff.subtitle')}</p>
        </div>
        {canInvite && (
          <Button
            onClick={() => {
              setInviteError(null);
              setDialogOpen(true);
            }}
          >
            {t('staff.invite')}
          </Button>
        )}
      </header>

      <section aria-label={t('settings.team.members')}>
        <h4 className="mb-2 text-sm font-medium text-text">{t('settings.team.members')}</h4>
        {members.isLoading ? (
          <Skeleton lines={3} />
        ) : members.isError && !members.data ? (
          <ErrorState
            title={t('settings.team.loadError')}
            action={
              <Button variant="secondary" onClick={() => void members.refetch()}>
                {t('clinic.retry')}
              </Button>
            }
          />
        ) : (
          <DataTable<MemberRow>
            columns={memberColumns}
            rows={memberRows}
            caption={t('settings.team.members')}
            emptyLabel={t('settings.team.noMembers')}
          />
        )}
      </section>

      <section className="rounded-md border border-border bg-surface">
        <h4 className="border-b border-border px-4 py-3 text-sm font-medium text-text">
          {t('staff.pending')}
        </h4>
        {loading ? (
          <div className="p-4">
            <Skeleton lines={3} />
          </div>
        ) : loadFailed ? (
          <ErrorState
            title={t('staff.loadError')}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                {t('clinic.retry')}
              </Button>
            }
          />
        ) : invitations.length === 0 ? (
          <EmptyState title={t('staff.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs uppercase text-muted">
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('staff.email')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('staff.role')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('staff.expires')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-4 py-2 text-text">{inv.email}</td>
                    <td className="px-4 py-2 text-muted">
                      {inv.roleName ?? roleName(inv.roleKey ?? inv.role, t(`roles.${inv.role}`))}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {formatDate(
                        new Date(inv.expiresAt),
                        negotiateLocale(i18n.resolvedLanguage),
                        active?.clinicTimezone,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={dialogOpen}
        title={t('settings.team.inviteTitle')}
        onClose={() => setDialogOpen(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={sending}>
              {t('clinic.cancel')}
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={!email.includes('@') || sending}
              aria-busy={sending || undefined}
            >
              {t('staff.invite')}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(e) => void invite(e)} className="space-y-4">
          {inviteError && (
            <p role="alert" className="text-error">
              {inviteError}
            </p>
          )}
          <Field label={t('staff.email')}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('staff.role')}>
            <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
