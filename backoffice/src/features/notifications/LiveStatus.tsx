import { useTranslation } from 'react-i18next';
import { Radio, WifiOff } from 'lucide-react';
import { useRealtimeStatus } from '../../lib/realtime';
import { secondsOf } from './liveLogic';
import { UNREAD_POLL_MS } from './useUnreadCount';

/** Small "Live" / "Offline - updating every N s" indicator; icon and text, never colour alone. */
export function LiveStatus() {
  const { t } = useTranslation();
  const status = useRealtimeStatus();
  const seconds = secondsOf(UNREAD_POLL_MS);
  const live = status === 'connected';
  const label = live
    ? t('notifications.live.on')
    : status === 'connecting'
      ? t('notifications.live.connecting', { seconds })
      : status === 'offline'
        ? t('notifications.live.offline', { seconds })
        : t('notifications.live.polling', { seconds });
  const Icon = live ? Radio : WifiOff;
  return (
    <p
      role="status"
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs ${
        live ? 'text-success' : 'text-muted'
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </p>
  );
}
