import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Check, CircleAlert, Loader2, Sparkles, X } from 'lucide-react';
import type { AssistantProposal } from '@riaya/shared';
import { Button } from '../../common/Button';
import type { ProposalState } from './useAssistantChat';

/** Whether Confirm must stay disabled until the user ticks "I have reviewed this content". */
export function needsReview(p: AssistantProposal): boolean {
  return p.warning === 'patient_supplied_content';
}

/** The exact payload as plain text lines (label, value) so the user sees what will be sent. */
export function payloadRows(
  p: AssistantProposal,
  fmt: (iso: string) => string,
  labels: Record<string, string>,
): { label: string; value: string; long?: boolean }[] {
  const rows: { label: string; value: string; long?: boolean }[] = [];
  const add = (label: string, value: string | undefined, long = false) => {
    if (value) rows.push({ label, value, long });
  };
  switch (p.action) {
    case 'book_appointment':
      add(labels.doctor!, p.params.doctorId);
      add(labels.when!, fmt(p.params.startsAt));
      add(labels.type!, p.params.type);
      add(labels.reason!, p.params.reason, true);
      break;
    case 'reschedule_appointment':
      add(labels.appointment!, p.params.appointmentId);
      add(labels.doctor!, p.params.doctorId);
      add(labels.when!, fmt(p.params.startsAt));
      break;
    case 'cancel_appointment':
      add(labels.appointment!, p.params.appointmentId);
      add(labels.reason!, p.params.reason, true);
      break;
    case 'check_in':
      add(labels.appointment!, p.params.appointmentId);
      break;
    case 'add_clinical_note':
      add(labels.note!, p.params.note, true);
      break;
    case 'save_summary':
      add(labels.clinicianContent!, p.params.content, true);
      add(labels.patientContent!, p.params.patientContent, true);
      break;
  }
  return rows;
}

/** A suggested data change. Nothing happens until the user confirms. */
export function ProposalCard({
  state,
  onConfirm,
  onDismiss,
  onSuggest,
}: {
  state: ProposalState;
  onConfirm: (options?: { publishToPatient?: boolean }) => void;
  onDismiss: () => void;
  /** Send a follow-up message (used for conflict alternatives). */
  onSuggest: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { proposal, status } = state;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const [reviewed, setReviewed] = useState(false);
  const [publish, setPublish] = useState(false);
  const mustReview = needsReview(proposal);
  const labels = Object.fromEntries(
    [
      'doctor',
      'when',
      'type',
      'reason',
      'appointment',
      'note',
      'clinicianContent',
      'patientContent',
    ].map((k) => [k, t(`assistant.payload.${k}`)]),
  );
  const rows = payloadRows(proposal, fmt, labels);
  const actionable = status === 'pending' || status === 'error' || status === 'conflict';

  return (
    <section
      aria-label={t('assistant.proposal.title')}
      className="mt-2 rounded-md border border-border-strong bg-surface p-3 text-sm text-text"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Sparkles size={14} aria-hidden="true" />
        {t('assistant.proposal.title')} · {t(`assistant.action.${proposal.action}`)}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words">{proposal.preview}</p>

      {mustReview && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-warning bg-warning/10 p-2 font-medium text-text"
        >
          <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          <span>{t('assistant.proposal.patientContentWarning')}</span>
        </p>
      )}

      {rows.length > 0 && (
        <dl className="mt-2 space-y-1.5 rounded-md border border-border bg-bg p-2 text-xs">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="font-medium text-muted">{row.label}</dt>
              <dd
                className={`whitespace-pre-wrap break-words text-text ${
                  row.long ? 'max-h-40 overflow-y-auto' : ''
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {actionable && mustReview && (
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>{t('assistant.proposal.reviewed')}</span>
        </label>
      )}
      {actionable && proposal.action === 'save_summary' && (
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>{t('assistant.proposal.publish')}</span>
        </label>
      )}

      {(status === 'pending' ||
        status === 'running' ||
        status === 'error' ||
        status === 'conflict') && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              onConfirm(
                proposal.action === 'save_summary' ? { publishToPatient: publish } : undefined,
              )
            }
            disabled={status === 'running' || (mustReview && !reviewed)}
            aria-busy={status === 'running' || undefined}
          >
            {status === 'running' ? (
              <Loader2 size={14} aria-hidden="true" className="motion-safe:animate-spin" />
            ) : null}
            {status === 'error' || status === 'conflict'
              ? t('assistant.proposal.retry')
              : t('assistant.proposal.confirm')}
          </Button>
          <Button size="sm" variant="secondary" onClick={onDismiss} disabled={status === 'running'}>
            {t('assistant.proposal.dismiss')}
          </Button>
        </div>
      )}

      <div role="status" aria-live="polite">
        {status === 'done' && (
          <p className="mt-2 flex items-center gap-1.5 font-medium text-success">
            <Check size={14} aria-hidden="true" />
            {t('assistant.proposal.done')}
          </p>
        )}
        {status === 'dismissed' && (
          <p className="mt-2 flex items-center gap-1.5 text-muted">
            <X size={14} aria-hidden="true" />
            {t('assistant.proposal.dismissed')}
          </p>
        )}
      </div>

      {status === 'conflict' && (
        <div role="alert" className="mt-2">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <CircleAlert size={14} aria-hidden="true" />
            {t('assistant.proposal.conflict')}
          </p>
          {state.alternatives && state.alternatives.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {state.alternatives.slice(0, 4).map((a) => (
                <li
                  key={`${a.startsAt}-${a.doctorName}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>
                    {fmt(a.startsAt)} · {a.doctorName}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onSuggest(
                        t('assistant.proposal.useAlternative', {
                          time: fmt(a.startsAt),
                          doctor: a.doctorName,
                        }),
                      )
                    }
                  >
                    {t('assistant.proposal.askThisTime')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-error">
          <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{state.message || t('assistant.proposal.failed')}</span>
        </p>
      )}
    </section>
  );
}
