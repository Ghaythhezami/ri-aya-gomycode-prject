import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';

function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Banner shown while the browser is offline; the live region announces the change. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();

  return (
    <div role="status" aria-live="polite">
      {online ? null : (
        <p className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-white">
          <WifiOff size={16} aria-hidden="true" />
          {t('shellnav.offline')}
        </p>
      )}
    </div>
  );
}
