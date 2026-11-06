import { ExternalLink, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../auth/WorkspaceContext';

/** QR code for patients to check in themselves, plus the public display link. */
export function SelfCheckInPanel() {
  const { t } = useTranslation();
  const { active } = useWorkspace();
  const clinicId = active?.clinicId;
  if (!clinicId) return null;
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const checkInUrl = `${base}check-in/${clinicId}`;
  const displayUrl = `${import.meta.env.BASE_URL}display/${clinicId}`;
  return (
    <section
      aria-label={t('queue.self.title')}
      className="flex flex-wrap items-center gap-5 rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)"
    >
      <div className="rounded-md border border-border bg-white p-2">
        <QRCodeSVG value={checkInUrl} size={112} role="img" aria-label={t('queue.self.qrLabel')} />
      </div>
      <div className="min-w-48 flex-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <QrCode size={16} aria-hidden="true" className="text-primary" />
          {t('queue.self.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('queue.self.body')}</p>
        <a
          href={displayUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary underline"
        >
          {t('queue.self.openDisplay')}
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">{t('queue.self.newTab')}</span>
        </a>
      </div>
    </section>
  );
}
