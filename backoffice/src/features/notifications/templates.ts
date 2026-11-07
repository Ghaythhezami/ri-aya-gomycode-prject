import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Info,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationCategory, NotificationDto } from '@riaya/shared';

export type NotificationTab = 'all' | 'unread' | 'appointments' | 'system';

const APPOINTMENT_CATEGORIES: readonly NotificationCategory[] = [
  'CONFIRMATION',
  'CANCELLATION',
  'REMINDER',
  'CONFLICT',
  'DELAY',
];
const SYSTEM_CATEGORIES: readonly NotificationCategory[] = ['SYSTEM', 'AVAILABILITY'];

/** Whether a notification belongs on a tab (the API filters by one category only). */
export function matchesTab(
  n: Pick<NotificationDto, 'category' | 'read'>,
  tab: NotificationTab,
): boolean {
  switch (tab) {
    case 'unread':
      return !n.read;
    case 'appointments':
      return APPOINTMENT_CATEGORIES.includes(n.category);
    case 'system':
      return SYSTEM_CATEGORIES.includes(n.category);
    default:
      return true;
  }
}

/** Route a notification links to, or null. */
export function entityPath(n: Pick<NotificationDto, 'entityType' | 'entityId'>): string | null {
  if (!n.entityType) return null;
  switch (n.entityType) {
    case 'appointment':
      return n.entityId ? `/appointments/${n.entityId}` : null;
    case 'patient':
      return n.entityId ? `/patients/${n.entityId}` : null;
    case 'doctor':
      return n.entityId ? `/doctors/${n.entityId}` : null;
    case 'queue':
      return '/waiting-list';
    default:
      return null;
  }
}

/** Template name of a key such as `notifications.templates.newPatient.title`. */
export function templateName(key: string): string {
  const parts = key.split('.');
  return parts.length >= 2 ? (parts[parts.length - 2] ?? '') : key;
}

/** "newPatient" → "New patient"; used only when a template has no translation. */
export function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() : '';
}

/** Icon and token classes of the category tile. */
export function tileFor(n: Pick<NotificationDto, 'category' | 'titleKey'>): {
  Icon: LucideIcon;
  className: string;
} {
  const name = templateName(n.titleKey);
  if (name === 'newPatient') return { Icon: UserPlus, className: 'bg-info/10 text-info' };
  switch (n.category) {
    case 'CONFLICT':
      return { Icon: Zap, className: 'bg-alert/10 text-alert' };
    case 'CONFIRMATION':
      return { Icon: CheckCircle2, className: 'bg-success/10 text-success' };
    case 'DELAY':
      return { Icon: Bell, className: 'bg-error/10 text-error' };
    case 'CANCELLATION':
      return { Icon: CalendarX2, className: 'bg-error/10 text-error' };
    case 'REMINDER':
      return { Icon: CalendarClock, className: 'bg-info/10 text-info' };
    case 'AVAILABILITY':
      return { Icon: CalendarCheck, className: 'bg-primary/10 text-primary-dark' };
    default:
      return { Icon: Info, className: 'bg-muted/10 text-muted' };
  }
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PARAMS = new Set(['time', 'from', 'to']);

export interface ParamFormatters {
  time: (value: string) => string;
  dateTime: (value: string) => string;
  /** Calendar date (YYYY-MM-DD). */
  date: (value: string) => string;
}

/** Format ISO instants and dates in template params in the clinic zone and UI locale. */
export function prepareParams(
  params: Record<string, string | number> | null | undefined,
  f: ParamFormatters,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === 'string' && ISO_INSTANT.test(value)) {
      out[key] = TIME_PARAMS.has(key) ? f.time(value) : f.dateTime(value);
    } else if (typeof value === 'string' && ISO_DATE.test(value)) {
      out[key] = f.date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface Translator {
  t: (key: string, options?: Record<string, unknown>) => string;
  exists: (key: string) => boolean;
}

/**
 * A param the API did not send must never show as a raw `{{placeholder}}`: a parenthetical
 * that only exists for that param is dropped ("Sarah (queue {{number}}) is late" → "Sarah is
 * late"), any other placeholder becomes a dash.
 */
export function fillMissing(text: string): string {
  return text
    .replace(/\s*\([^()]*\{\{\s*\w+\s*\}\}[^()]*\)/g, '')
    .replace(/\{\{\s*\w+\s*\}\}/g, '—');
}

/** Translate a notification's title and body; unknown templates get a readable fallback. */
export function renderNotification(
  n: Pick<NotificationDto, 'titleKey' | 'bodyKey' | 'params'>,
  i18n: Translator,
  f: ParamFormatters,
): { title: string; body: string } {
  const params = prepareParams(n.params, f);
  const title = i18n.exists(n.titleKey)
    ? i18n.t(n.titleKey, params)
    : humanize(templateName(n.titleKey));
  const body = i18n.exists(n.bodyKey) ? i18n.t(n.bodyKey, params) : '';
  return { title: fillMissing(title), body: fillMissing(body) };
}

/** Localised relative time ("5 minutes ago") from an ISO instant. */
export function relativeTime(iso: string, now: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86_400), 'day');
}

/** Merge two lists by id, keeping the first occurrence and order. */
export function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}
