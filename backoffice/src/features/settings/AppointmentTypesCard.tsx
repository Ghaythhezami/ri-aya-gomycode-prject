import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AppointmentTypeDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { canUser } from '../../auth/permissions';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { useClinicFormat } from '../shared/format';
import {
  useAppointmentTypesQuery,
  useCreateAppointmentTypeMutation,
  useDeleteAppointmentTypeMutation,
  useReorderAppointmentTypesMutation,
  useUpdateAppointmentTypeMutation,
} from './api';
import { errorStatus, errorText } from './apiError';
import { AppointmentTypeModal } from './AppointmentTypeModal';
import {
  canDeactivate,
  colorVar,
  moveType,
  moveTypeTo,
  reorderChanges,
  sortTypes,
} from './appointmentTypes';

/** Appointment types of the clinic: list, reorder, activate, create, edit, delete. */
export function AppointmentTypesCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const fmt = useClinicFormat();
  const canEdit = canUser(user, 'manageSettings');
  const query = useAppointmentTypesQuery();
  const [create, createState] = useCreateAppointmentTypeMutation();
  const [update, updateState] = useUpdateAppointmentTypeMutation();
  const [remove, removeState] = useDeleteAppointmentTypeMutation();
  const [reorder] = useReorderAppointmentTypesMutation();
  const [form, setForm] = useState<{ type?: AppointmentTypeDto } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AppointmentTypeDto | null>(null);
  const [blocked, setBlocked] = useState<AppointmentTypeDto | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const types = sortTypes(query.data ?? []);

  async function applyOrder(next: AppointmentTypeDto[]) {
    const changes = reorderChanges(types, next);
    if (changes.length === 0) return;
    try {
      await reorder(changes).unwrap();
      toast.success(t('settings.types.reordered'));
    } catch (error) {
      toast.error(errorText(t, error));
    }
  }

  async function toggleActive(type: AppointmentTypeDto) {
    try {
      await update({ id: type.id, body: { isActive: !type.isActive } }).unwrap();
    } catch (error) {
      toast.error(errorText(t, error));
    }
  }

  async function submit(payload: object) {
    setFormError(null);
    try {
      if (form?.type) {
        await update({ id: form.type.id, body: payload }).unwrap();
        toast.success(t('settings.types.updated'));
      } else {
        await create(payload as never).unwrap();
        toast.success(t('settings.types.created'));
      }
      setForm(null);
    } catch (error) {
      setFormError(errorText(t, error));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove(deleting.id).unwrap();
      toast.success(t('settings.types.deleted'));
      setDeleting(null);
    } catch (error) {
      if (errorStatus(error) === 409) {
        setBlocked(deleting);
        setDeleting(null);
      } else {
        toast.error(errorText(t, error));
        setDeleting(null);
      }
    }
  }

  async function deactivateBlocked() {
    if (!blocked) return;
    try {
      await update({ id: blocked.id, body: { isActive: false } }).unwrap();
      toast.success(t('settings.types.deactivated'));
    } catch (error) {
      toast.error(errorText(t, error));
    }
    setBlocked(null);
  }

  return (
    <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-text">{t('settings.types.title')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('settings.types.subtitle')}</p>
        </div>
        {canEdit && query.data && (
          <Button
            onClick={() => {
              setFormError(null);
              setForm({});
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t('settings.types.new')}
          </Button>
        )}
      </div>
      <div className="px-3 py-5 sm:px-6">
        {query.isLoading && <Skeleton lines={4} />}
        {query.isError && !query.data && (
          <ErrorState
            title={t('settings.types.loadError')}
            action={
              <Button variant="secondary" onClick={() => void query.refetch()}>
                {t('clinic.retry')}
              </Button>
            }
          />
        )}
        {query.data && types.length === 0 && <EmptyState title={t('settings.types.empty')} />}
        {query.data && types.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('settings.types.title')}</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted">
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('settings.types.name')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('settings.types.code')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('settings.types.duration')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('settings.types.usage')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('settings.types.active')}
                  </th>
                  {canEdit && (
                    <th scope="col" className="px-2 py-2 text-start">
                      {t('settings.roles.actions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {types.map((type, index) => (
                  <tr
                    key={type.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(type.id)}
                    onDragOver={(e) => {
                      if (dragId) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (dragId) void applyOrder(moveTypeTo(types, dragId, type.id));
                      setDragId(null);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={`border-b border-border ${dragId === type.id ? 'opacity-50' : ''}`}
                  >
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        {canEdit && (
                          <GripVertical
                            size={16}
                            aria-hidden="true"
                            className="shrink-0 cursor-grab text-muted"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className="size-4 shrink-0 rounded-full border border-border-strong"
                          style={{ backgroundColor: colorVar(type.color) }}
                        />
                        <span>
                          <span className="font-medium text-text">{type.displayName}</span>
                          <span className="block text-xs text-muted">
                            {t(`settings.types.colours.${type.color}`)}
                          </span>
                        </span>
                        {type.isEmergency && (
                          <Badge tone="error">{t('settings.types.emergency')}</Badge>
                        )}
                        {type.isSystem && <Badge tone="info">{t('settings.roles.system')}</Badge>}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-muted">{type.code}</td>
                    <td className="px-2 py-2">
                      {t('clinic.minutes', { count: type.durationMinutes })}
                    </td>
                    <td className="px-2 py-2">{fmt.number(type.usageCount)}</td>
                    <td className="px-2 py-2">
                      <label className="inline-flex min-h-10 items-center gap-2 text-text">
                        <input
                          type="checkbox"
                          role="switch"
                          className="size-4 accent-primary"
                          checked={type.isActive}
                          disabled={
                            !canEdit || updateState.isLoading || !canDeactivate(types, type)
                          }
                          title={
                            !canDeactivate(types, type)
                              ? t('settings.types.lastBookable')
                              : undefined
                          }
                          onChange={() => void toggleActive(type)}
                        />
                        <span>
                          {type.isActive ? t('settings.types.on') : t('settings.types.off')}
                        </span>
                        <span className="sr-only">{type.displayName}</span>
                      </label>
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2">
                        <span className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={index === 0}
                            aria-label={`${t('settings.types.moveUp')}: ${type.displayName}`}
                            onClick={() => void applyOrder(moveType(types, type.id, -1))}
                          >
                            <ArrowUp size={16} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={index === types.length - 1}
                            aria-label={`${t('settings.types.moveDown')}: ${type.displayName}`}
                            onClick={() => void applyOrder(moveType(types, type.id, 1))}
                          >
                            <ArrowDown size={16} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`${t('settings.roles.edit')}: ${type.displayName}`}
                            onClick={() => {
                              setFormError(null);
                              setForm({ type });
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            {t('settings.roles.edit')}
                          </Button>
                          {!type.isSystem && (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`${t('settings.roles.delete')}: ${type.displayName}`}
                              onClick={() => setDeleting(type)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              {t('settings.roles.delete')}
                            </Button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <AppointmentTypeModal
          type={form.type}
          saving={createState.isLoading || updateState.isLoading}
          error={formError}
          onSubmit={(p) => void submit(p)}
          onClose={() => setForm(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('settings.types.deleteTitle', { name: deleting?.displayName ?? '' })}
        confirmLabel={t('settings.roles.delete')}
        cancelLabel={t('clinic.cancel')}
        tone="danger"
        loading={removeState.isLoading}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        <p>{t('settings.types.deleteBody')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={blocked !== null}
        title={t('settings.types.blockedTitle', { name: blocked?.displayName ?? '' })}
        confirmLabel={t('settings.types.deactivate')}
        cancelLabel={t('clinic.close')}
        onConfirm={() => void deactivateBlocked()}
        onCancel={() => setBlocked(null)}
      >
        <p>{t('settings.types.blockedBody')}</p>
      </ConfirmDialog>
    </section>
  );
}
