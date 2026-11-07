import type { ProposalDraft } from './tools/tool-types';
import { formatWhen } from './ai-format';

type Locale = 'en' | 'fr' | 'ar';

interface PreviewArgs {
  locale: Locale;
  timeZone: string;
}

const T = {
  en: {
    book: (who: string, doc: string, when: string) => `Book ${who} with ${doc} on ${when}`,
    bookSelf: (doc: string, when: string) => `Book an appointment with ${doc} on ${when}`,
    resched: (code: string, when: string) => `Move appointment ${code} to ${when}`,
    cancel: (code: string) => `Cancel appointment ${code}`,
    checkIn: (code: string, who: string) => `Check in ${who} (appointment ${code})`,
    summary: (who: string) => `Save a clinical summary for ${who}`,
    summaryPublish: (who: string) =>
      `Save a summary for ${who} and share the plain-language version in the portal`,
    note: (who: string) => `Add a clinical note to ${who}`,
  },
  fr: {
    book: (who: string, doc: string, when: string) => `Réserver ${who} avec ${doc} le ${when}`,
    bookSelf: (doc: string, when: string) => `Réserver un rendez-vous avec ${doc} le ${when}`,
    resched: (code: string, when: string) => `Déplacer le rendez-vous ${code} au ${when}`,
    cancel: (code: string) => `Annuler le rendez-vous ${code}`,
    checkIn: (code: string, who: string) => `Enregistrer l'arrivée de ${who} (rendez-vous ${code})`,
    summary: (who: string) => `Enregistrer un résumé clinique pour ${who}`,
    summaryPublish: (who: string) =>
      `Enregistrer un résumé pour ${who} et partager la version simplifiée sur le portail`,
    note: (who: string) => `Ajouter une note clinique à ${who}`,
  },
  ar: {
    book: (who: string, doc: string, when: string) => `حجز موعد لـ ${who} مع ${doc} في ${when}`,
    bookSelf: (doc: string, when: string) => `حجز موعد مع ${doc} في ${when}`,
    resched: (code: string, when: string) => `نقل الموعد ${code} إلى ${when}`,
    cancel: (code: string) => `إلغاء الموعد ${code}`,
    checkIn: (code: string, who: string) => `تسجيل وصول ${who} (الموعد ${code})`,
    summary: (who: string) => `حفظ ملخص سريري لـ ${who}`,
    summaryPublish: (who: string) => `حفظ ملخص لـ ${who} ومشاركة النسخة المبسطة في البوابة`,
    note: (who: string) => `إضافة ملاحظة سريرية إلى ${who}`,
  },
} as const;

/** First 200 characters of free text, single line, for the confirmation card. */
export function excerptOf(text: string | undefined | null, max = 200): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

const quote = (text: string) => (text ? `: "${text}"` : '');

/** Human-readable preview of a proposal in the user's language (clinic zone for times). */
export const preview = {
  book(
    a: PreviewArgs & { patient?: string; doctor: string; startsAt: Date; reason?: string },
  ): string {
    const t = T[a.locale];
    const when = formatWhen(a.startsAt, a.timeZone, a.locale);
    const base = a.patient ? t.book(a.patient, a.doctor, when) : t.bookSelf(a.doctor, when);
    return `${base}${quote(excerptOf(a.reason))}`;
  },
  reschedule(a: PreviewArgs & { code: string; startsAt: Date }): string {
    return T[a.locale].resched(a.code, formatWhen(a.startsAt, a.timeZone, a.locale));
  },
  cancel(a: PreviewArgs & { code: string }): string {
    return T[a.locale].cancel(a.code);
  },
  checkIn(a: PreviewArgs & { code: string; patient: string }): string {
    return T[a.locale].checkIn(a.code, a.patient);
  },
  summary(a: PreviewArgs & { patient: string; publish: boolean; excerpt?: string }): string {
    const t = T[a.locale];
    const base = a.publish ? t.summaryPublish(a.patient) : t.summary(a.patient);
    return `${base}${quote(excerptOf(a.excerpt))}`;
  },
  note(a: PreviewArgs & { patient: string; excerpt?: string }): string {
    return `${T[a.locale].note(a.patient)}${quote(excerptOf(a.excerpt))}`;
  },
};

export type { ProposalDraft };
