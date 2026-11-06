import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CalendarClock,
  ChevronRight,
  ArrowLeftRight,
  RefreshCw,
  Sparkles,
  Undo2,
  UserX,
} from 'lucide-react';
import type { OptimizationObjective, OptimizationProposal, SchedulingDay } from '@riaya/shared';
import { Button } from '../../common/Button';
import { useClinicFormat } from '../shared/format';
import type { InsightsPhase } from './insightsState';
import { waitImprovement } from './insightsState';
import { formatMinute, secondsRemaining, type PendingMove } from './gridMath';
import { buildRecommendations, type Recommendation } from './recommendations';
import type { FocusTarget } from './focusTarget';

export interface IdleDoctor {
  doctorId: string;
  name: string;
  freeMinutes: number;
}

/** Last segment of an i18n key such as `scheduling.invalid.overlap`. */
export function reasonTail(key: string | undefined): string {
  if (!key) return 'unknown';
  return key.split('.').pop() || 'unknown';
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function Row({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary"
      >
        {icon}
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-text">{title}</p>
        {children && <p className="text-xs text-muted">{children}</p>}
      </div>
    </li>
  );
}

const REC_TONE = {
  move: 'bg-accent text-primary',
  gap: 'bg-info/10 text-info',
  balance: 'bg-warning/10 text-warning',
} as const;

function RecRow({
  rec,
  title,
  detail,
  onSelect,
}: {
  rec: Recommendation;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  const Icon =
    rec.kind === 'move' ? ArrowRight : rec.kind === 'gap' ? CalendarClock : ArrowLeftRight;
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-12 w-full items-center gap-3 rounded-md py-3 text-start transition-colors hover:bg-bg"
      >
        <span
          aria-hidden="true"
          className={`grid size-9 shrink-0 place-items-center rounded-full ${REC_TONE[rec.kind]}`}
        >
          <Icon size={16} className={rec.kind === 'gap' ? '' : 'rtl:-scale-x-100'} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold text-text">{title}</span>
          <span className="block text-xs text-muted">{detail}</span>
        </span>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="shrink-0 text-muted rtl:-scale-x-100"
        />
      </button>
    </li>
  );
}

function Notice({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning' | 'error';
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const tones = {
    neutral: 'bg-bg text-text',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  };
  return (
    <div role="status" className={`rounded-lg p-4 ${tones[tone]}`}>
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true">{icon}</span>
        {title}
      </p>
      {body && <p className="mt-1 text-sm text-text">{body}</p>}
      {children}
    </div>
  );
}

export function InsightsPanel({
  phase,
  proposal,
  objective,
  day,
  pending,
  idleDoctors,
  slot,
  savingsMinutes,
  onFocus,
  preview,
  applying,
  undoing,
  optimizing,
  onPreview,
  onApply,
  onUndo,
  onRegenerate,
}: {
  phase: InsightsPhase;
  proposal: OptimizationProposal | null;
  objective?: OptimizationObjective;
  day: SchedulingDay;
  pending: PendingMove[];
  idleDoctors: IdleDoctor[];
  slot: number;
  /** Dashboard estimate of minutes saved, shown before a proposal exists. */
  savingsMinutes: number | null;
  onFocus: (target: FocusTarget) => void;
  preview: boolean;
  applying: boolean;
  undoing: boolean;
  optimizing: boolean;
  onPreview: () => void;
  onApply: () => void;
  onUndo: () => void;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const now = useNow(phase === 'success');
  const doctorName = (id: string) => day.doctors.find((d) => d.id === id)?.name ?? '';
  const seconds = secondsRemaining(proposal?.undoUntil ?? null, now);
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const recs = buildRecommendations(proposal, day, idleDoctors, slot);
  const [expanded, setExpanded] = useState(false);
  const moveRecs = recs.filter((r) => r.kind === 'move');
  const otherRecs = recs.filter((r) => r.kind !== 'move');
  const shownMoves = expanded ? moveRecs : moveRecs.slice(0, 3);
  const hiddenMoves = moveRecs.length - shownMoves.length;
  const recCopy = (rec: Recommendation): { title: string; detail: string; target: FocusTarget } => {
    if (rec.kind === 'move') {
      return {
        title: t('scheduling.insights.moveTitle', { name: rec.patientName }),
        detail: t('scheduling.insights.moveLine', {
          from: fmt.time(rec.from),
          to: fmt.time(rec.to),
          doctor: doctorName(rec.toDoctorId),
        }),
        target: { kind: 'appointment', id: rec.appointmentId },
      };
    }
    if (rec.kind === 'gap') {
      return {
        title: t('scheduling.insights.gapTitle'),
        detail: t('scheduling.insights.gapLine', {
          name: rec.name,
          count: rec.minutes,
          time: formatMinute(rec.startMinute),
        }),
        target: { kind: 'doctor', id: rec.doctorId },
      };
    }
    return {
      title: t('scheduling.insights.balanceTitle'),
      detail: t('scheduling.insights.balanceLine', {
        name: rec.patientName,
        doctor: doctorName(rec.toDoctorId),
      }),
      target: { kind: 'appointment', id: rec.appointmentId },
    };
  };
  const recList = (list: Recommendation[]) =>
    list.map((rec) => {
      const copy = recCopy(rec);
      return (
        <RecRow
          key={rec.key}
          rec={rec}
          title={copy.title}
          detail={copy.detail}
          onSelect={() => onFocus(copy.target)}
        />
      );
    });
  const idleList = otherRecs.length > 0 && <ul className="mt-2">{recList(otherRecs)}</ul>;

  const unresolvedList = proposal && proposal.unresolved.length > 0 && (
    <div className="mt-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {t('scheduling.insights.unresolved')}
      </h3>
      <ul>
        {proposal.unresolved.map((u) => (
          <Row key={u.appointmentId} icon={<UserX size={16} />} title={u.code}>
            {t(`scheduling.invalid.${reasonTail(u.reasonKey)}`, {
              defaultValue: t('scheduling.invalid.unknown'),
            })}
          </Row>
        ))}
      </ul>
    </div>
  );

  const improvement = proposal ? waitImprovement(proposal) : savingsMinutes;
  const potential = (
    <div className="rounded-lg bg-accent p-4">
      <p className="text-xs font-medium text-primary-dark">{t('scheduling.insights.potential')}</p>
      {improvement !== null && improvement > 0 ? (
        <>
          <p className="mt-1 text-3xl font-semibold text-primary" aria-live="polite">
            −{t('clinic.minutes', { count: improvement })}
          </p>
          <p className="text-xs text-primary-dark">{t('scheduling.insights.avgWaiting')}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-text">{t('scheduling.insights.invite')}</p>
      )}
      {proposal?.engine && (
        <p className="mt-2 text-[11px] text-muted">
          {t('scheduling.insights.engine', {
            engine: t(`scheduling.insights.engines.${proposal.engine}`),
          })}
        </p>
      )}
    </div>
  );

  let body: ReactNode;
  switch (phase) {
    case 'unsaved':
      body = (
        <>
          <Notice
            tone="warning"
            icon={<AlertTriangle size={16} />}
            title={t('scheduling.insights.unsavedTitle')}
            body={t('scheduling.insights.unsavedBody', { count: pending.length })}
          />
          <ul className="mt-3">
            {pending.map((p) => (
              <Row
                key={p.appointmentId}
                icon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
                title={p.patientName}
              >
                {t('scheduling.insights.moveLine', {
                  from: fmt.time(p.fromStartsAt),
                  to: fmt.time(p.toStartsAt),
                  doctor: doctorName(p.toDoctorId),
                })}
              </Row>
            ))}
          </ul>
          {idleList}
        </>
      );
      break;
    case 'stale':
      body = (
        <Notice
          tone="warning"
          icon={<RefreshCw size={16} />}
          title={t('scheduling.insights.staleTitle')}
          body={t('scheduling.insights.staleBody')}
        >
          <Button className="mt-3" onClick={onRegenerate} disabled={optimizing}>
            <RefreshCw size={16} aria-hidden="true" />
            {t('scheduling.insights.regenerate')}
          </Button>
        </Notice>
      );
      break;
    case 'success':
      body = (
        <>
          <Notice
            tone="success"
            icon={<CheckCircle2 size={16} />}
            title={t('scheduling.insights.successTitle')}
            body={t('scheduling.insights.successBody', { count: proposal?.moves.length ?? 0 })}
          >
            {seconds > 0 ? (
              <Button className="mt-3" variant="secondary" onClick={onUndo} disabled={undoing}>
                <Undo2 size={16} aria-hidden="true" />
                {t('scheduling.insights.undo')}{' '}
                <span dir="ltr" aria-live="off">
                  ({mm})
                </span>
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted">{t('scheduling.insights.undoExpired')}</p>
            )}
          </Notice>
        </>
      );
      break;
    case 'noImprovement':
      body = (
        <Notice
          tone="neutral"
          icon={<CheckCircle2 size={16} />}
          title={t('scheduling.insights.noImprovementTitle')}
          body={t(
            objective === 'MAX_UTILISATION'
              ? 'scheduling.insights.noImprovementUtilisationBody'
              : 'scheduling.insights.noImprovementBody',
          )}
        />
      );
      break;
    case 'noAlternatives':
      body = (
        <>
          <Notice
            tone="error"
            icon={<AlertTriangle size={16} />}
            title={t('scheduling.insights.noAlternativesTitle')}
            body={t('scheduling.insights.noAlternativesBody')}
          />
          {unresolvedList}
          {idleList}
        </>
      );
      break;
    case 'awaiting':
    case 'conflicts':
      body = proposal && (
        <>
          {potential}
          <ul className="mt-3">{recList(shownMoves)}</ul>
          {(hiddenMoves > 0 || expanded) && moveRecs.length > 3 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 min-h-10 rounded-md px-1 text-sm font-medium text-primary hover:underline"
            >
              {expanded
                ? t('scheduling.insights.showLess')
                : t('scheduling.insights.more', { count: hiddenMoves })}
            </button>
          )}
          {idleList}
          {unresolvedList}
        </>
      );
      break;
    default:
      body = (
        <>
          {potential}
          {idleList}
        </>
      );
  }

  const canApply = phase === 'awaiting' || phase === 'conflicts';

  return (
    <aside
      aria-label={t('scheduling.insights.title')}
      className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-text">{t('scheduling.insights.title')}</h2>
        <Sparkles size={16} aria-hidden="true" className="text-primary" />
      </div>
      <div className="p-5">
        {body}
        {canApply && (
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 space-y-2 border-t border-border bg-surface p-4 md:static md:m-0 md:border-0 md:bg-transparent md:p-0 md:pt-4">
            <Button
              variant="secondary"
              className="w-full"
              aria-pressed={preview}
              onClick={onPreview}
            >
              {preview ? t('scheduling.insights.hidePreview') : t('scheduling.insights.preview')}
            </Button>
            <Button className="w-full" onClick={onApply} disabled={applying}>
              {t('scheduling.insights.apply')}
            </Button>
          </div>
        )}
        <p className="mt-4 text-center text-[11px] text-muted">{t('scheduling.footerNote')}</p>
      </div>
    </aside>
  );
}
