import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Upload } from 'lucide-react';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { usePatientDocumentsQuery, useUploadDocumentMutation } from './api';
import { DocumentDrawer } from './DocumentDrawer';
import { pollIntervalFor, STATUS_TONE } from './polling';
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, validateDocumentFile } from './validation';

export function DocumentsTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useClinicFormat();
  const [poll, setPoll] = useState(0);
  const { data, isLoading, isError, refetch } = usePatientDocumentsQuery(patientId, {
    pollingInterval: poll,
    skipPollingIfUnfocused: true,
  });
  const [upload, { isLoading: uploading }] = useUploadDocumentMutation();
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => setPoll(pollIntervalFor(data)), [data]);

  const handleFiles = async (files: FileList | File[]) => {
    const next: string[] = [];
    for (const file of Array.from(files)) {
      const problem = validateDocumentFile(file);
      if (problem) {
        next.push(
          t(`documents.upload.error.${problem}`, {
            name: file.name,
            max: Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024),
          }),
        );
        continue;
      }
      try {
        await upload({ patientId, file }).unwrap();
        toast.success(t('documents.upload.done', { name: file.name }));
      } catch (raw) {
        const e = asClinicError(raw);
        next.push(
          `${file.name}: ${t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') })}`,
        );
      }
    }
    setProblems(next);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void handleFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center ${
          dragging ? 'border-primary bg-accent' : 'border-border-strong bg-bg'
        }`}
      >
        <Upload size={24} aria-hidden="true" className="text-muted" />
        <p className="text-sm text-text">{t('documents.upload.drop')}</p>
        <p className="text-xs text-muted">
          {t('documents.upload.hint', { max: Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024) })}
        </p>
        <input
          ref={picker}
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t('documents.upload.choose')}
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => picker.current?.click()}
          disabled={uploading}
          aria-busy={uploading || undefined}
        >
          {uploading ? t('documents.upload.uploading') : t('documents.upload.choose')}
        </Button>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-error">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title={t('documents.error.title')}
          action={<Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('documents.empty.title')} description={t('documents.empty.body')} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {data.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                ref={(node) => {
                  rowRefs.current[d.id] = node;
                }}
                onClick={() => setOpenId(d.id)}
                className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-start hover:bg-bg"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <FileText size={18} aria-hidden="true" className="shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text" dir="auto">
                      {d.extraction?.title || d.fileName}
                    </span>
                    <span className="block text-xs text-muted">
                      {d.category
                        ? t(`documents.category.${d.category}`)
                        : t('documents.category.unknown')}
                      {' · '}
                      {fmt.date(d.documentDate ?? d.createdAt)}
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {d.uploadedBy === 'PATIENT' && !d.reviewedAt && (
                    <Badge tone="warning">{t('documents.patientUpload')}</Badge>
                  )}
                  {d.reviewedAt && <Badge tone="success">{t('documents.reviewed')}</Badge>}
                  <Badge tone={STATUS_TONE[d.status]}>{t(`documents.status.${d.status}`)}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <DocumentDrawer
          patientId={patientId}
          docId={openId}
          onClose={() => {
            const id = openId;
            setOpenId(null);
            requestAnimationFrame(() => rowRefs.current[id]?.focus());
          }}
        />
      )}
    </div>
  );
}
