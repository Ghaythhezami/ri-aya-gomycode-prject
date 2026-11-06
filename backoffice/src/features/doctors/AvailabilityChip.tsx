import {
  CheckCircle2,
  Coffee,
  PlaneTakeoff,
  PowerOff,
  Stethoscope,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DoctorAvailability } from '@riaya/shared';

const STYLE: Record<DoctorAvailability, { className: string; Icon: LucideIcon }> = {
  AVAILABLE: { className: 'bg-success/10 text-success', Icon: CheckCircle2 },
  IN_CONSULTATION: { className: 'bg-info/10 text-info', Icon: Stethoscope },
  ON_BREAK: { className: 'bg-warning/10 text-warning', Icon: Coffee },
  ON_LEAVE: { className: 'bg-alert/10 text-alert', Icon: PlaneTakeoff },
  OFF_DUTY: { className: 'bg-muted/10 text-muted', Icon: PowerOff },
  INACTIVE: { className: 'bg-muted/10 text-muted', Icon: UserX },
};

/** Availability: icon + text + tint, never colour alone. */
export function AvailabilityChip({ availability }: { availability: DoctorAvailability }) {
  const { t } = useTranslation();
  const { className, Icon } = STYLE[availability];
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${className}`}
    >
      <Icon size={13} aria-hidden="true" />
      {t(`doctors.availability.${availability}`)}
    </span>
  );
}

/** Utilisation meter with an accessible value. */
export function UtilisationBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-bg"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
