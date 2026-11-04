/**
 * Locale- and timezone-aware formatters (BP-013).
 *
 * Stored timestamps stay UTC; conversion happens only here, at display time.
 * A missing or invalid IANA zone falls back to UTC instead of throwing.
 */

import type { Locale } from './i18n';

export const DEFAULT_TIME_ZONE = 'UTC';

export function resolveTimeZone(timeZone?: string | null): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
  timeZone?: string | null,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: resolveTimeZone(timeZone),
  }).format(new Date(value));
}

export function formatTime(
  value: string | number | Date,
  locale: Locale,
  timeZone?: string | null,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: resolveTimeZone(timeZone),
  }).format(new Date(value));
}

export function formatDateTime(
  value: string | number | Date,
  locale: Locale,
  timeZone?: string | null,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: resolveTimeZone(timeZone),
  }).format(new Date(value));
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(value: number, locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
