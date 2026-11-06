import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Circle,
  CircleSlash,
  Clock3,
  Flag,
  MoreHorizontal,
  PlayCircle,
  Siren,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QueueEntryDto, QueuePriority, QueueStatus } from '@riaya/shared';
import { QUEUE_PRIORITIES } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Dropdown, type MenuItem } from '../../common/Dropdown';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';

const PRIORITY_STYLE: Record<QueuePriority, { className: string; Icon: LucideIcon }> = {
  NORMAL: { className: 'bg-muted/10 text-muted', Icon: Circle },
  URGENT: { className: 'bg-warning/10 text-warning', Icon: Flag },
  EMERGENCY: { className: 'bg-alert/10 text-alert', Icon: Siren },
};

const STATUS_STYLE: Record<QueueStatus, { className: string; Icon: LucideIcon }> = {
  WAITING: { className: 'bg-warning/10 text-warning', Icon: Clock3 },
  CALLED: { className: 'bg-accent text-primary', Icon: BellRing },
  IN_CONSULTATION: { className: 'bg-info/10 text-info', Icon: PlayCircle },
  COMPLETED: { className: 'bg-success/10 text-success', Icon: CheckCircle2 },
  NO_SHOW: { className: 'bg-muted/10 text-muted', Icon: CircleSlash },
  RESCHEDULED: { className: 'bg-muted/10 text-muted', Icon: UserCheck },
};

const chip =
  'inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium';

export function PriorityChip({ priority }: { priority: QueuePriority }) {
  const { t } = useTranslation();
  const { className, Icon } = PRIORITY_STYLE[priority];
  return (
    <span className={`${chip} ${className}`}>
      <Icon size={13} aria-hidden="true" />
      {t(`clinic.priority.${priority}`)}
    </span>
  );
}

export function QueueStatusChip({ status }: { status: QueueStatus }) {
  const { t } = useTranslation();
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span className={`${chip} ${className}`}>
      <Icon size={13} aria-hidden="true" />
      {t(`queue.status.${status}`)}
    </span>
  );
}

export interface QueueRowProps {
  entry: QueueEntryDto;
  /** Waiting minutes to show (server value plus local ticking). */
  waitMinutes: number;
  overTarget: boolean;
  busy?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onNotify?: () => void;
  onNoShow?: () => void;
  onPriority?: (priority: QueuePriority) => void;
}

/** One live-queue row; on narrow screens it reads as a card. */
export function QueueRow({
  entry,
  waitMinutes,
  overTarget,
  busy,
  onStart,
  onComplete,
  onNotify,
  onNoShow,
  onPriority,
}: QueueRowProps) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const open = entry.status === 'WAITING' || entry.status === 'CALLED';
  const active = open || entry.status === 'IN_CONSULTATION';

  const items: MenuItem[] = [];
  if (open && onNotify) {
    items.push({
      id: 'notify',
      label: t('queue.actions.notifyDelay'),
      onSelect: onNotify,
      icon: <BellRing size={14} aria-hidden="true" />,
    });
  }
  if (open && onNoShow) {
    items.push({
      id: 'noShow',
      label: t('queue.actions.noShow'),
      onSelect: onNoShow,
      tone: 'danger',
      icon: <CircleSlash size={14} aria-hidden="true" />,
    });
  }
  if (active && onPriority) {
    for (const p of QUEUE_PRIORITIES) {
      if (p === entry.priority) continue;
      items.push({
        id: `priority-${p}`,
        label: t('queue.actions.setPriority', { priority: t(`clinic.priority.${p}`) }),
        onSelect: () => onPriority(p),
        icon: <Flag size={14} aria-hidden="true" />,
      });
    }
  }

  return (
    <li
      data-over-target={overTarget || undefined}
      className={`flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border px-4 py-3 first:border-t-0 ${
        overTarget ? 'border-s-4 border-s-warning bg-warning/10' : ''
      } ${active ? '' : 'opacity-70'}`}
    >
      <span className="w-14 text-sm font-semibold text-text" dir="ltr">
        {entry.number}
      </span>
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <Avatar initials={entry.patient.initials} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{entry.patient.name}</p>
          <p className="truncate text-xs text-muted">{entry.doctor.name}</p>
        </div>
      </div>
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">{t('queue.columns.appointment')}</dt>
          <dd className="text-sm font-medium text-text">{fmt.time(entry.appointmentTime)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('queue.columns.checkedIn')}</dt>
          <dd className="text-sm font-medium text-text">{fmt.time(entry.checkedInAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('queue.columns.waiting')}</dt>
          <dd className={`text-sm font-medium ${overTarget ? 'text-error' : 'text-text'}`}>
            {t('clinic.minutes', { count: waitMinutes })}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {overTarget && (
          <span className={`${chip} bg-error/10 text-error`}>
            <AlertTriangle size={13} aria-hidden="true" />
            {t('queue.overTarget')}
          </span>
        )}
        <PriorityChip priority={entry.priority} />
        <QueueStatusChip status={entry.status} />
      </div>
      <div className="ms-auto flex items-center gap-2">
        {open && onStart && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onStart}>
            {t('queue.actions.start')}
          </Button>
        )}
        {entry.status === 'IN_CONSULTATION' && onComplete && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onComplete}>
            {t('queue.actions.complete')}
          </Button>
        )}
        {items.length > 0 && (
          <Dropdown
            label={t('queue.actions.more', { number: entry.number })}
            trigger={<MoreHorizontal size={16} aria-hidden="true" />}
            items={items}
          />
        )}
      </div>
    </li>
  );
}
