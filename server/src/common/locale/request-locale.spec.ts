import { parseAcceptLanguage, RequestLocale } from './request-locale';
import { RequestLocaleMiddleware } from './request-locale.middleware';

describe('parseAcceptLanguage', () => {
  it.each([
    ['ar', 'ar'],
    ['fr-FR,fr;q=0.9,en;q=0.8', 'fr'],
    ['de-DE,de;q=0.9,ar;q=0.5', 'ar'],
    ['en;q=0.3, fr;q=0.8', 'fr'],
    ['AR-EG', 'ar'],
    ['de,es', null],
    ['*', null],
    ['fr;q=0', null],
    ['', null],
  ])('%s -> %s', (header, expected) => {
    expect(parseAcceptLanguage(header)).toBe(expected);
  });

  it('handles a missing header', () => {
    expect(parseAcceptLanguage(undefined)).toBeNull();
  });
});

describe('RequestLocale', () => {
  it('is null outside a request', () => {
    expect(RequestLocale.get()).toBeNull();
  });

  it('is set inside the middleware frame and survives async hops', async () => {
    const seen = await new Promise<string | null>((resolve) => {
      new RequestLocaleMiddleware().use(
        { headers: { 'accept-language': 'ar,en;q=0.5' } } as never,
        {} as never,
        () => {
          setTimeout(() => resolve(RequestLocale.get()), 1);
        },
      );
    });
    expect(seen).toBe('ar');
    expect(RequestLocale.get()).toBeNull();
  });
});
