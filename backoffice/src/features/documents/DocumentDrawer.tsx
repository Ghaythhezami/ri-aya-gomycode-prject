import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, RefreshCw, Trash2, X } from 'lucide-react';
import type { DocumentValue, PatientDocumentDetail } from '@riaya/shared';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useDialogFocus } from '../assistant/useDialogFocus';
import { useClinicFormat } from '../shared/format';
import {
  useDeleteDocumentMutation,
  usePatientDocumentQuery,
  useProcessDocumentMutation,
  useReviewDocumentMutation,
} from './api';
import { isInFlight, STATUS_TONE } from './polling';
import { useDocumentBlob } from './useDocumentBlob';

const FLAG_TONE = {
  low: 'warning',
  high: 'warning',
  abnormal: 'error',
  normal: 'success',
} as const;

function ValueRow({ v }: { v: DocumentValue }) {
  const { t } = useTranslation();
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="py-2 pe-3 text-start font-medium text-text" dir="auto">
        {v.name}
      </th>
      <td className="py-2 pe-3" dir="ltr">
        {v.value}
        {v.unit ? ` ${v.unit}` : ''}
      </td>
      <td className="py-2 pe-3 text-muted" dir="ltr">
        {v.referenceRange ?? '—'}
      </td>
      <td className="py-2">
        {v.flag ? (
          <Badge tone={FLAG_TONE[v.flag]}>{t(`documents.flag.${v.flag}`)}</Badge>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function FilePreview({ patientId, doc }: { patientId: string; doc: PatientDocumentDetail }) {
  const { t } = useTranslation();
  const { url, loading, failed } = useDocumentBlob(patientId, doc.id);
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (failed || !url) {
    return (
      <p role="alert" className="text-sm text-error">
        {t('documents.previewError')}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {doc.mimeType.startsWith('image/') ? (
        <img
          src={url}
          alt={t('documents.previewAlt', { name: doc.fileName })}
          className="max-h-96 w-full rounded-md border border-border bg-bg object-contain"
        />
      ) : (
        <object
          data={url}
          type="application/pdf"
          className="h-96 w-full rounded-md border border-border"
        >
          <p className="p-3 text-sm text-muted">{t('documents.pdfFallback')}</p>
        </object>
      )}
      <a
        href={url}
        download={doc.fileName}
        className="inline-flex min-h-10 items-center gap-1.5 text-sm text-primary underline"
      >
        <Download size={14} aria-hidden="true" />
        {t('documents.download')}
      </a>
    </div>
  );
}

export function DocumentDrawer({
  patientId,
  docId,
  onClose,
}: {
  patientId: string;
  docId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useClinicFormat();
  const panel = useRef<HTMLElement>(null);
  const [poll, setPoll] = useState(0);
  const {
    data: doc,
    isLoading,
    isError,
    refetch,
  } = usePatientDocumentQuery({ patientId, docId }, { pollingInterval: poll });
  const [review, { isLoading: reviewing }] = useReviewDocumentMutation();
  const [process, { isLoading: processing }] = useProcessDocumentMutation();
  const [remove, { isLoading: removing }] = useDeleteDocumentMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showText, setShowText] = useState(false);

  useDialogFocus(true, panel, onClose);
  useEffect(() => setPoll(doc && isInFlight(doc.status) ? 3000 : 0), [doc]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (raw) {
      const e = asClinicError(raw);
      toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
      return false;
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(doc?.extractedText ?? '');
      toast.success(t('documents.copied'));
    } catch {
      toast.error(t('documents.copyFailed'));
    }
  };

  const ex = doc?.extraction;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('clinic.close')}
        className="absolute inset-0 bg-navy/40"
        onClick={onClose}
      />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('documents.detail')}
        tabIndex={-1}
        className="absolute inset-y-0 end-0 flex w-full flex-col bg-surface shadow-(--shadow-overlay) sm:max-w-2xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-semibold text-text" dir="auto">
            {doc ? ex?.title || doc.fileName : t('documents.detail')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('clinic.close')}
            className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-accent"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : isError || !doc ? (
            <ErrorState
              title={t('documents.error.title')}
              action={<Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[doc.status]}>{t(`documents.status.${doc.status}`)}</Badge>
                {doc.uploadedBy === 'PATIENT' && !doc.reviewedAt && (
                  <Badge tone="warning">{t('documents.patientUpload')}</Badge>
                )}
                {doc.reviewedAt && (
                  <Badge tone="success">
                    {t('documents.reviewedOn', { date: fmt.date(doc.reviewedAt) })}
                  </Badge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted">{t('documents.field.category')}</dt>
                  <dd>
                    {doc.category
                      ? t(`documents.category.${doc.category}`)
                      : t('documents.category.unknown')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('documents.field.date')}</dt>
                  <dd>{fmt.date(doc.documentDate ?? doc.createdAt)}</dd>
                </div>
              </dl>

              <FilePreview patientId={patientId} doc={doc} />

              {isInFlight(doc.status) && (
                <p role="status" className="text-muted">
                  {t('documents.processingNote')}
                </p>
              )}
              {doc.status === 'FAILED' && (
                <p role="alert" className="text-error">
                  {t('documents.failedNote')}
                </p>
              )}

              {ex && (
                <>
                  {(doc.summary || ex.patientSummary) && (
                    <section>
                      <h3 className="mb-1 font-semibold text-text">
                        {t('documents.clinicianSummary')}
                      </h3>
                      <p className="whitespace-pre-wrap text-text" dir="auto">
                        {doc.summary || ex.patientSummary}
                      </p>
                    </section>
                  )}
                  {ex.values.length > 0 && (
                    <section>
                      <h3 className="mb-1 font-semibold text-text">{t('documents.values')}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-96 text-start">
                          <caption className="sr-only">{t('documents.values')}</caption>
                          <thead>
                            <tr className="text-xs text-muted">
                              <th scope="col" className="pb-1 pe-3 text-start font-medium">
                                {t('documents.col.name')}
                              </th>
                              <th scope="col" className="pb-1 pe-3 text-start font-medium">
                                {t('documents.col.value')}
                              </th>
                              <th scope="col" className="pb-1 pe-3 text-start font-medium">
                                {t('documents.col.range')}
                              </th>
                              <th scope="col" className="pb-1 text-start font-medium">
                                {t('documents.col.flag')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {ex.values.map((v, i) => (
                              <ValueRow key={`${v.name}-${i}`} v={v} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                  {ex.findings.length > 0 && (
                    <section>
                      <h3 className="mb-1 font-semibold text-text">{t('documents.findings')}</h3>
                      <ul className="ms-5 list-disc space-y-1" dir="auto">
                        {ex.findings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {ex.medications.length > 0 && (
                    <section>
                      <h3 className="mb-1 font-semibold text-text">{t('documents.medications')}</h3>
                      <ul className="ms-5 list-disc space-y-1">
                        {ex.medications.map((m, i) => (
                          <li key={i}>
                            {m.name}
                            {[m.dose, m.frequency].filter(Boolean).length > 0
                              ? ` — ${[m.dose, m.frequency].filter(Boolean).join(', ')}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}

              {doc.extractedText && (
                <section>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-expanded={showText}
                      aria-controls="doc-ocr"
                      onClick={() => setShowText((v) => !v)}
                      className="min-h-10 font-semibold text-text underline"
                    >
                      {showText ? t('documents.hideText') : t('documents.showText')}
                    </button>
                    {showText && (
                      <Button size="sm" variant="secondary" onClick={() => void copyText()}>
                        <Copy size={14} aria-hidden="true" />
                        {t('documents.copy')}
                      </Button>
                    )}
                  </div>
                  {showText && (
                    <pre
                      id="doc-ocr"
                      dir="auto"
                      className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg p-3 font-mono text-xs"
                    >
                      {doc.extractedText}
                    </pre>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {doc && (
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden="true" />
              {t('documents.delete')}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={processing || isInFlight(doc.status)}
                onClick={() =>
                  void run(
                    () => process({ patientId, docId }).unwrap(),
                    t('documents.toast.reprocess'),
                  )
                }
              >
                <RefreshCw size={16} aria-hidden="true" />
                {t('documents.reprocess')}
              </Button>
              <Button
                disabled={reviewing || Boolean(doc.reviewedAt)}
                onClick={() =>
                  void run(
                    () => review({ patientId, docId }).unwrap(),
                    t('documents.toast.reviewed'),
                  )
                }
              >
                {doc.reviewedAt ? t('documents.reviewed') : t('documents.markReviewed')}
              </Button>
            </div>
          </footer>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={t('documents.deleteTitle')}
        confirmLabel={t('documents.delete')}
        cancelLabel={t('clinic.cancel')}
        tone="danger"
        loading={removing}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          void run(() => remove({ patientId, docId }).unwrap(), t('documents.toast.deleted')).then(
            (ok) => {
              setConfirmDelete(false);
              if (ok) onClose();
            },
          )
        }
      >
        {t('documents.deleteBody')}
      </ConfirmDialog>
    </div>
  );
}
