import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatYmd } from './dates';
import type { CalBlock } from './model';
import { Avatar } from '../shared/Avatar';
import { StatusBadge, TypeLabel } from '../shared/StatusBadge';

/** Mobile day view: the day's appointments as an agenda list (no time grid at 375 px). */
export function AgendaList({
  days,
  byDay,
  today,
  locale,
}: {
  days: string[];
  byDay: Map<string, CalBlock[]>;
  today: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const withItems = days.filter((ymd) => (byDay.get(ymd)?.length ?? 0) > 0);

  if (withItems.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
        {t('calendar.emptyDay')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {withItems.map((ymd) => (
        <section
          key={ymd}
          aria-label={formatYmd(ymd, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        >
          <h3
            className={`mb-2 text-sm font-semibold ${ymd === today ? 'text-primary' : 'text-text'}`}
          >
            {formatYmd(ymd, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <ul className="space-y-2">
            {byDay.get(ymd)!.map((block) => (
              <li key={block.item.id}>
                <Link
                  to={`/appointments/${block.item.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
                >
                  <span dir="ltr" className="w-12 shrink-0 text-sm font-semibold text-primary">
                    {block.label}
                  </span>
                  <Avatar initials={block.item.patient.initials} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">
                      {block.item.patient.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      <TypeLabel type={block.item.type} /> · {block.item.doctor.name}
                    </span>
                  </span>
                  <StatusBadge status={block.item.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
