import type { InternalAxiosRequestConfig } from 'axios';
import i18n from '../i18n';
import { api, setAccessToken } from './api';

type Handler = { fulfilled: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig };

function runRequestInterceptor() {
  const handlers = (api.interceptors.request as unknown as { handlers: Handler[] }).handlers;
  const config = { headers: {} } as unknown as InternalAxiosRequestConfig;
  return handlers.filter(Boolean).reduce((acc, h) => h.fulfilled(acc), config);
}

describe('Accept-Language on API calls', () => {
  afterEach(async () => {
    setAccessToken(null);
    await i18n.changeLanguage('en');
  });

  it.each(['en', 'ar', 'fr'])('sends the current UI language (%s)', async (lng) => {
    await i18n.changeLanguage(lng);
    expect(runRequestInterceptor().headers['Accept-Language']).toBe(lng);
  });

  it('reads the language at request time, so a switch applies without a reload', async () => {
    await i18n.changeLanguage('fr');
    expect(runRequestInterceptor().headers['Accept-Language']).toBe('fr');
    await i18n.changeLanguage('ar');
    expect(runRequestInterceptor().headers['Accept-Language']).toBe('ar');
  });
});
