import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import type { PatientSummaryDto, SummaryDraft } from '@riaya/shared';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Field, Textarea } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import {
  useDraftSummaryMutation,
  usePatientSummariesQuery,
  useSaveSummaryMutation,
  useUpdateSummaryMutation,
} from './api';

type Source = PatientSummaryDto['sources'][number];

function SourceLink({ s }: { s: Source }) {
  const { t } = useTranslation();
  const label = `${t(`documents.summary.source.${s.kind}`)}: ${s.label}`;
  if (s.kind === 'appointment') {
    return (
      <Link to={`/appointments/${s.id}`} className="text-primary underline">
        {label}
      </Link>
    );
  }
  return <span>{label}</span>;
}

function Sources({ sources }: { sources: Source[] }) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-muted">{t('documents.summary.sources')}</h4>
      <ul className="ms-5 list-disc space-y-1 text-sm">
        {sources.map((s) => (
          <li key={`${s.kind}-${s.id}`}>
            <SourceLink s={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useClinicFormat();
  const { data, isLoading, isError, refetch } = usePatientSummariesQuery(patientId);
  const [generate, { isLoading: generating }] = useDraftSummaryMutation();
  const [save, { isLoading: saving }] = useSaveSummaryMutation();
  const [update, { isLoading: updating }] = useUpdateSummaryMutation();
  const [draft, setDraft] = useState<SummaryDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const fail = (raw: unknown) => {
    const e = asClinicError(raw);
    toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
  };

  const makeDraft = async () => {
    setDraftError(null);
    try {
      setDraft(await generate(patientId).unwrap());
    } catch (raw) {
      const e = asClinicError(raw);
      setDraftError(
        e?.code === 'AI_UNAVAILABLE'
          ? t('documents.summary.unavailable')
          : t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }),
      );
    }
  };

  const saveDraft = async (publish: boolean) => {
    if (!draft) return;
    try {
      await save({
        patientId,
        body: {
          content: draft.content,
          patientContent: draft.patientContent,
          visibleToPatient: publish,
          sources: draft.sources,
        },
      }).unwrap();
      toast.success(t(publish ? 'documents.summary.published' : 'documents.summary.saved'));
      setDraft(null);
      setConfirmPublish(false);
    } catch (raw) {
      setConfirmPublish(false);
      fail(raw);
    }
  };

  const setVisible = async (s: PatientSummaryDto, visibleToPatient: boolean) => {
    try {
      await update({ patientId, summaryId: s.id, body: { visibleToPatient } }).unwrap();
      toast.success(
        t(visibleToPatient ? 'documents.summary.published' : 'documents.summary.unpublished'),
      );
    } catch (raw) {
      fail(raw);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('documents.summary.intro')}</p>
        <Button
          onClick={() => void makeDraft()}
          disabled={generating}
          aria-busy={generating || undefined}
        >
          <Sparkles size={16} aria-hidden="true" />
          {generating ? t('documents.summary.generating') : t('documents.summary.generate')}
        </Button>
      </div>

      {draftError && (
        <p role="alert" className="text-sm text-error">
          {draftError}
        </p>
      )}

      {draft && (
        <section
          aria-label={t('documents.summary.draftTitle')}
          className="space-y-4 rounded-lg border border-border-strong bg-bg p-4"
        >
          <h3 className="text-base font-semibold text-text">{t('documents.summary.draftTitle')}</h3>
          <p className="text-xs text-muted">{t('documents.summary.aiNote')}</p>
          <Field label={t('documents.summary.clinicianVersion')}>
            <Textarea
              rows={8}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          </Field>
          <Field
            label={t('documents.summary.patientVersion')}
            help={t('documents.summary.patientHelp')}
          >
            <Textarea
              rows={6}
              value={draft.patientContent}
              onChange={(e) => setDraft({ ...draft, patientContent: e.target.value })}
            />
          </Field>
          <Sources sources={draft.sources} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={saving || !draft.content.trim()}
              onClick={() => void saveDraft(false)}
            >
              {t('documents.summary.save')}
            </Button>
            <Button
              disabled={saving || !draft.content.trim() || !draft.patientContent.trim()}
              onClick={() => setConfirmPublish(true)}
            >
              {t('documents.summary.savePublish')}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              {t('documents.summary.discard')}
            </Button>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title={t('documents.error.title')}
          action={<Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={t('documents.summary.empty.title')}
          description={t('documents.summary.empty.body')}
        />
      ) : (
        <ul className="space-y-3">
          {data.map((s) => (
            <li key={s.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  {s.authorName} · {fmt.dateTime(s.createdAt)}
                </p>
                {s.visibleToPatient ? (
                  <Badge tone="success">
                    {s.publishedAt
                      ? t('documents.summary.publishedOn', { date: fmt.date(s.publishedAt) })
                      : t('documents.summary.publishedBadge')}
                  </Badge>
                ) : (
                  <Badge tone="neutral">{t('documents.summary.private')}</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-text" dir="auto">
                {s.content}
              </p>
              {s.patientContent && (
                <details className="text-sm">
                  <summary className="min-h-10 cursor-pointer font-medium text-text">
                    {t('documents.summary.patientVersion')}
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-muted" dir="auto">
                    {s.patientContent}
                  </p>
                </details>
              )}
              <Sources sources={s.sources} />
              <Button
                size="sm"
                variant="secondary"
                disabled={updating || (!s.visibleToPatient && !s.patientContent)}
                onClick={() => void setVisible(s, !s.visibleToPatient)}
              >
                {s.visibleToPatient
                  ? t('documents.summary.unpublish')
                  : t('documents.summary.publish')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmPublish}
        title={t('documents.summary.publishTitle')}
        confirmLabel={t('documents.summary.savePublish')}
        cancelLabel={t('clinic.cancel')}
        loading={saving}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => void saveDraft(true)}
      >
        {t('documents.summary.publishBody')}
      </ConfirmDialog>
    </div>
  );
}
