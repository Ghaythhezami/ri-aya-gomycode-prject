import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CAPABILITIES, CAPABILITY_ROLES, type Capability } from '@riaya/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../auth/WorkspaceContext';
import { api } from '../../lib/api';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Field, Input, Select } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { DataTable, type Column } from '../../common/Table';
import { SettingsCard, SettingsSkeleton } from './SettingsCard';
import { CUSTOM_ROLE_BASES, type BaseRole, type RoleView } from './types';

function allowedCapabilities(baseRole: BaseRole) {
  return CAPABILITIES.filter((capability) => CAPABILITY_ROLES[capability].includes(baseRole));
}

function errorCode(error: unknown) {
  return (error as { response?: { data?: { code?: string } } }).response?.data?.code;
}

/**
 * Roles and permissions (BP-035).
 *
 * Built-in roles come from the shared capability matrix and stay read-only.
 * Custom roles are clinic-scoped: they can be created, edited and deleted here,
 * and their permission set is constrained to their base role's capabilities.
 */
export function RolesPermissionsSection() {
  const { t } = useTranslation();
  const { active } = useWorkspace();
  const navigate = useNavigate();

  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleView | null>(null);
  const [name, setName] = useState('');
  const [baseRole, setBaseRole] = useState<BaseRole>('RECEPTIONIST');
  const [permissions, setPermissions] = useState<Capability[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RoleView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get<RoleView[]>('/api/roles');
      setRoles(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName('');
    setBaseRole('RECEPTIONIST');
    setPermissions(allowedCapabilities('RECEPTIONIST'));
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(role: RoleView) {
    setEditing(role);
    setName(role.name);
    setBaseRole(role.baseRole as BaseRole);
    setPermissions(role.permissions as Capability[]);
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
  }

  function changeBaseRole(next: BaseRole) {
    setBaseRole(next);
    const allowed = allowedCapabilities(next);
    setPermissions((current) => current.filter((permission) => allowed.includes(permission)));
    setFormError(null);
  }

  function togglePermission(capability: Capability) {
    setPermissions((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
    setFormError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || name.trim().length < 2) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = { name: name.trim(), baseRole, permissions };
      if (editing) {
        await api.patch(`/api/roles/${editing.id}`, payload);
        setNotice(t('settings.roleUpdated'));
      } else {
        await api.post('/api/roles', payload);
        setNotice(t('settings.roleCreated'));
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      const code = errorCode(err);
      setFormError(
        code === 'ROLE_NAME_TAKEN'
          ? t('settings.roleNameTaken')
          : code === 'INVALID_ROLE_PERMISSIONS'
            ? t('settings.rolePermissionsInvalid')
            : t('settings.roleSaveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.delete(`/api/roles/${deleteTarget.id}`);
      setNotice(t('settings.roleDeleted'));
      setDeleteTarget(null);
      await load();
    } catch {
      setActionError(t('settings.roleDeleteError'));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<RoleView>[] = [
    {
      key: 'name',
      header: t('settings.role'),
      render: (row) => (
        <div>
          <span className="font-medium text-text">
            {row.isSystem ? t(`roles.${row.id}`) : row.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {row.isSystem ? t('settings.systemRole') : t('settings.customRole')}
          </span>
        </div>
      ),
    },
    {
      key: 'accessLevel',
      header: t('settings.accessLevel'),
      render: (row) => (
        <span className="text-muted">{t(`settings.access.${row.accessLevel}`)}</span>
      ),
    },
    {
      key: 'permissions',
      header: t('settings.permissions'),
      render: (row) => (
        <span className="text-muted">
          {t('settings.permissionCount', { count: row.permissions.length })}
        </span>
      ),
    },
    {
      key: 'users',
      header: t('settings.users'),
      render: (row) => (
        <span className="text-muted">{t('settings.userCount', { count: row.users })}</span>
      ),
    },
    {
      key: 'enabled',
      header: t('settings.enabled'),
      render: () => <Badge tone="success">{t('settings.enabled')}</Badge>,
    },
    {
      key: 'actions',
      header: t('settings.actions'),
      render: (row) =>
        row.editable ? (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${t('settings.editRole')} ${row.name}`}
              onClick={() => openEdit(row)}
            >
              <Pencil size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${t('settings.deleteRole')} ${row.name}`}
              onClick={() => {
                setActionError(null);
                setDeleteTarget(row);
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">{t('settings.systemRole')}</span>
        ),
    },
  ];

  const title = t('settings.rolesPermissions');
  const description = t('settings.updateConfig', { clinic: active?.clinicName ?? '' });
  const allowed = allowedCapabilities(baseRole);

  return (
    <>
      <SettingsCard
        title={title}
        description={description}
        badge={t('settings.draft')}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => navigate('/staff')}>
              {t('settings.manageStaff')}
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden="true" />
              {t('settings.addRole')}
            </Button>
          </>
        }
      >
        {notice ? (
          <p role="status" className="mb-4 text-sm text-success">
            {notice}
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="mb-4 text-sm text-error">
            {actionError}
          </p>
        ) : null}

        {loading ? (
          <SettingsSkeleton />
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-sm text-error">
              {t('settings.loadError')}
            </p>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              {t('settings.retry')}
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={roles}
            caption={title}
            sortable={false}
            emptyLabel={t('settings.noRoles')}
          />
        )}
      </SettingsCard>

      <Modal
        open={formOpen}
        title={editing ? t('settings.editRole') : t('settings.addRole')}
        onClose={closeForm}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
              {t('settings.cancel')}
            </Button>
            <Button type="submit" form="role-form" disabled={saving || name.trim().length < 2}>
              {saving ? t('settings.saving') : t('settings.saveChanges')}
            </Button>
          </>
        }
      >
        <form id="role-form" onSubmit={submit} className="space-y-4">
          <Field label={t('settings.roleName')}>
            <Input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFormError(null);
              }}
              maxLength={40}
              required
            />
          </Field>

          <Field label={t('settings.baseRole')} help={t('settings.baseRoleHelp')}>
            <Select
              value={baseRole}
              onChange={(event) => changeBaseRole(event.target.value as BaseRole)}
            >
              {CUSTOM_ROLE_BASES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </Select>
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text">
              {t('settings.permissionsLabel')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {allowed.map((capability) => (
                <label
                  key={capability}
                  className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-text"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={permissions.includes(capability)}
                    onChange={() => togglePermission(capability)}
                  />
                  <span>{t(`settings.capabilities.${capability}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {formError ? (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('settings.deleteRoleTitle')}
        confirmLabel={t('settings.delete')}
        cancelLabel={t('settings.cancel')}
        tone="danger"
        loading={deleting}
        onConfirm={() => void remove()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      >
        <p>{t('settings.deleteRoleBody', { name: deleteTarget?.name ?? '' })}</p>
      </ConfirmDialog>
    </>
  );
}
