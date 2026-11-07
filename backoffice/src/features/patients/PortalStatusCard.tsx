import { useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PortalInvite } from '@riaya/shared';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Skeleton } from '../../common/Skeleton';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import {
  useInvitePatientToPortalMutation,
  usePatientPortalStatusQuery,
  useVerifyPatientPortalMutation,
} from './api';

/** Staff view of a patient's portal account: link state, invite and identity verification. */
export function PortalStatusCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useClinicFormat();
  const status = usePatientPortalStatusQuery(patientId);
  const [invite, { isLoading: inviting }] = useInvitePatientToPortalMutation();
  const [verify, { isLoading: verifying }] = useVerifyPatientPortalMutation();
  const [link, setLink] = useState<PortalInvite | null>(null);
  const [confirmVerify, setConfirmVerify] = useState(false);

  const fail = (raw: unknown) => {
    const e = asClinicError(raw);
    toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
  };

  const doInvite = async () => {
    try {
      setLink(await invite(patientId).unwrap());
    } catch (raw) {
      fail(raw);
    }
  };
  const doVerify = async () => {
    try {
      await verify(patientId).unwrap();
      toast.success(t('patients.portal.verified'));
    } catch (raw) {
      fail(raw);
    }
    setConfirmVerify(false);
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success(t('patients.portal.copied'));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const data = status.data;
  return (
    <section
      aria-labelledby="patient-portal-title"
      className="rounded-lg border border-border bg-surface p-4 shadow-(--shadow-card)"
    >
      <h2 id="patient-portal-title" className="text-sm font-semibold text-text">
        {t('patients.portal.title')}
      </h2>
      {status.isLoading ? (
        <Skeleton className="mt-3 h-10 w-full" />
      ) : status.isError || !data ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {t('patients.portal.loadError')}
        </p>
      ) : (
        <div className="mt-2 space-y-3 text-sm">
          {data.hasAccount ? (
            <p className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="break-all text-text">
                {data.email}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  data.verified ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}
              >
                {data.verified ? <ShieldCheck size={12} aria-hidden="true" /> : null}
                {data.verified
                  ? t('patients.portal.verifiedBadge')
                  : t('patients.portal.unverified')}
              </span>
              {data.createdAt ? (
                <span className="text-xs text-muted">
                  {t('patients.portal.since', { date: fmt.date(data.createdAt) })}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted">{t('patients.portal.noAccount')}</p>
          )}
          {data.possibleDuplicateOfId ? (
            <p role="status" className="text-warning">
              {t('patients.portal.duplicate')}{' '}
              <Link className="underline" to={`/patients/${data.possibleDuplicateOfId}`}>
                {t('patients.portal.openDuplicate')}
              </Link>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!data.hasAccount ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void doInvite()}
                disabled={inviting}
              >
                {t('patients.portal.invite')}
              </Button>
            ) : null}
            {data.hasAccount && !data.verified ? (
              <Button size="sm" variant="secondary" onClick={() => setConfirmVerify(true)}>
                {t('patients.portal.verify')}
              </Button>
            ) : null}
          </div>
          {link ? (
            <div className="rounded-md border border-border bg-bg p-3">
              <p className="text-xs text-muted">{t('patients.portal.inviteHint')}</p>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <QRCodeSVG
                  value={link.url}
                  size={112}
                  role="img"
                  aria-label={t('patients.portal.qrLabel')}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p dir="ltr" className="break-all text-xs text-text">
                    {link.url}
                  </p>
                  <p className="text-xs text-muted">
                    {t('patients.portal.expires', { date: fmt.dateTime(link.expiresAt) })}
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => void copy()}>
                    <Copy size={14} aria-hidden="true" />
                    {t('patients.portal.copy')}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirmVerify}
        title={t('patients.portal.verifyTitle')}
        confirmLabel={t('patients.portal.verify')}
        cancelLabel={t('clinic.cancel')}
        loading={verifying}
        onConfirm={() => void doVerify()}
        onCancel={() => setConfirmVerify(false)}
      >
        {t('patients.portal.verifyBody')}
      </ConfirmDialog>
    </section>
  );
}
