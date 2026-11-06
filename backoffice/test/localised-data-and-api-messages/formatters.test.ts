import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ERROR_MESSAGES,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  negotiateLocale,
} from '@riaya/shared';
import i18n from '../../src/i18n';
import { api } from '../../src/lib/api';

/**
 * TEST-095 → AC-005, TEST-096 → AC-006, TEST-097 → AC-007,
 * TEST-098 → AC-008, TEST-099 → AC-009, TEST-101 → AC-011, TEST-102 → AC-012.
 *
 * TEST-100 (membership timezone) lives in the server suite.
 */

const root = join(__dirname, '../..');

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function requestHeader(): string {
  // The axios request interceptor is the only place the header is set.
  const handlers = (
    api.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (config: { headers: Record<string, string> }) => {
          headers: Record<string, string>;
        };
      }>;
    }
  ).handlers;
  const config = handlers[0].fulfilled({ headers: {} });
  return config.headers['Accept-Language'];
}

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Localised data and API messages', () => {
  it('AC-005: every API request carries the active language', async () => {
    await i18n.changeLanguage('en');
    expect(requestHeader()).toBe('en');

    await i18n.changeLanguage('ar');
    expect(requestHeader()).toBe('ar');
  });

  it('AC-006: a language change changes the next request without a reload', async () => {
    await i18n.changeLanguage('fr');
    expect(requestHeader()).toBe('fr');
    await i18n.changeLanguage('en');
    expect(requestHeader()).toBe('en');
  });

  it('AC-007: Arabic messages are real Arabic and the document flips to RTL', async () => {
    await i18n.changeLanguage('ar');

    expect(document.documentElement.dir).toBe('rtl');
    expect(ERROR_MESSAGES.ar.VALIDATION_ERROR).toMatch(/[\u0600-\u06FF]/);
    expect(ERROR_MESSAGES.ar.FORBIDDEN).not.toBe(ERROR_MESSAGES.en.FORBIDDEN);
  });

  it('AC-008: a timestamp is formatted in the clinic timezone, not the server zone', () => {
    const value = new Date('2026-01-15T09:30:00.000Z');

    expect(formatDateTime(value, 'en', 'Asia/Riyadh')).toContain('12:30');
    expect(formatDateTime(value, 'en', 'Asia/Tokyo')).toContain('6:30');
    expect(formatTime(value, 'en', 'UTC')).toContain('9:30');
  });

  it('AC-009: date and number output differs correctly per locale', () => {
    const value = new Date('2026-01-15T12:00:00.000Z');

    const en = formatDate(value, 'en', 'UTC');
    const ar = formatDate(value, 'ar', 'UTC');
    const fr = formatDate(value, 'fr', 'UTC');

    expect(en).toMatch(/Jan/);
    expect(fr).toMatch(/janv/i);
    expect(ar).not.toBe(en);
    expect(ar).not.toBe(fr);

    const enNumber = formatNumber(1234.5, 'en');
    const frNumber = formatNumber(1234.5, 'fr');
    expect(enNumber).toContain('234');
    expect(frNumber).toContain('234');
    expect(enNumber).not.toBe(frNumber);
  });

  it('AC-011: an invalid timezone falls back to UTC instead of throwing', () => {
    const value = new Date('2026-01-15T12:00:00.000Z');

    expect(formatDate(value, 'en', 'Not/AZone')).toBe(formatDate(value, 'en', 'UTC'));
    expect(formatDate(value, 'en', null)).toBe(formatDate(value, 'en', 'UTC'));
  });

  it('AC-012: no component formats a date with an implicit locale', () => {
    const offenders = walk(join(root, 'src')).filter((file) =>
      /\.toLocale(?:String|DateString|TimeString)\(\s*\)/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('AC-002 (client): a regional tag resolves to its base locale and an unknown one falls back', () => {
    expect(negotiateLocale('ar-EG,ar;q=0.9,en;q=0.5')).toBe('ar');
    expect(negotiateLocale('fr-CA')).toBe('fr');
    expect(negotiateLocale('de')).toBe('en');
  });
});
