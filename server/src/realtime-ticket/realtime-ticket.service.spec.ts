import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RealtimeTicketService } from './realtime-ticket.service';

const SECRET = 'unit-test-secret-0123456789-abcdefghijklmnop';
const principal = { userId: 'u1', clinicId: 'c1', role: 'DOCTOR' };

const build = (env: Record<string, string | undefined>) =>
  new RealtimeTicketService({ get: (key: string) => env[key] } as unknown as ConfigService);

describe('RealtimeTicketService', () => {
  it('signs a 60 s HS256 ticket for riaya-realtime with sub, clinic_id, role and a jti', () => {
    const now = Date.now();
    const out = build({
      REALTIME_PUBLIC_URL: 'https://comms.example.test/',
      SERVICE_JWT_SECRET: SECRET,
    }).issue(principal, now);

    expect(out.url).toBe('https://comms.example.test');
    expect(out.path).toBe('/socket.io');
    expect(out.expiresAt).toBe(new Date(now + 60_000).toISOString());
    const claims = new JwtService({ secret: SECRET }).verify(out.ticket as string, {
      algorithms: ['HS256'],
      audience: 'riaya-realtime',
      issuer: 'riaya-api',
    });
    expect(claims).toMatchObject({ sub: 'u1', clinic_id: 'c1', role: 'DOCTOR' });
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp - claims.iat).toBe(60);
  });

  it('gives every ticket a different jti', () => {
    const svc = build({ REALTIME_PUBLIC_URL: 'https://c.test', SERVICE_JWT_SECRET: SECRET });
    const jwt = new JwtService({ secret: SECRET });
    const a = jwt.decode(svc.issue(principal).ticket as string);
    const b = jwt.decode(svc.issue(principal).ticket as string);
    expect(a.jti).not.toBe(b.jti);
  });

  it('returns a null ticket when REALTIME_PUBLIC_URL is missing', () => {
    expect(build({ SERVICE_JWT_SECRET: SECRET }).issue(principal)).toEqual({
      url: null,
      path: '/socket.io',
      ticket: null,
      expiresAt: null,
    });
  });

  it('returns a null ticket when the secret is missing or too short', () => {
    for (const secret of [undefined, 'short']) {
      const out = build({
        REALTIME_PUBLIC_URL: 'https://c.test',
        SERVICE_JWT_SECRET: secret,
      }).issue(principal);
      expect(out.ticket).toBeNull();
      expect(out.url).toBeNull();
    }
  });
});
