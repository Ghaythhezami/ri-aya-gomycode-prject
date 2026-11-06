import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FilePlus2, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import type { AuditDto } from '@riaya/shared';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { Input, Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { asClinicError } from '../../store/clinicApi';
import { useChatStaffQuery } from '../chat/api';
import { useClinicFormat } from '../shared/format';
import { mergeById } from '../notifications/templates';
import { useAuditLogQuery, useLazyAuditLogQuery, type AuditArgs } from './api';
import { jsonDiff, showValue } from './auditDiff';

const ACTION_STYLE: Record<AuditDto['action'], { Icon: LucideIcon; className: string }> = {
  create: { Icon: FilePlus2, className: 'bg-success/10 text-success' },
  update: { Icon: Pencil, className: 'bg-info/10 text-info' },
  delete: { Icon: Trash2, className: 'bg-error/10 text-error' },
};

function DiffTable({ entry }: { entry: AuditDto }) {
  const { t } = useTranslation();
  const rows = useMemo(() => jsonDiff(entry.before, entry.after), [entry.before, entry.after]);
  if (rows.length === 0)
    return <p className="text-sm text-muted">{t('settings.audit.noChanges')}</p>;
  return (
    <div
      className="overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={t('settings.audit.changes')}
    >
      <table className="w-full min-w-120 text-start text-xs">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">
              {t('settings.audit.field')}
            </th>
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">
              {t('settings.audit.before')}
            </th>
            <th scope="col" className="py-1.5 text-start font-medium">
              {t('settings.audit.after')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path} className="border-t border-border align-top">
              <th scope="row" className="py-1.5 pe-3 text-start font-medium text-text" dir="ltr">
                {r.path}
              </th>
              <td className="py-1.5 pe-3">
                <pre
                  className="whitespace-pre-wrap break-all rounded-sm bg-error/10 p-1.5 font-mono text-error"
                  dir="ltr"
                >
                  {showValue(r.before) || '—'}
                </pre>
              </td>
              <td className="py-1.5">
                <pre
                  className="whitespace-pre-wrap break-all rounded-sm bg-success/10 p-1.5 font-mono text-success"
                  dir="ltr"
                >
                  {showValue(r.after) || '—'}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Entry({ entry }: { entry: AuditDto }) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const [open, setOpen] = useState(false);
  const { Icon, className } = ACTION_STYLE[entry.action];
  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
        <span
          className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${className}`}
        >
          <Icon size={13} aria-hidden="true" />
          {t(`settings.audit.actions.${entry.action}`)}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium text-text">{entry.entity}</span>{' '}
          <span className="text-muted" dir="ltr">
            {entry.entityId.slice(0, 8)}
          </span>
        </span>
        <span className="text-sm text-muted">
          {entry.actor?.name ?? t('settings.audit.system')}
        </span>
        <time dateTime={entry.createdAt} className="text-xs text-muted" dir="ltr">
          {fmt.dateTime(entry.createdAt)}
        </time>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent"
        >
          {open ? t('settings.audit.hide') : t('settings.audit.details')}
          <ChevronDown size={14} aria-hidden="true" className={open ? 'rotate-180' : ''} />
        </button>
      </div>
      {open && (
        <div className="bg-bg px-5 py-3">
          <DiffTable entry={entry} />
        </div>
      )}
    </li>
  );
}

/** Read-only audit trail with filters, cursor pagination and before/after diffs. */
export function AuditSection() {
  const { t } = useTranslation();
  const staff = useChatStaffQuery();
  const [entity, setEntity] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [extra, setExtra] = useState<{ items: AuditDto[]; next: string | null } | null>(null);

  const filters: AuditArgs = useMemo(
    () => ({
      ...(entity.trim() ? { entity: entity.trim() } : {}),
      ...(actorId ? { actorId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [entity, actorId, from, to],
  );
  const filterKey = JSON.stringify(filters);
  const invalidRange = Boolean(from && to && from > to);
  const first = useAuditLogQuery({ ...filters, limit: 25 }, { skip: invalidRange });
  const [loadMore, loadMoreState] = useLazyAuditLogQuery();

  useEffect(() => {
    setExtra(null);
  }, [filterKey]);

  const items = mergeById(first.data?.items ?? [], extra?.items ?? []);
  const cursor = extra ? extra.next : (first.data?.nextCursor ?? null);
  const filtered = Object.keys(filters).length > 0;

  const onLoadMore = async () => {
    if (!cursor) return;
    const page = await loadMore({ ...filters, cursor, limit: 25 }).unwrap();
    setExtra((c) => ({ items: mergeById(c?.items ?? [], page.items), next: page.nextCursor }));
  };

  const reset = () => {
    setEntity('');
    setActorId('');
    setFrom('');
    setTo('');
  };

  return (
    <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-base font-semibold text-text">{t('settings.audit.title')}</h2>
        <p className="mt-0.5 text-sm text-muted">{t('settings.audit.subtitle')}</p>
      </div>
      <div className="grid gap-4 border-b border-border px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="audit-entity" className="mb-1.5 block text-sm font-medium text-text">
            {t('settings.audit.entity')}
          </label>
          <Input
            id="audit-entity"
            value={entity}
            placeholder={t('settings.audit.entityPlaceholder')}
            onChange={(e) => setEntity(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="audit-actor" className="mb-1.5 block text-sm font-medium text-text">
            {t('settings.audit.actor')}
          </label>
          <Select id="audit-actor" value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">{t('settings.audit.anyone')}</option>
            {(staff.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <DatePicker
          label={t('settings.audit.from')}
          value={from}
          max={to || undefined}
          onChange={setFrom}
        />
        <DatePicker
          label={t('settings.audit.to')}
          value={to}
          min={from || undefined}
          onChange={setTo}
        />
      </div>

      {invalidRange && (
        <p role="alert" className="px-6 py-3 text-sm text-error">
          {t('settings.audit.invalidRange')}
        </p>
      )}
      {first.isLoading && (
        <div className="space-y-2 p-5" aria-busy="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}
      {first.isError && !first.data && (
        <div className="p-5">
          <ErrorState
            title={t('settings.audit.loadError')}
            description={asClinicError(first.error)?.message}
            action={
              <Button variant="secondary" onClick={() => void first.refetch()}>
                {t('clinic.retry')}
              </Button>
            }
          />
        </div>
      )}
      {first.data && items.length === 0 && (
        <div className="p-5">
          <EmptyState
            title={filtered ? t('settings.audit.noResults') : t('settings.audit.empty')}
            description={
              filtered ? t('settings.audit.noResultsBody') : t('settings.audit.emptyBody')
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={reset}>
                  {t('settings.audit.reset')}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {items.length > 0 && (
        <ul>
          {items.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {cursor && items.length > 0 && (
        <div className="border-t border-border p-4 text-center">
          <Button
            variant="secondary"
            onClick={() => void onLoadMore()}
            disabled={loadMoreState.isFetching}
          >
            {loadMoreState.isFetching ? t('clinic.loading') : t('notifications.loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}
