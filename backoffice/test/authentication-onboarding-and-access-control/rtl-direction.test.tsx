import { describe, expect, it } from 'vitest';
import i18n from '../../src/i18n';

/**
 * TEST-048 → AC-033 and TEST-049 → AC-034.
 *
 * The direction is applied by the i18n `languageChanged` listener, so changing
 * the language here exercises the real wiring rather than a stub. Structural
 * mirroring is asserted; the visual "nothing clips" claim still needs a browser.
 */
describe('Document direction per locale', () => {
  it('mirrors the document for Arabic', async () => {
    await i18n.changeLanguage('ar');

    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('keeps the document left-to-right for English and French', async () => {
    await i18n.changeLanguage('fr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('fr');

    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('has the auth strings translated in all three catalogues', async () => {
    for (const lng of ['en', 'ar', 'fr']) {
      const options = i18n.getFixedT(lng)('auth.signIn');
      expect(options).toBeTruthy();
      expect(options).not.toBe('auth.signIn');
    }
  });
});
