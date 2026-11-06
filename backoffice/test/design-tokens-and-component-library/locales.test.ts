import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import ar from '../../src/i18n/ar.json';
import en from '../../src/i18n/en.json';
import fr from '../../src/i18n/fr.json';

/**
 * TEST-060 → AC-011.
 *
 * Coverage is asserted twice: the parity guard must pass (narrower than
 * NFR-001 would allow otherwise), and the three catalogues must carry an
 * identical set of `ds.*` keys that is non-trivial.
 *
 * jsdom cannot tell whether a string is good Arabic, so the test also rejects
 * values that were left untranslated by copying the English one — the failure
 * mode a key-set comparison alone would miss.
 */
const root = join(__dirname, '../..');

function flatten(
  value: unknown,
  prefix = '',
  out = new Map<string, string>(),
): Map<string, string> {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

const catalogues = {
  en: flatten(en),
  ar: flatten(ar),
  fr: flatten(fr),
} as const;

const dsKeys = (map: Map<string, string>) =>
  [...map.keys()].filter((key) => key.startsWith('ds.')).sort();

describe('Locale coverage', () => {
  it('AC-011: the locale parity guard passes', () => {
    const exitCode = (() => {
      try {
        execFileSync(process.execPath, [join(root, 'scripts/check-locale-parity.mjs')], {
          cwd: root,
          encoding: 'utf8',
        });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? 1;
      }
    })();

    expect(exitCode).toBe(0);
  });

  it('AC-011: en, ar and fr carry the same ds keys', () => {
    const reference = dsKeys(catalogues.en);

    expect(reference.length).toBeGreaterThan(50);
    expect(dsKeys(catalogues.ar)).toEqual(reference);
    expect(dsKeys(catalogues.fr)).toEqual(reference);
  });

  it('AC-011: no ds value falls back to English in Arabic', () => {
    const untranslated = dsKeys(catalogues.en).filter(
      (key) => catalogues.ar.get(key) === catalogues.en.get(key),
    );

    // Arabic shares no words with English here, so any identical value is a
    // silent runtime fallback rather than a translation.
    expect(untranslated, `ar falls back to English for: ${untranslated.join(', ')}`).toEqual([]);
  });

  it('AC-011: French either translates each ds value or shares it legitimately', () => {
    // True cognates and identical medical abbreviations, listed explicitly so a
    // new untranslated string cannot hide behind the pattern.
    const legitimateCognates = new Set([
      'ds.badges', // Badges
      'ds.danger', // Danger
      'ds.minutes', // min
      'ds.colPatient', // Patient
      'ds.colType', // Type
      'ds.textarea', // Notes
    ]);

    const untranslated = dsKeys(catalogues.en).filter(
      (key) => catalogues.fr.get(key) === catalogues.en.get(key) && !legitimateCognates.has(key),
    );

    expect(untranslated, `fr falls back to English for: ${untranslated.join(', ')}`).toEqual([]);
  });

  it('AC-011: no ds value is empty', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const key of dsKeys(catalogue)) {
        expect(catalogue.get(key)?.trim(), `${locale} ${key} is empty`).not.toBe('');
      }
    }
  });
});
