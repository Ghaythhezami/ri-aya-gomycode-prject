import {
  isValidCode,
  isValidDuration,
  normalizeCode,
  parseAcceptLanguage,
  slugCode,
  typeDisplayName,
} from './appointment-type-rules';

describe('appointment type rules', () => {
  it('derives a code from the English name, else the first filled language', () => {
    expect(slugCode({ en: 'Vaccination (child)' })).toBe('VACCINATION_CHILD');
    expect(slugCode({ fr: 'Contrôle été', ar: 'x' })).toBe('CONTROLE_ETE');
    expect(slugCode({ ar: 'تطعيم' })).toBe('');
  });

  it('caps codes at 32 characters of A-Z0-9_', () => {
    const code = normalizeCode('a'.repeat(50));
    expect(code).toHaveLength(32);
    expect(isValidCode(code)).toBe(true);
    expect(isValidCode('lower')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });

  it('accepts durations 5 to 480 in steps of 5', () => {
    expect(isValidDuration(5)).toBe(true);
    expect(isValidDuration(480)).toBe(true);
    expect(isValidDuration(7)).toBe(false);
    expect(isValidDuration(485)).toBe(false);
    expect(isValidDuration(0)).toBe(false);
  });

  it('parses Accept-Language and resolves display names', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(parseAcceptLanguage('de,ar;q=0.5')).toBe('ar');
    expect(parseAcceptLanguage('de')).toBeUndefined();
    expect(typeDisplayName({ en: 'A', fr: 'B' }, 'C', 'ar', 'fr')).toBe('B');
    expect(typeDisplayName({}, 'CODE', 'ar', 'fr')).toBe('CODE');
  });
});
