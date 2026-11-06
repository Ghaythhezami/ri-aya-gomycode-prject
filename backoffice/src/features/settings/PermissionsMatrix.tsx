import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { Capability, PermissionsMatrix as MatrixDto, RoleDto } from '@riaya/shared';
import { Button } from '../../common/Button';
import { useToast } from '../../common/Toast';
import { Tooltip } from '../../common/Tooltip';
import { useUnsavedGuard } from '../scheduling/useUnsavedGuard';
import { useUpdateRoleMutation } from './api';
import { errorText } from './apiError';
import {
  cellState,
  currentCapabilities,
  diffCapabilities,
  dirtyRoleKeys,
  groupCapabilities,
  toggleCapability,
  type CellState,
  type MatrixDraft,
} from './rbac';

/**
 * Roles as columns, capabilities (grouped) as rows. Every checkbox is named
 * "<role> — <capability>". Read-only roles, locked admin capabilities and capabilities the
 * signed-in user does not hold stay focusable (aria-disabled) so the reason is reachable
 * from the keyboard, and the reason is also printed for screen readers.
 */
export function PermissionsMatrix({
  matrix,
  userCapabilities,
  canEdit,
}: {
  matrix: MatrixDto;
  userCapabilities: readonly string[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [update] = useUpdateRoleMutation();
  const [draft, setDraft] = useState<MatrixDraft>({});
  const [saving, setSaving] = useState<string | null>(null);
  const groups = groupCapabilities(matrix.capabilities);
  const dirtyKeys = dirtyRoleKeys(matrix.roles, draft);
  useUnsavedGuard(dirtyKeys.length > 0, t('settings.leaveConfirm'));

  const discard = (key: string) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });

  async function save(role: RoleDto) {
    setSaving(role.key);
    try {
      await update({
        key: role.key,
        body: { capabilities: currentCapabilities(role, draft) },
      }).unwrap();
      discard(role.key);
      toast.success(t('settings.roles.saved', { name: role.displayName }));
    } catch (error) {
      toast.error(errorText(t, error));
    } finally {
      setSaving(null);
    }
  }

  function stateOf(role: RoleDto, capability: Capability): CellState {
    const state = cellState(role, capability, draft, userCapabilities);
    if (!canEdit && state.reason === null) return { ...state, disabled: true, reason: 'viewOnly' };
    return state;
  }

  return (
    <div>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t('settings.roles.matrix.title')}
      >
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">{t('settings.roles.matrix.title')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky start-0 z-10 w-64 bg-surface px-3 py-2 text-start text-xs font-semibold uppercase text-muted"
              >
                {t('settings.roles.matrix.capability')}
              </th>
              {matrix.roles.map((role) => (
                <th key={role.key} scope="col" className="px-3 py-2 text-center align-bottom">
                  <span className="block font-semibold text-text">{role.displayName}</span>
                  <span className="block text-xs font-normal text-muted">
                    {role.isSystem ? t('settings.roles.system') : t('settings.roles.custom')}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map(({ group, capabilities }) => (
            <tbody key={group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={matrix.roles.length + 1}
                  className="bg-bg px-3 py-2 text-start text-xs font-semibold uppercase text-muted"
                >
                  {t(`settings.roles.groups.${group}`)}
                </th>
              </tr>
              {capabilities.map((capability) => (
                <tr key={capability} className="border-b border-border">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 bg-surface px-3 py-2 text-start font-normal"
                  >
                    <span className="block font-medium text-text">
                      {t(`settings.roles.capabilities.${capability}.label`)}
                    </span>
                    <span className="block text-xs text-muted">
                      {t(`settings.roles.capabilities.${capability}.help`)}
                    </span>
                  </th>
                  {matrix.roles.map((role) => {
                    const state = stateOf(role, capability);
                    const changed =
                      role.capabilities.includes(capability) !== state.checked && role.editable;
                    return (
                      <td key={role.key} className="px-3 py-2 text-center">
                        <MatrixCell
                          label={`${role.displayName} — ${t(`settings.roles.capabilities.${capability}.label`)}`}
                          state={state}
                          changed={changed}
                          onToggle={() =>
                            setDraft((d) => toggleCapability(d, role, capability, userCapabilities))
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {dirtyKeys.length > 0 && (
        <div
          role="region"
          aria-label={t('settings.roles.unsaved.title', { count: dirtyKeys.length })}
          className="sticky bottom-0 z-20 mt-4 space-y-2 rounded-lg border border-warning/40 bg-surface p-3 shadow-(--shadow-overlay)"
        >
          <p role="status" className="text-sm font-semibold text-text">
            {t('settings.roles.unsaved.title', { count: dirtyKeys.length })}
          </p>
          <ul className="space-y-2">
            {matrix.roles
              .filter((r) => dirtyKeys.includes(r.key))
              .map((role) => {
                const diff = diffCapabilities(role, draft);
                return (
                  <li key={role.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-32 font-medium text-text">{role.displayName}</span>
                    <span className="flex-1 text-muted">
                      {t('settings.roles.unsaved.changes', {
                        added: diff.added.length,
                        removed: diff.removed.length,
                      })}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => discard(role.key)}
                      disabled={saving === role.key}
                    >
                      {t('settings.roles.unsaved.discard')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void save(role)}
                      disabled={saving !== null}
                      aria-busy={saving === role.key || undefined}
                    >
                      {saving === role.key ? t('settings.saving') : t('clinic.save')}
                    </Button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

function MatrixCell({
  label,
  state,
  changed,
  onToggle,
}: {
  label: string;
  state: CellState;
  changed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const reason = state.reason ? t(`settings.roles.reason.${state.reason}`) : null;
  const input = (
    <input
      type="checkbox"
      checked={state.checked}
      aria-label={label}
      aria-disabled={state.disabled || undefined}
      onChange={() => {
        if (!state.disabled) onToggle();
      }}
      className={`size-5 accent-primary ${state.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    />
  );
  return (
    <span className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1">
      {reason ? (
        <Tooltip content={reason}>
          <span className="inline-flex items-center gap-1">
            {input}
            {state.reason === 'locked' && (
              <Lock size={14} aria-hidden="true" className="text-muted" />
            )}
            <span className="sr-only">{reason}</span>
          </span>
        </Tooltip>
      ) : (
        input
      )}
      {changed && (
        <>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          <span className="sr-only">{t('settings.roles.changed')}</span>
        </>
      )}
    </span>
  );
}
