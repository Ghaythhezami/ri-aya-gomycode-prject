import { Archive, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PatientStatus } from '@riaya/shared';

/** Active / Archived: icon + text, never colour alone. */
export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  const { t } = useTranslation();
  const Icon = status === 'ACTIVE' ? CheckCircle2 : Archive;
  const tone = status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted';
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${tone}`}
    >
      <Icon size={13} aria-hidden="true" />
      {t(`patients.status.${status}`)}
    </span>
  );
}

/** Whole years between a YYYY-MM-DD birth date and `now`. */
export function ageFromDob(dob: string, now: Date = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return 0;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return Math.max(0, age);
}
