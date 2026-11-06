import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PatientListItem } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Avatar } from '../shared/Avatar';

/** Possible duplicates list, shown while typing and after a 409. */
export function DuplicateWarning({
  matches,
  onUse,
}: {
  matches: PatientListItem[];
  onUse?: (patient: PatientListItem) => void;
}) {
  const { t } = useTranslation();
  if (matches.length === 0) return null;
  return (
    <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-text">
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle size={16} aria-hidden="true" className="text-warning" />
        {t('patients.duplicates.title', { count: matches.length })}
      </p>
      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-md bg-surface p-2">
            <Avatar initials={m.initials} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{m.name}</p>
              <p className="truncate text-xs text-muted">
                <span dir="ltr">{m.code}</span> · <span dir="ltr">{m.phoneMasked}</span>
              </p>
            </div>
            {onUse && (
              <Button variant="secondary" size="sm" type="button" onClick={() => onUse(m)}>
                {t('patients.duplicates.use')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
