import i18n from '../i18n';
import { installLanguageSync } from './languageSync';
import { store } from './store';

function deps(overrides: Partial<Parameters<typeof installLanguageSync>[0]> = {}) {
  return {
    i18n,
    resetCache: jest.fn(),
    refreshUser: jest.fn(),
    isSignedIn: () => true,
    storedLocale: () => 'en',
    persist: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('language change resets server data', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('drops the cache, reloads the user and saves the preference when signed in', async () => {
    const d = deps();
    const off = installLanguageSync(d);
    await i18n.changeLanguage('ar');
    expect(d.resetCache).toHaveBeenCalledTimes(1);
    expect(d.refreshUser).toHaveBeenCalledTimes(1);
    expect(d.persist).toHaveBeenCalledWith('ar');
    off();
    await i18n.changeLanguage('fr');
    expect(d.resetCache).toHaveBeenCalledTimes(1);
  });

  it('does not write the profile when signed out or when the locale is unchanged', async () => {
    const out = deps({ isSignedIn: () => false });
    const same = deps({ storedLocale: () => 'fr' });
    const offs = [installLanguageSync(out), installLanguageSync(same)];
    await i18n.changeLanguage('fr');
    expect(out.resetCache).toHaveBeenCalled();
    expect(out.persist).not.toHaveBeenCalled();
    expect(same.persist).not.toHaveBeenCalled();
    offs.forEach((off) => off());
  });

  it('is wired to the real store: a language change resets the clinic API cache', async () => {
    const spy = jest.spyOn(store, 'dispatch');
    await i18n.changeLanguage('ar');
    const types = spy.mock.calls.map(([a]) => (a as { type?: string }).type ?? '');
    expect(types.some((type) => type.includes('resetApiState'))).toBe(true);
    spy.mockRestore();
  });
});
