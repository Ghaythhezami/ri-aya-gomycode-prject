import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { pickLocalized, type RoleDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { canUser } from '../../auth/permissions';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { DataTable, type Column } from '../../common/Table';
import { StaffDirectoryPage } from '../../pages/StaffDirectoryPage';
import { useClinicFormat } from '../shared/format';
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useRolesQuery,
  useUpdateRoleMutation,
} from './api';
import { errorStatus, errorText } from './apiError';
import { PermissionsMatrix } from './PermissionsMatrix';
import { canDelete, canReset } from './rbac';
import { RoleFormModal, type RoleFormValue } from './RoleFormModal';

type Row = RoleDto & { id: string };

/** Whether the signed-in user may see the roles area at all (edit needs manageRoles). */
export function canViewRoles(user: Parameters<typeof canUser>[0]): boolean {
  return (
    canUser(user, 'manageRoles') || canUser(user, 'viewAuditLog') || canUser(user, 'manageSettings')
  );
}

/** Roles list, permissions matrix (editable with manageRoles, read-only otherwise) and the team area. */
export function RolesSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const fmt = useClinicFormat();
  const roles = useRolesQuery();
  const [create, createState] = useCreateRoleMutation();
  const [update, updateState] = useUpdateRoleMutation();
  const [remove, removeState] = useDeleteRoleMutation();
  const [form, setForm] = useState<{ role?: RoleDto } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'reset'; role: RoleDto } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const canEdit = canUser(user, 'manageRoles');
  const userCapabilities = user?.capabilities ?? [];

  if (!canViewRoles(user)) {
    return <EmptyState title={t('settings.roles.noAccess')} />;
  }

  const closeForm = () => {
    setForm(null);
    setFormError(null);
  };

  async function submitForm(value: RoleFormValue) {
    setFormError(null);
    try {
      if (form?.role) {
        await update({
          key: form.role.key,
          body: { name: value.name, description: value.description },
        }).unwrap();
        toast.success(t('settings.roles.updated'));
      } else {
        await create(value).unwrap();
        toast.success(t('settings.roles.created'));
      }
      closeForm();
    } catch (error) {
      setFormError(errorText(t, error));
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmError(null);
    try {
      await remove(confirm.role.key).unwrap();
      toast.success(
        confirm.kind === 'delete' ? t('settings.roles.deleted') : t('settings.roles.resetDone'),
      );
      setConfirm(null);
    } catch (error) {
      setConfirmError(
        errorStatus(error) === 409 ? t('settings.roles.deleteInUse') : errorText(t, error),
      );
    }
  }

  const rows: Row[] = (roles.data?.roles ?? []).map((r) => ({ ...r, id: r.key }));
  const columns: Column<Row>[] = [
    {
      key: 'displayName',
      header: t('settings.roles.role'),
      sortable: true,
      render: (r) => (
        <span>
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <ShieldCheck size={16} aria-hidden="true" className="text-primary" />
            {r.displayName}
          </span>
          {pickLocalized(r.description, i18n.resolvedLanguage) && (
            <span className="block text-xs text-muted">
              {pickLocalized(r.description, i18n.resolvedLanguage)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'isSystem',
      header: t('settings.roles.type'),
      render: (r) => (
        <Badge tone={r.isSystem ? 'info' : 'neutral'}>
          {r.isSystem ? t('settings.roles.system') : t('settings.roles.custom')}
        </Badge>
      ),
    },
    {
      key: 'baseRole',
      header: t('settings.roles.baseRole'),
      render: (r) => t(`roles.${r.baseRole}`),
    },
    {
      key: 'memberCount',
      header: t('settings.roles.users'),
      sortable: true,
      render: (r) => fmt.number(r.memberCount),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: t('settings.roles.actions'),
            render: (r: Row) => (
              <span className="flex flex-wrap gap-2">
                {r.editable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setForm({ role: r })}
                    aria-label={`${t('settings.roles.edit')}: ${r.displayName}`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    {t('settings.roles.edit')}
                  </Button>
                )}
                {canReset(r) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirm({ kind: 'reset', role: r })}
                    aria-label={`${t('settings.roles.reset')}: ${r.displayName}`}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {t('settings.roles.reset')}
                  </Button>
                )}
                {canDelete(r) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirm({ kind: 'delete', role: r })}
                    aria-label={`${t('settings.roles.delete')}: ${r.displayName}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {t('settings.roles.delete')}
                  </Button>
                )}
              </span>
            ),
          } as Column<Row>,
        ]
      : []),
  ];

  const retry = (
    <Button variant="secondary" onClick={() => void roles.refetch()}>
      {t('clinic.retry')}
    </Button>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-text">{t('settings.roles.title')}</h2>
            <p className="mt-0.5 text-sm text-muted">{t('settings.roles.subtitle')}</p>
            {!canEdit && (
              <p role="note" className="mt-1 text-sm text-muted">
                {t('settings.roles.viewOnly')}
              </p>
            )}
          </div>
          {canEdit && roles.data && (
            <Button onClick={() => setForm({})}>
              <Plus size={16} aria-hidden="true" />
              {t('settings.roles.new')}
            </Button>
          )}
        </div>
        <div className="px-6 py-5">
          {roles.isLoading && <Skeleton lines={4} />}
          {roles.isError && !roles.data && (
            <ErrorState title={t('settings.roles.loadError')} action={retry} />
          )}
          {roles.data && (
            <DataTable<Row>
              columns={columns}
              rows={rows}
              caption={t('settings.roles.title')}
              emptyLabel={t('settings.roles.empty')}
            />
          )}
        </div>
      </section>

      {roles.data && (
        <section
          aria-labelledby="matrix-heading"
          className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
        >
          <div className="border-b border-border px-6 py-5">
            <h2 id="matrix-heading" className="text-base font-semibold text-text">
              {t('settings.roles.matrix.title')}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{t('settings.roles.matrix.subtitle')}</p>
          </div>
          <div className="px-3 py-5 sm:px-6">
            <PermissionsMatrix
              matrix={roles.data}
              userCapabilities={userCapabilities}
              canEdit={canEdit}
            />
          </div>
        </section>
      )}

      <section
        id="team"
        aria-labelledby="team-heading"
        className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
      >
        <div className="border-b border-border px-6 py-5">
          <h2 id="team-heading" className="text-base font-semibold text-text">
            {t('settings.team.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t('settings.team.subtitle')}</p>
        </div>
        <div className="px-6 py-5">
          <StaffDirectoryPage />
        </div>
      </section>

      {form && roles.data && (
        <RoleFormModal
          role={form.role}
          roles={roles.data.roles}
          userCapabilities={userCapabilities}
          saving={createState.isLoading || updateState.isLoading}
          error={formError}
          onSubmit={(v) => void submitForm(v)}
          onClose={closeForm}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'delete'
            ? t('settings.roles.deleteTitle', { name: confirm.role.displayName })
            : t('settings.roles.resetTitle', { name: confirm?.role.displayName ?? '' })
        }
        confirmLabel={
          confirm?.kind === 'delete' ? t('settings.roles.delete') : t('settings.roles.reset')
        }
        cancelLabel={t('clinic.cancel')}
        tone={confirm?.kind === 'delete' ? 'danger' : 'default'}
        loading={removeState.isLoading}
        onConfirm={() => void runConfirm()}
        onCancel={() => {
          setConfirm(null);
          setConfirmError(null);
        }}
      >
        <p>
          {confirm?.kind === 'delete'
            ? t('settings.roles.deleteBody')
            : t('settings.roles.resetBody')}
        </p>
        {confirmError && (
          <p role="alert" className="mt-3 text-error">
            {confirmError}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
