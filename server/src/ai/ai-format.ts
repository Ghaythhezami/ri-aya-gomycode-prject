import { zoneOffsetMinutes } from '../core/clinic-time';
import { TOOL_RESULT_MAX_CHARS, UNTRUSTED_NOTE } from './ai.constants';

/** Instant as ISO 8601 with the clinic offset, e.g. 2026-11-07T09:30:00+04:00. */
export function toLocalIso(instant: Date, timeZone: string): string {
  const offset = zoneOffsetMinutes(instant, timeZone);
  const shifted = new Date(instant.getTime() + offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${shifted.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
}

/** "HH:mm" of an instant in the clinic zone. */
export function localTime(instant: Date, timeZone: string): string {
  return toLocalIso(instant, timeZone).slice(11, 16);
}

/** Tool result string: compact JSON wrapped as untrusted data, cut when too long. */
export function wrapToolData(data: unknown): string {
  let body = JSON.stringify({ data, note: UNTRUSTED_NOTE });
  if (body.length > TOOL_RESULT_MAX_CHARS) {
    body = JSON.stringify({
      data: {
        truncated: true,
        partial: JSON.stringify(data).slice(0, TOOL_RESULT_MAX_CHARS - 400),
      },
      note: UNTRUSTED_NOTE,
    });
  }
  return body;
}

export function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Human-readable date and time in the user's language and the clinic zone (proposal previews). */
export function formatWhen(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(instant);
}
