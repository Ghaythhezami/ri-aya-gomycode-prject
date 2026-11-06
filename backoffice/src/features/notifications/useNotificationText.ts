import { useTranslation } from 'react-i18next';
import type { NotificationDto } from '@riaya/shared';
import { useClinicFormat } from '../shared/format';
import { relativeTime, renderNotification } from './templates';

/** Translate a notification and format its time, in the UI language and the clinic zone. */
export function useNotificationText() {
  const { i18n } = useTranslation();
  const fmt = useClinicFormat();
  const formatters = {
    time: fmt.time,
    dateTime: fmt.dateTime,
    date: (value: string) => fmt.shortDate(`${value}T12:00:00Z`),
  };
  return {
    render: (n: NotificationDto) =>
      renderNotification(
        n,
        { t: (k, o) => i18n.t(k, o) as string, exists: (k) => i18n.exists(k) },
        formatters,
      ),
    ago: (iso: string) =>
      relativeTime(iso, Date.now(), fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale),
  };
}
