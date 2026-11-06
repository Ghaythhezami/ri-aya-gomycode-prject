import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleSlash,
  Clock3,
  LogIn,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import type { AppointmentStatus, AppointmentType } from '@riaya/shared';

const STATUS_STYLE: Record<AppointmentStatus, { className: string; Icon: typeof CircleDot }> = {
  SCHEDULED: { className: 'bg-muted/10 text-muted', Icon: CircleDashed },
  CONFIRMED: { className: 'bg-success/10 text-success', Icon: CheckCircle2 },
  CHECKED_IN: { className: 'bg-accent text-primary', Icon: LogIn },
  IN_PROGRESS: { className: 'bg-info/10 text-info', Icon: PlayCircle },
  COMPLETED: { className: 'bg-primary/10 text-primary-dark', Icon: CheckCircle2 },
  CANCELLED: { className: 'bg-error/10 text-error', Icon: XCircle },
  NO_SHOW: { className: 'bg-warning/10 text-warning', Icon: CircleSlash },
};

/** Appointment status: icon + text + tint, never colour alone (UI-1). */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation();
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${className}`}
    >
      <Icon size={13} aria-hidden="true" />
      {t(`clinic.status.${status}`)}
    </span>
  );
}

const TYPE_STYLE: Record<AppointmentType, string> = {
  CONSULTATION: 'border-primary/30 bg-accent text-primary-dark',
  FOLLOW_UP: 'border-info/30 bg-info/10 text-info',
  EMERGENCY: 'border-alert/30 bg-alert/10 text-alert',
};

/** Tailwind classes for an appointment block of a type (calendar, grid). */
export function typeBlockClass(type: AppointmentType): string {
  return TYPE_STYLE[type];
}

export function TypeLabel({ type }: { type: AppointmentType }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 text-sm text-text">
      {type === 'EMERGENCY' && <Clock3 size={13} aria-hidden="true" className="text-alert" />}
      {t(`clinic.type.${type}`)}
    </span>
  );
}
