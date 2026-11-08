import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { can } from '@riaya/shared';
import { useWorkspace } from '../auth/WorkspaceContext';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';
import { Modal } from '../common/Modal';

/**
 * Clinic switcher and clinic creator for the sidebar footer.
 *
 * The provider owns the memberships and the active clinic, so every place that
 * shows a workspace reads the same state. A SUPER_ADMIN sees every clinic in
 * the organization, including ones created after sign-in.
 */
export function WorkspaceSwitcher({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { memberships, active, switching, switchTo, createClinic } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const closeModal = useCallback(() => {
    if (saving) return;
    setCreating(false);
    setError(null);
  }, [saving]);

  if (!active) {
    return collapsed ? null : (
      <p className="truncate px-1 text-xs text-white/60" title={t('shell.noWorkspace')}>
        {t('shell.noWorkspace')}
      </p>
    );
  }

  const canManage = can(active.role, 'manageSettings');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createClinic(name);
      setCreating(false);
      setName('');
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      setError(
        code === 'CLINIC_NAME_REQUIRED' ? t('workspace.nameRequired') : t('workspace.createError'),
      );
    } finally {
      setSaving(false);
    }
  }

  function selectClinic(clinicId: string) {
    setOpen(false);
    setSwitchError(null);
    onNavigate?.();
    void switchTo(clinicId).catch(() => setSwitchError(t('workspace.switchError')));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setSwitchError(null);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('workspace.switchClinic')}
        aria-busy={switching}
        title={`${active.clinicName} — ${active.organizationName}`}
        className={`flex min-h-11 w-full items-center gap-3 rounded-md text-sm text-white/80 transition hover:bg-surface/10 ${
          collapsed ? 'justify-center px-0' : 'px-2'
        }`}
      >
        <Building2 size={18} aria-hidden="true" className="shrink-0" />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 text-start">
              <span className="block truncate font-medium text-white">
                {switching ? t('workspace.switching') : active.clinicName}
              </span>
              <span className="block truncate text-xs text-white/50">
                {active.organizationName}
              </span>
            </span>
            {switching ? (
              <Loader2
                size={14}
                aria-hidden="true"
                className="shrink-0 animate-spin text-white/70"
              />
            ) : (
              <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-white/50" />
            )}
          </>
        ) : null}
      </button>

      {switchError ? (
        <p role="alert" className="mt-1 px-1 text-xs text-error">
          {switchError}
        </p>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full z-40 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface py-1 text-text shadow-(--shadow-card)">
            <p className="px-3 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t('workspace.switchClinic')}
            </p>
            <p className="truncate px-3 py-1 text-xs font-semibold text-text">
              {active.organizationName}
            </p>
            <ul
              role="listbox"
              aria-label={t('workspace.clinics')}
              className="max-h-64 overflow-y-auto"
            >
              {memberships.map((membership) => {
                const selected = membership.clinicId === active.clinicId;
                return (
                  <li key={membership.clinicId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={switching}
                      onClick={() => selectClinic(membership.clinicId)}
                      className={`flex min-h-11 w-full flex-col items-start justify-center px-3 py-2 text-start text-sm hover:bg-bg disabled:opacity-60 ${
                        selected ? 'bg-accent' : ''
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate font-medium text-text">
                          {membership.clinicName}
                        </span>
                        {selected ? (
                          <Check size={16} aria-hidden="true" className="shrink-0 text-primary" />
                        ) : null}
                      </span>
                      <span className="w-full truncate text-xs text-muted">
                        {t(`roles.${membership.role}`)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {canManage ? (
              <div className="mt-1 border-t border-border p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                    setCreating(true);
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-bg"
                >
                  <Plus size={16} aria-hidden="true" />
                  {t('workspace.createClinic')}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <Modal
        open={creating}
        title={t('workspace.createClinic')}
        onClose={closeModal}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              {t('workspace.cancel')}
            </Button>
            <Button
              type="submit"
              form="create-clinic-form"
              disabled={saving || name.trim().length < 2}
            >
              {saving ? t('workspace.creating') : t('workspace.create')}
            </Button>
          </>
        }
      >
        <form id="create-clinic-form" onSubmit={submit} className="space-y-3">
          <p>{t('workspace.createClinicBody', { organization: active.organizationName })}</p>
          <Field label={t('workspace.clinicName')}>
            <Input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder={t('workspace.clinicNamePlaceholder')}
              maxLength={120}
              required
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
