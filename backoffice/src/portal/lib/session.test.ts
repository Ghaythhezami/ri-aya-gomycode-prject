import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import {
  getPortalAccessToken,
  portalHttp,
  refreshPortalSession,
  setPortalAccessToken,
  setPortalUnauthorizedHandler,
} from './session';

function response(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  return { data, status, statusText: String(status), headers: {}, config };
}

const AUTH = { accessToken: 'new-token', me: { accountId: 'a' } };

describe('portal session refresh', () => {
  const originalAdapter = portalHttp.defaults.adapter;
  afterEach(() => {
    portalHttp.defaults.adapter = originalAdapter;
    setPortalAccessToken(null);
    setPortalUnauthorizedHandler(null);
  });

  it('shares ONE refresh request between concurrent callers', async () => {
    const calls: string[] = [];
    const adapter: AxiosAdapter = async (config) => {
      calls.push(config.url ?? '');
      return response(config, 200, AUTH);
    };
    portalHttp.defaults.adapter = adapter;
    const [a, b] = await Promise.all([refreshPortalSession(), refreshPortalSession()]);
    expect(calls).toEqual(['/auth/refresh']);
    expect(a).toBe(b);
    expect(getPortalAccessToken()).toBe('new-token');
  });

  it('refreshes once on 401, retries with the new token and sends the portal base path', async () => {
    const seen: { url?: string; auth?: unknown }[] = [];
    setPortalAccessToken('expired');
    const adapter: AxiosAdapter = async (config) => {
      seen.push({ url: config.url, auth: config.headers.Authorization });
      if (config.url === '/auth/refresh') return response(config, 200, AUTH);
      if (config.headers.Authorization === 'Bearer expired') {
        return Promise.reject({
          isAxiosError: true,
          config,
          response: response(config, 401, { code: 'UNAUTHORIZED' }),
        });
      }
      return response(config, 200, { ok: true });
    };
    portalHttp.defaults.adapter = adapter;
    const result = await portalHttp.get('/me');
    expect(result.data).toEqual({ ok: true });
    expect(seen.map((s) => s.url)).toEqual(['/me', '/auth/refresh', '/me']);
    expect(seen[2]?.auth).toBe('Bearer new-token');
    expect(portalHttp.defaults.baseURL).toMatch(/\/api\/portal$/);
  });

  it('signs out (handler called, token cleared) when the refresh fails', async () => {
    const onUnauthorized = jest.fn();
    setPortalUnauthorizedHandler(onUnauthorized);
    setPortalAccessToken('expired');
    const adapter: AxiosAdapter = async (config) =>
      Promise.reject({
        isAxiosError: true,
        config,
        response: response(config, 401, { code: 'UNAUTHORIZED' }),
      });
    portalHttp.defaults.adapter = adapter;
    await expect(portalHttp.get('/me')).rejects.toBeDefined();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getPortalAccessToken()).toBeNull();
  });

  it('does not try to refresh a failed login', async () => {
    const calls: string[] = [];
    const adapter: AxiosAdapter = async (config) => {
      calls.push(config.url ?? '');
      return Promise.reject({
        isAxiosError: true,
        config,
        response: response(config, 401, { code: 'INVALID_CREDENTIALS' }),
      });
    };
    portalHttp.defaults.adapter = adapter;
    await expect(portalHttp.post('/auth/login', {})).rejects.toBeDefined();
    expect(calls).toEqual(['/auth/login']);
  });
});
