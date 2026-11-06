import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module';
import { configureApp } from '../../bootstrap';
import { MAIL_SERVICE } from '../../mail/mail.module';

/**
 * QA-2 / security headers: the real bootstrap (helmet, CORS, filter, pipes) on
 * top of AppModule, with the per-route limits switched to their production values.
 */
describe('API hardening (e2e)', () => {
  let app: INestApplication;
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    process.env.THROTTLE_STRICT = '1';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.THROTTLE_STRICT;
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function hammer(send: () => request.Test, allowed: number) {
    for (let i = 0; i < allowed; i += 1) {
      const res = await send();
      expect(res.status).not.toBe(429);
    }
    return send();
  }

  it('rate limits login (10/min) with 429, RATE_LIMITED and Retry-After', async () => {
    const res = await hammer(
      () =>
        request(server())
          .post('/api/auth/login')
          .send({ email: 'nobody@riaya.local', password: 'wrong-password' }),
      10,
    );
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rate limits booking (POST /appointments, 20/min) before authentication runs', async () => {
    const res = await hammer(() => request(server()).post('/api/appointments').send({}), 20);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('rate limits slot locks (POST /appointments/locks, 30/min)', async () => {
    const res = await hammer(() => request(server()).post('/api/appointments/locks').send({}), 30);
    expect(res.status).toBe(429);
  });

  it('rate limits refresh, forgot-password and the public check-in', async () => {
    const refresh = await hammer(() => request(server()).post('/api/auth/refresh'), 30);
    expect(refresh.status).toBe(429);

    const forgot = await hammer(
      () => request(server()).post('/api/auth/forgot-password').send({ email: 'a@b.co' }),
      5,
    );
    expect(forgot.status).toBe(429);

    const clinicId = randomUUID();
    const checkIn = await hammer(
      () =>
        request(server())
          .post(`/api/public/check-in/${clinicId}`)
          .send({ appointmentCode: 'AP-1001', phoneLast4: '1234' }),
      10,
    );
    expect(checkIn.status).toBe(429);
  });

  it('sends HSTS and no X-Powered-By, and only reflects allow-listed CORS origins', async () => {
    const res = await request(server())
      .get('/api/health')
      .set('Origin', 'http://localhost:5174')
      .expect(200);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174');

    const evil = await request(server()).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes only up/down on /api/health', async () => {
    const res = await request(server()).get('/api/health').expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['database', 'status']);
  });

  it('rejects an unsigned (alg: none) access token', async () => {
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: randomUUID(),
      email: 'x@y.z',
      exp: Math.floor(Date.now() / 1000) + 600,
    })}.`;
    await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('renders the Swagger UI and document', async () => {
    await request(server()).get('/api/docs').expect(200);
    const doc = await request(server()).get('/api/docs-json').expect(200);
    expect(Object.keys(doc.body.paths).length).toBeGreaterThan(20);
  });
});
