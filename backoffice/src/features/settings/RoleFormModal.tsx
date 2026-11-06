import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasLocalized, type Capability, type LocalizedText, type RoleDto } from '@riaya/shared';
import type { UserRole } from '../../lib/types';
import { Button } from '../../common/Button';
import { Field, Select } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import { Modal } from '../../common/Modal';
import { templateCapabilities } from './rbac';

const BASE_ROLES: UserRole[] = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];

export interface RoleFormValue {
  name: LocalizedText;
  description: LocalizedText;
  baseRole: UserRole;
  capabilities: Capability[];
}

/** Create a custom role (optionally from a template) or edit a role's name and description. */
export function RoleFormModal({
  role,
  roles,
  userCapabilities,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  /** The role being edited; undefined creates a custom role. */
  role?: RoleDto;
  roles: RoleDto[];
  userCapabilities: readonly string[];
  saving: boolean;
  error?: string | null;
  onSubmit: (value: RoleFormValue) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [name, setName] = useState<LocalizedText>(role?.name ?? {});
  const [description, setDescription] = useState<LocalizedText>(role?.description ?? {});
  const [baseRole, setBaseRole] = useState<UserRole>(
    (role?.baseRole as UserRole | undefined) ?? 'RECEPTIONIST',
  );
  const [template, setTemplate] = useState('');
  const [touched, setTouched] = useState(false);
  const editing = Boolean(role);

  const tpl = useMemo(
    () => (template ? templateCapabilities(roles, template, userCapabilities) : null),
    [roles, template, userCapabilities],
  );
  const nameError = touched && !hasLocalized(name) ? 'settings.errors.nameRequired' : undefined;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!hasLocalized(name)) return;
    onSubmit({
      name,
      description,
      baseRole,
      capabilities: role ? (role.capabilities as Capability[]) : (tpl?.capabilities ?? []),
    });
  }

  function chooseTemplate(key: string) {
    setTemplate(key);
    const source = roles.find((r) => r.key === key);
    if (source) setBaseRole(source.baseRole as UserRole);
  }

  return (
    <Modal
      open
      title={editing ? t('settings.roles.editTitle') : t('settings.roles.createTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('clinic.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving} aria-busy={saving || undefined}>
            {saving ? t('settings.saving') : t('clinic.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-error">
            {error}
          </p>
        )}
        <LocalizedInput
          label={t('settings.roles.name')}
          value={name}
          onChange={setName}
          error={nameError}
          required
          name="name"
        />
        <LocalizedInput
          label={t('settings.roles.description')}
          value={description}
          onChange={setDescription}
          maxLength={255}
          name="description"
        />
        <Field label={t('settings.roles.baseRole')} help={t('settings.roles.baseRoleHelp')}>
          <Select
            value={baseRole}
            disabled={editing}
            onChange={(e) => setBaseRole(e.target.value as UserRole)}
          >
            {BASE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        {!editing && (
          <Field label={t('settings.roles.template')} help={t('settings.roles.templateHelp')}>
            <Select value={template} onChange={(e) => chooseTemplate(e.target.value)}>
              <option value="">{t('settings.roles.templateNone')}</option>
              {roles
                .filter((r) => r.key !== 'SUPER_ADMIN')
                .map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.displayName}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {tpl && (
          <p role="status" className="text-sm text-muted">
            {t('settings.roles.templateCopies', { count: tpl.capabilities.length })}
            {tpl.dropped > 0
              ? ` ${t('settings.roles.templateDropped', { count: tpl.dropped })}`
              : ''}
          </p>
        )}
      </form>
    </Modal>
  );
}
