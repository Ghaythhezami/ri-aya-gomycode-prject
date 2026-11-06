import type { TFunction } from 'i18next';
import { asClinicError } from '../../store/clinicApi';

/** Localized text of a failed call: the API's own message (already in the request language), else the code's catalogue entry. */
export function errorText(t: TFunction, error: unknown): string {
  const e = asClinicError(error);
  if (!e) return t('errors.INTERNAL_ERROR', { defaultValue: '' });
  return e.message || t(`errors.${e.code}`, { defaultValue: e.code });
}

/** HTTP status of a failed RTK Query call, 0 when unknown. */
export function errorStatus(error: unknown): number {
  return asClinicError(error)?.status ?? 0;
}
