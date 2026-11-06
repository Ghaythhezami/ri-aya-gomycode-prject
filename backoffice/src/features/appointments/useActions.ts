import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppointmentStatus } from '@riaya/shared';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useApptBulkMutation, useApptCancelMutation, useApptSetStatusMutation } from './api';

/** Localised message of a rejected API call. */
export function useErrorText() {
  const { t } = useTranslation();
  return useCallback(
    (raw: unknown): string => {
      const error = asClinicError(raw);
      return t(`errors.${error?.code ?? 'generic'}`, {
        defaultValue: error?.message ?? t('errors.generic'),
      });
    },
    [t],
  );
}

/**
 * Status changes, cancellation and bulk actions with toast feedback. Cancel and
 * bulk-cancel re-throw so the reason dialog can show the API message (for example
 * `CANCELLATION_POLICY`) next to the field and keep what the user typed.
 */
export function useAppointmentActions() {
  const { t } = useTranslation();
  const toast = useToast();
  const errorText = useErrorText();
  const [setStatusMutation] = useApptSetStatusMutation();
  const [cancelMutation] = useApptCancelMutation();
  const [bulkMutation] = useApptBulkMutation();

  const setStatus = useCallback(
    async (id: string, status: AppointmentStatus): Promise<boolean> => {
      try {
        await setStatusMutation({ id, status }).unwrap();
        toast.success(t('appointments.toast.status', { status: t(`clinic.status.${status}`) }));
        return true;
      } catch (raw) {
        toast.error(errorText(raw));
        return false;
      }
    },
    [setStatusMutation, toast, t, errorText],
  );

  const cancel = useCallback(
    async (id: string, reason: string) => {
      await cancelMutation({ id, reason }).unwrap();
      toast.success(t('appointments.toast.cancelled'));
    },
    [cancelMutation, toast, t],
  );

  const bulk = useCallback(
    async (ids: string[], action: 'CONFIRM' | 'CANCEL', reason?: string) => {
      const result = await bulkMutation({ ids, action, reason }).unwrap();
      const failed = result.failed.length;
      if (failed === 0) toast.success(t('appointments.toast.bulk', { count: result.updated }));
      else toast.info(t('appointments.toast.bulkPartial', { count: result.updated, failed }));
      return result;
    },
    [bulkMutation, toast, t],
  );

  return { setStatus, cancel, bulk, errorText };
}
