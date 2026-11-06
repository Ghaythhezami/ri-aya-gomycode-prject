import { useTranslation } from 'react-i18next';
import { Siren } from 'lucide-react';
import { sortTypes, typeToken, useAppointmentTypesQuery } from '../shared/appointmentTypes';

/** Legend of the clinic's active appointment types: swatch + name, never colour alone. */
export function TypeLegend() {
  const { t } = useTranslation();
  const { data } = useAppointmentTypesQuery();
  if (!data?.length) return null;
  return (
    <ul aria-label={t('calendar.legend')} className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
      {sortTypes(data).map((type) => (
        <li key={type.code} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: typeToken(type.color, type.code) }}
          />
          {type.isEmergency ? <Siren size={12} aria-hidden="true" /> : null}
          {type.displayName}
        </li>
      ))}
    </ul>
  );
}
