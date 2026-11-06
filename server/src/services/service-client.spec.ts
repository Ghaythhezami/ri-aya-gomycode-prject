import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ServiceClient } from './service-client';

const SECRET = 'x'.repeat(40);
const principal = { clinicId: 'clinic-1', userId: 'user-1', role: 'DOCTOR' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ServiceClient', () => {
  it('is disabled without a URL and refuses calls', async () => {
    const client = new ServiceClient({ audience: 'riaya-comms', baseUrl: '', secret: undefined });
    expect(client.enabled).toBe(false);
    await expect(client.request({ path: '/v1/x', principal })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('requires a 32+ character secret when configured', () => {
    expect(
      () => new ServiceClient({ audience: 'riaya-comms', baseUrl: 'http://x', secret: 'short' }),
    ).toThrow(/SERVICE_JWT_SECRET/);
  });

  it('sends a signed token whose tenant comes from the principal', async () => {
    const fetchImpl = jest.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
      jsonResponse(200, { ok: true }),
    );
    const client = new ServiceClient({
      audience: 'riaya-scheduler',
      baseUrl: 'http://scheduler/',
      secret: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.request<{ ok: boolean }>({
      path: '/v1/optimize',
      principal,
      body: { a: 1 },
      query: { skip: undefined, limit: 5 },
    });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://scheduler/v1/optimize?limit=5');
    const headers = init?.headers as Record<string, string>;
    const token = headers.authorization.replace('Bearer ', '');
    const claims = new JwtService({ secret: SECRET }).verify(token, {
      audience: 'riaya-scheduler',
      issuer: 'riaya-api',
    });
    expect(claims).toMatchObject({ sub: 'user-1', clinic_id: 'clinic-1', role: 'DOCTOR' });
    expect(claims.exp - claims.iat).toBe(60);
    expect(headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('keeps 4xx bodies and status', async () => {
    const client = new ServiceClient({
      audience: 'riaya-comms',
      baseUrl: 'http://comms',
      secret: SECRET,
      fetchImpl: (async () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'x' })) as unknown as typeof fetch,
    });
    const error = await client.request({ path: '/v1/a', principal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(404);
    expect((error as HttpException).getResponse()).toEqual({ code: 'NOT_FOUND', message: 'x' });
  });

  it('maps a rejected service token to 503, not 401', async () => {
    const client = new ServiceClient({
      audience: 'riaya-comms',
      baseUrl: 'http://comms',
      secret: SECRET,
      fetchImpl: (async () =>
        jsonResponse(401, { code: 'UNAUTHORIZED', message: 'x' })) as unknown as typeof fetch,
    });
    await expect(client.request({ path: '/v1/a', principal })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('opens the circuit after repeated failures and closes it after the open window', async () => {
    let now = 1_000;
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new ServiceClient({
      audience: 'riaya-comms',
      baseUrl: 'http://comms',
      secret: SECRET,
      failureThreshold: 2,
      openMs: 10_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });
    for (let i = 0; i < 2; i++) {
      await expect(client.request({ path: '/v1/a', principal })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
    expect(client.circuitOpen).toBe(true);
    await expect(client.request({ path: '/v1/a', principal })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    now += 10_001;
    expect(client.circuitOpen).toBe(false);
  });

  it('treats 5xx as unavailable', async () => {
    const client = new ServiceClient({
      audience: 'riaya-scheduler',
      baseUrl: 'http://s',
      secret: SECRET,
      fetchImpl: (async () => jsonResponse(500, { code: 'INTERNAL' })) as unknown as typeof fetch,
    });
    await expect(client.request({ path: '/v1/a', principal })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe('requestBuffer', () => {
    const make = (fetchImpl: unknown) =>
      new ServiceClient({
        audience: 'riaya-scheduler',
        baseUrl: 'http://s',
        secret: SECRET,
        fetchImpl: fetchImpl as typeof fetch,
      });

    it('returns the raw bytes and content type with a signed request', async () => {
      const bytes = Buffer.from('%PDF-1.4 fake');
      const fetchImpl = jest.fn(
        async (_url: URL | RequestInfo, _init?: RequestInit) =>
          new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
      );
      const result = await make(fetchImpl).requestBuffer({
        path: '/v1/reports/analytics',
        principal,
        body: { locale: 'en' },
        timeoutMs: 20_000,
      });
      expect(result.contentType).toBe('application/pdf');
      expect(result.buffer.equals(bytes)).toBe(true);
      const init = fetchImpl.mock.calls[0][1];
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
    });

    it('keeps 4xx bodies and maps 5xx and network errors to 503', async () => {
      await expect(
        make(async () => jsonResponse(422, { code: 'VALIDATION_FAILED' })).requestBuffer({
          path: '/v1/r',
          principal,
          body: {},
        }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        make(async () => jsonResponse(500, {})).requestBuffer({ path: '/v1/r', principal }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        make(async () => {
          throw new Error('boom');
        }).requestBuffer({ path: '/v1/r', principal }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('is refused when the service is disabled', async () => {
      const client = new ServiceClient({ audience: 'riaya-scheduler', baseUrl: '', secret: '' });
      await expect(client.requestBuffer({ path: '/v1/r', principal })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
