import { useTranslation } from 'react-i18next';
import { negotiateLocale, type Locale } from '@riaya/shared';
import { useWorkspace } from '../../auth/WorkspaceContext';

/** Intl formatters bound to the UI language and the active clinic time zone (I18N-2). */
export function useClinicFormat() {
  const { i18n } = useTranslation();
  const { active } = useWorkspace();
  const locale: Locale = negotiateLocale(i18n.resolvedLanguage);
  const timeZone = active?.clinicTimezone || 'UTC';
  // Latin digits keep phone numbers, times and charts readable in Arabic too.
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const fmt = (options: Intl.DateTimeFormatOptions) => (value: string | Date | number) =>
    new Intl.DateTimeFormat(tag, { timeZone, ...options }).format(new Date(value));
  return {
    locale,
    timeZone,
    time: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    date: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
    shortDate: fmt({ day: 'numeric', month: 'short' }),
    weekday: fmt({ weekday: 'short' }),
    longDate: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    dateTime: fmt({
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(tag, options).format(value),
    /** Local YYYY-MM-DD of an instant in the clinic zone. */
    localDate: (value: string | Date = new Date()) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(value)),
  };
}
