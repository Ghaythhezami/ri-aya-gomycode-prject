import { BadRequestException } from '@nestjs/common';
import { buildSearchText, canonicalFrom, escapeLike, resolveNameInput } from './localized-input';

describe('resolveNameInput', () => {
  it('keeps a provided canonical value', () => {
    expect(resolveNameInput('firstName', ' Layla ', { ar: 'ليلى' }, 'ar')).toEqual({
      canonical: 'Layla',
      i18n: { ar: 'ليلى' },
    });
  });

  it('derives the canonical value from the clinic default language, else the first filled', () => {
    expect(
      resolveNameInput('firstName', undefined, { en: 'Omar', ar: 'عمر' }, 'ar').canonical,
    ).toBe('عمر');
    expect(resolveNameInput('firstName', undefined, { fr: 'Léa', ar: 'ليا' }, 'en').canonical).toBe(
      'Léa',
    );
    expect(canonicalFrom({ ar: 'ليا' }, 'fr')).toBe('ليا');
  });

  it('drops unknown keys and empty values, and requires at least one value', () => {
    expect(
      resolveNameInput('firstName', undefined, { en: ' X ', fr: '  ', de: 'Y' }, null).i18n,
    ).toEqual({ en: 'X' });
    expect(() => resolveNameInput('firstName', undefined, {}, 'en')).toThrow(BadRequestException);
    expect(() => resolveNameInput('lastName', '  ', undefined, 'en')).toThrow(BadRequestException);
  });
});

describe('buildSearchText', () => {
  it('lower-cases canonical, every language, code, phone and email', () => {
    expect(
      buildSearchText([
        'Layla',
        { en: 'Layla', fr: 'Leïla', ar: 'ليلى' },
        'P-001',
        '+971 50 123 1447',
        null,
        undefined,
      ]),
    ).toBe('layla layla leïla ليلى p-001 +971 50 123 1447');
  });
});

describe('escapeLike', () => {
  it('escapes wildcard characters', () => {
    expect(escapeLike('50%_off' + String.fromCharCode(92))).toBe(
      '50' +
        String.fromCharCode(92) +
        '%' +
        String.fromCharCode(92) +
        '_off' +
        String.fromCharCode(92, 92),
    );
  });
});
