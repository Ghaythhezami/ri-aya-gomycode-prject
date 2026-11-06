import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { Avatar } from '../shared/Avatar';
import { Button } from '../../common/Button';
import { blockAccent, formatMinute, type RenderBlock, type RenderRow } from './gridMath';
import type { FocusTarget } from './focusTarget';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

/** Below `md`: appointments grouped by doctor, with the same "Move to…" action as the grid. */
export function MobileScheduleList({
  rows,
  highlight,
  onOpenMove,
}: {
  rows: RenderRow[];
  highlight: FocusTarget | null;
  onOpenMove: (block: RenderBlock) => void;
}) {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  return (
    <div className="space-y-4 p-4">
      {rows.map((row) => (
        <section
          key={row.doctor.id}
          aria-label={row.doctor.name}
          data-row={row.doctor.id}
          tabIndex={-1}
          className={
            highlight?.kind === 'doctor' && highlight.id === row.doctor.id
              ? 'rounded-md ring-2 ring-primary'
              : ''
          }
        >
          <div className="mb-2 flex items-center gap-3">
            <Avatar initials={row.doctor.initials} />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-text">{row.doctor.name}</h3>
              <p className="truncate text-xs text-muted">{specialtyLabel(row.doctor.specialty)}</p>
            </div>
          </div>
          {row.blocks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted">
              {t('scheduling.noAppointments')}
            </p>
          ) : (
            <ul className="space-y-2">
              {row.blocks.map((block) => (
                <li
                  key={block.appointmentId}
                  style={{
                    borderInlineStartColor: blockAccent(block),
                    backgroundColor: `color-mix(in srgb, ${blockAccent(block)} 12%, var(--color-surface))`,
                  }}
                  data-appt={block.appointmentId}
                  tabIndex={-1}
                  className={`flex items-center justify-between gap-2 rounded-md border border-s-[3px] border-border px-3 py-2 ${
                    block.pending ? 'border-2 border-dashed border-primary' : ''
                  } ${
                    highlight?.kind === 'appointment' && highlight.id === block.appointmentId
                      ? 'ring-2 ring-primary'
                      : ''
                  }`}
                >
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold text-text">{block.patientName}</p>
                    <p className="text-xs">
                      <span dir="ltr">
                        {formatMinute(block.startMinute)}–
                        {formatMinute(block.startMinute + block.durationMinutes)}
                      </span>{' '}
                      · {block.typeName || t(`clinic.type.${block.type}`)}
                    </p>
                    {block.conflict && (
                      <p className="flex items-center gap-1 text-xs font-semibold text-error">
                        <AlertTriangle size={12} aria-hidden="true" />
                        {t('scheduling.conflict')}
                      </p>
                    )}
                    {block.pending && (
                      <p className="text-xs font-semibold text-primary">
                        {t('scheduling.unsavedBadge')}
                      </p>
                    )}
                  </div>
                  {block.movable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenMove(block)}
                      aria-label={t('scheduling.moveToFor', { name: block.patientName })}
                    >
                      <ArrowRightLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
                      {t('scheduling.moveTo')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
