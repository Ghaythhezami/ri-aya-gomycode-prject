import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Translates a doctor specialty (`clinic.specialty.<Name>`). Unknown specialties,
 * which clinics can type freely, fall back to the raw string.
 */
export function useSpecialtyLabel(): (specialty: string | null | undefined) => string {
  const { t } = useTranslation();
  return useCallback(
    (specialty) =>
      specialty ? t(`clinic.specialty.${specialty}`, { defaultValue: specialty }) : '',
    [t],
  );
}
