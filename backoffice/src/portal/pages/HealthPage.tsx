import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { FileText, Upload } from 'lucide-react';
import type { PatientDocumentDto } from '@riaya/shared';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { portalApi, useDocumentsQuery, useSummaryQuery } from '../api';
import { Card, Notice, PageTitle } from '../components/ui';
import { RichText } from '../components/RichText';
import { formatBytes, validateUpload, type UploadProblem } from '../lib/documents';
import { usePortalMe } from '../PortalAuthContext';
import { portalErrorCode, portalErrorMessage, portalHttp } from '../lib/session';
import { usePortalFormat } from '../lib/useFormat';

const DOC_TONE = {
  PENDING: 'neutral',
  PROCESSING: 'info',
  READY: 'success',
  FAILED: 'error',
} as const;

export function PortalHealthPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title={t('portal.health.title')} />
      <Notice tone="info">{t('portal.health.disclaimer')}</Notice>
      <SummarySection />
      <DocumentsSection />
    </div>
  );
}

function SummarySection() {
  const { t } = useTranslation();
  const format = usePortalFormat();
  const { data, isLoading, isError, error, refetch } = useSummaryQuery();
  // "No summary yet" may come back as 404 or null; both are the empty state.
  const none = !data || (isError && (error as { status?: number }).status === 404);

  return (
    <Card aria-labelledby="summary-title">
      <h2 id="summary-title" className="mb-3 text-lg font-semibold text-text">
        {t('portal.health.summaryTitle')}
      </h2>
      {isLoading ? (
        <Skeleton lines={4} />
      ) : isError && !none ? (
        <ErrorState
          title={t('portal.health.summaryError')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('portal.common.retry')}
            </Button>
          }
        />
      ) : none || !data ? (
        <EmptyState
          title={t('portal.health.summaryEmpty')}
          description={t('portal.health.summaryEmptyHint')}
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {t('portal.health.publishedBy', {
              author: data.authorName,
              date: format.date(data.publishedAt),
            })}
          </p>
          <RichText text={data.content} />
        </>
      )}
    </Card>
  );
}

function DocumentsSection() {
  const { t } = useTranslation();
  const format = usePortalFormat();
  const dispatch = useDispatch();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const me = usePortalMe();
  const locked = !me.verified;

  const [pollMs, setPollMs] = useState(0);
  // Processing finishes server-side; poll while any document is still pending.
  const documents = useDocumentsQuery(undefined, { pollingInterval: pollMs });
  const pending = (documents.data ?? []).some(
    (d) => d.status === 'PENDING' || d.status === 'PROCESSING',
  );
  useEffect(() => setPollMs(pending ? 6000 : 0), [pending]);

  async function upload(file: File) {
    setDone(false);
    const invalid: UploadProblem | null = validateUpload(file);
    if (invalid) {
      setProblem(t(`portal.documents.problem.${invalid}`));
      return;
    }
    setProblem(null);
    setFileName(file.name);
    setProgress(0);
    const form = new FormData();
    form.append('file', file);
    try {
      await portalHttp.post('/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      dispatch(portalApi.util.invalidateTags(['Documents']));
      setDone(true);
    } catch (e) {
      const code = portalErrorCode(e);
      setProblem(
        code === 'QUOTA_EXCEEDED'
          ? t('portal.documents.quota')
          : code === 'VERIFICATION_REQUIRED'
            ? t('portal.documents.locked')
            : portalErrorMessage(e, t('portal.documents.uploadFailed')),
      );
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <Card aria-labelledby="docs-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="docs-title" className="text-lg font-semibold text-text">
          {t('portal.documents.title')}
        </h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={progress !== null || locked}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} aria-hidden />
          {t('portal.documents.upload')}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          disabled={locked}
          tabIndex={-1}
          aria-label={t('portal.documents.upload')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      <p className="mb-3 text-xs text-muted">
        {locked ? t('portal.documents.locked') : t('portal.documents.hint')}
      </p>

      {progress !== null ? (
        <div className="mb-3" role="status" aria-live="polite">
          <p className="mb-1 text-sm text-text">
            {t('portal.documents.uploading', { name: fileName, percent: progress })}
          </p>
          <progress
            className="h-2 w-full accent-primary"
            max={100}
            value={progress}
            aria-label={t('portal.documents.progress')}
          />
        </div>
      ) : null}
      {problem ? (
        <div className="mb-3">
          <Notice tone="error">{problem}</Notice>
        </div>
      ) : null}
      {done && progress === null && !problem ? (
        <div className="mb-3">
          <Notice tone="success">{t('portal.documents.uploaded')}</Notice>
        </div>
      ) : null}

      {documents.isLoading ? (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : documents.isError ? (
        <ErrorState
          title={t('portal.documents.loadError')}
          action={
            <Button variant="secondary" onClick={() => void documents.refetch()}>
              {t('portal.common.retry')}
            </Button>
          }
        />
      ) : (documents.data ?? []).length === 0 ? (
        <EmptyState
          title={t('portal.documents.empty')}
          description={t('portal.documents.emptyHint')}
          icon={<FileText size={18} aria-hidden />}
        />
      ) : (
        <ul className="space-y-3">
          {(documents.data ?? []).map((doc) => (
            <DocumentRow key={doc.id} doc={doc} date={format.date(doc.createdAt)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function DocumentRow({ doc, date }: { doc: PatientDocumentDto; date: string }) {
  const { t } = useTranslation();
  const summary = doc.extraction?.patientSummary || doc.summary;
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start gap-3">
        <FileText size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {doc.extraction?.title || doc.fileName}
          </p>
          <p className="text-xs text-muted">
            {doc.category ? `${t(`portal.documents.categories.${doc.category}`)} · ` : ''}
            {date} · {formatBytes(doc.sizeBytes)}
            {doc.uploadedBy === 'STAFF' ? ` · ${t('portal.documents.fromClinic')}` : ''}
          </p>
        </div>
        <Badge tone={DOC_TONE[doc.status]}>{t(`portal.documents.status.${doc.status}`)}</Badge>
      </div>
      {doc.status === 'READY' && summary ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('portal.documents.summaryLabel')}
          </p>
          <RichText text={summary} />
          <p className="mt-2 text-xs text-muted">
            {doc.reviewedAt ? t('portal.documents.reviewed') : t('portal.documents.notReviewed')}
          </p>
        </div>
      ) : null}
      {doc.status === 'FAILED' ? (
        <p className="mt-2 text-xs text-error">{t('portal.documents.failedHint')}</p>
      ) : null}
    </li>
  );
}
