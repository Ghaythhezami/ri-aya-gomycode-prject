import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Undo2,
  UserX,
} from 'lucide-react';
import type { OptimizationProposal, SchedulingDay } from '@riaya/shared';
import { Button } from '../../common/Button';
import { useClinicFormat } from '../shared/format';
import type { InsightsPhase } from './insightsState';
import { waitImprovement } from './insightsState';
import { secondsRemaining, type PendingMove } from './gridMath';

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
  day,
  pending,
  idleDoctors,
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
  day: SchedulingDay;
  pending: PendingMove[];
  idleDoctors: IdleDoctor[];
  preview: boolean;
  applying: boolean;
  undoing: boolean;
  optimizing: boolean;
  onPreview: () => void;
  onApply: () => void;
  onUndo: () => void;
  onRegenerate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useClinicFormat();
  const reasonText = (key: string) =>
    i18n.exists(`scheduling.reason.${reasonTail(key)}`)
      ? t(`scheduling.reason.${reasonTail(key)}`)
      : '';
  const now = useNow(phase === 'success');
  const doctorName = (id: string) => day.doctors.find((d) => d.id === id)?.name ?? '';
  const seconds = secondsRemaining(proposal?.undoUntil ?? null, now);
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const idleList = idleDoctors.length > 0 && (
    <div className="mt-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {t('scheduling.insights.idleDoctors')}
      </h3>
      <ul>
        {idleDoctors.map((d) => (
          <Row key={d.doctorId} icon={<Clock3 size={16} />} title={d.name}>
            {t('scheduling.insights.freeMinutes', { count: d.freeMinutes })}
          </Row>
        ))}
      </ul>
    </div>
  );

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
          body={t('scheduling.insights.noImprovementBody')}
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
          <Notice
            tone={phase === 'conflicts' ? 'warning' : 'neutral'}
            icon={<Sparkles size={16} />}
            title={t('scheduling.insights.awaitingTitle')}
          >
            <div className="mt-2 rounded-md bg-accent p-4">
              <p className="text-xs text-primary-dark">{t('scheduling.insights.potential')}</p>
              <p className="text-3xl font-semibold text-primary" aria-live="polite">
                {waitImprovement(proposal) > 0 ? '−' : ''}
                {t('clinic.minutes', { count: Math.abs(waitImprovement(proposal)) })}
              </p>
              <p className="text-xs text-primary-dark">{t('scheduling.insights.avgWaiting')}</p>
            </div>
          </Notice>
          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('scheduling.insights.suggestedMoves', { count: proposal.moves.length })}
          </h3>
          <ul>
            {proposal.moves.map((m) => (
              <Row
                key={m.appointmentId}
                icon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
                title={t('scheduling.insights.moveTitle', { name: m.patientName })}
              >
                {t('scheduling.insights.moveLine', {
                  from: fmt.time(m.fromStartsAt),
                  to: fmt.time(m.toStartsAt),
                  doctor: doctorName(m.toDoctorId),
                })}
                {reasonText(m.reasonKey) ? ` · ${reasonText(m.reasonKey)}` : ''}
              </Row>
            ))}
          </ul>
          {unresolvedList}
          {idleList}
        </>
      );
      break;
    default:
      body = (
        <>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('scheduling.insights.tipsTitle')}
          </h3>
          <ul>
            {(['tipGaps', 'tipBalance', 'tipEmergency'] as const).map((key) => (
              <Row
                key={key}
                icon={<Lightbulb size={16} />}
                title={t(`scheduling.insights.${key}`)}
              />
            ))}
          </ul>
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
          <div className="mt-4 space-y-2">
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
        <p className="mt-4 text-center text-xs text-muted">{t('scheduling.footerNote')}</p>
      </div>
    </aside>
  );
}
