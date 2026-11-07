import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantStatus } from '@riaya/shared';
import { AssistantPanel } from '../../features/assistant/AssistantPanel';
import { createPortalAssistantClient } from '../../features/assistant/client';
import { requestJson } from '../../features/assistant/stream';
import { Skeleton } from '../../common/Skeleton';

export interface PortalAssistantPageProps {
  /** The patient's in-memory portal access token. */
  getAccessToken: () => string | null;
  /** Refresh the portal session once after a 401; resolves the new token. */
  refreshAccessToken?: () => Promise<string | null>;
  /** Route of the profile page where AI consent is given. */
  consentHref?: string;
  /** Called after a confirmed booking/cancel/reschedule so portal lists can refetch. */
  onChanged?: () => void;
  /** Identity verified by the clinic; unverified patients cannot use the assistant. */
  verified?: boolean;
}

/** Full-page patient assistant over `/api/portal/assistant/*` with a consent gate. */
export function AssistantPage({
  getAccessToken,
  refreshAccessToken,
  consentHref = '/portal/profile',
  onChanged,
  verified = true,
}: PortalAssistantPageProps) {
  const { t } = useTranslation();
  const client = useMemo(
    () => createPortalAssistantClient({ getAccessToken, refreshAccessToken }),
    [getAccessToken, refreshAccessToken],
  );
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    requestJson<AssistantStatus>(client.transport, 'GET', `${client.base}/status`)
      .then((s) => live && setStatus(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [client]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-3xl flex-col gap-3">
      <h1 className="text-2xl font-semibold text-text">{t('assistant.persona.patient')}</h1>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {!status && !failed ? (
          <div className="space-y-3 p-4" aria-busy="true">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <AssistantPanel
            persona="patient"
            client={client}
            blockedReason={
              !verified
                ? 'VERIFICATION_REQUIRED'
                : status && !status.enabled
                  ? (status.reason ?? 'NOT_CONFIGURED')
                  : null
            }
            consentHref={consentHref}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}
