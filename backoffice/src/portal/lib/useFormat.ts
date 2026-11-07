import { useTranslation } from 'react-i18next';
import { negotiateLocale } from '@riaya/shared';
import { usePortalAuth } from '../PortalAuthContext';

/** Intl formatters bound to the UI language and the patient clinic time zone. */
export function usePortalFormat() {
  const { i18n } = useTranslation();
  const { timeZone } = usePortalAuth();
  const locale = negotiateLocale(i18n.resolvedLanguage);
  // Latin digits keep times and phone numbers readable in Arabic too.
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const fmt = (options: Intl.DateTimeFormatOptions) => (value: string | Date | number) =>
    new Intl.DateTimeFormat(tag, { timeZone, ...options }).format(new Date(value));
  return {
    timeZone,
    time: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    date: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
    longDate: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    dateTime: fmt({
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
    /** A calendar day (`YYYY-MM-DD`) as weekday and day number, zone-free. */
    dayChip: (ymd: string) => {
      const d = new Date(`${ymd}T12:00:00Z`);
      return {
        weekday: new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' }).format(d),
        day: new Intl.DateTimeFormat(tag, {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }).format(d),
      };
    },
    calendarDay: (ymd: string) =>
      new Intl.DateTimeFormat(tag, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${ymd}T12:00:00Z`)),
  };
}
