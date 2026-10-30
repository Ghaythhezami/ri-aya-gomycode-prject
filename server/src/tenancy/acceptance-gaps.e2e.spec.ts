import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { TokenBlacklistService } from '../cache/token-blacklist.service';
import { MAIL_SERVICE } from '../mail/mail.module';
import { REFRESH_COOKIE } from '../auth/auth.service';

/**
 * Acceptance criteria not covered by the behavioural suites:
 * TEST-034/AC-003, TEST-035/AC-010, TEST-036/AC-027, TEST-037/AC-028,
 * TEST-038/AC-030, TEST-039/AC-031, TEST-040/AC-032, TEST-041/AC-037,
 * TEST-042/AC-039, TEST-043/AC-021, TEST-044/AC-040.
 */
const PASSWORD = 'GapFiller123!';
const NEXT_PASSWORD = 'GapFiller456!';

function cookieValue(res: request.Response, name: string): string | undefined {
  const headers = res.headers['set-cookie'];
  const list = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const match = list.find((item) => item.startsWith(`${name}=`));
  return match?.split(';')[0].split('=')[1];
}

describe('Acceptance gaps (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let clinicId: string;
  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-change-me-32chars';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'gaps.owner@riaya.local',
        password: PASSWORD,
        firstName: 'Gap',
        lastName: 'Owner',
        organizationName: 'Gaps Org',
        clinicName: 'Gaps Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'gaps.owner@riaya.local', password: PASSWORD })
      .expect(201);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  // TEST-034 → AC-003
  it('reports a duplicate email as a field-level conflict', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'gaps.owner@riaya.local',
        password: PASSWORD,
        firstName: 'Dup',
        lastName: 'Owner',
        organizationName: 'Dup Org',
        clinicName: 'Dup Clinic',
      })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  // TEST-035 → AC-010
  it('provisions a second organization without a duplicate identity', async () => {
    const before = await app
      .get(PrismaService)
      .user.findUnique({ where: { email: 'gaps.owner@riaya.local' } });

    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ organizationName: 'Gaps Org Two', clinicName: 'Gaps Clinic Two' })
      .expect(201);

    expect(res.body.clinic.organizationId).toBe(res.body.organization.id);
    expect(res.body.membership.role).toBe('SUPER_ADMIN');

    const after = await app
      .get(PrismaService)
      .user.findUnique({ where: { email: 'gaps.owner@riaya.local' } });
    expect(after?.id).toBe(before?.id);
  });

  // TEST-036 → AC-027
  it('rejects a weak password when an invitee sets it', async () => {
    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'gaps.weak@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);
    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    const token = new URL(acceptUrl).searchParams.get('token') ?? '';

    // Long enough for the DTO's @MinLength(8) but failing the strength policy
    // (no uppercase, no symbol), so the service's WEAK_PASSWORD code is reached
    // rather than the generic validation error.
    const res = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: 'weakpass1' })
      .expect(400);

    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  // TEST-037 → AC-028
  it('issues a single-use password reset token', async () => {
    mail.sendPasswordReset.mockClear();
    const forgot = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'gaps.owner@riaya.local' })
      .expect(201);

    // The response never reveals whether the address exists.
    expect(forgot.body.success).toBe(true);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);

    const resetUrl = mail.sendPasswordReset.mock.calls[0][1] as string;
    const token = new URL(resetUrl).searchParams.get('token') ?? '';

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: NEXT_PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'AnotherPass789!' })
      .expect(400);
  });

  // TEST-038 → AC-030
  it('revokes other sessions when the password is changed', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'gaps.owner@riaya.local', password: NEXT_PASSWORD })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'gaps.owner@riaya.local', password: NEXT_PASSWORD })
      .expect(201);

    const otherCookie = cookieValue(second, REFRESH_COOKIE);
    expect(otherCookie).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .send({ currentPassword: NEXT_PASSWORD, newPassword: PASSWORD })
      .expect(201);

    // The other session's refresh token is now dead.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${otherCookie}`)
      .expect(401);
  });

  // TEST-039 → AC-031
  it('fails login closed when the security state store is unavailable', async () => {
    jest
      .spyOn(app.get(RedisCacheService), 'ttlStrict')
      .mockRejectedValue(
        new ServiceUnavailableException({ code: 'SECURITY_STATE_UNAVAILABLE', message: 'down' }),
      );

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'gaps.owner@riaya.local', password: PASSWORD })
      .expect(503);

    expect(res.body.code).toBe('SECURITY_STATE_UNAVAILABLE');
    expect(res.body.accessToken).toBeUndefined();

    jest.restoreAllMocks();
  });

  // TEST-040 → AC-032
  it('keeps serving ordinary reads while the security store is degraded', async () => {
    jest
      .spyOn(app.get(RedisCacheService), 'ttlStrict')
      .mockRejectedValue(new ServiceUnavailableException({ code: 'SECURITY_STATE_UNAVAILABLE' }));

    const health = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(health.body.database).toBe('up');
    expect(health.body.status).toBe('ok');

    jest.restoreAllMocks();
  });

  // TEST-041 → AC-037
  it('publishes the auth, invitation and workspace routes in the OpenAPI document', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const paths = Object.keys(document.paths);

    expect(paths.some((p) => p.endsWith('/auth/login'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/auth/register'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/auth/switch-workspace'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/invitations'))).toBe(true);
  });

  // TEST-042 → AC-039
  it('declares PostgreSQL and Redis with healthchecks in docker compose', () => {
    const compose = readFileSync(join(process.cwd(), '..', 'docker-compose.yml'), 'utf8');

    expect(compose).toMatch(/postgres:/);
    expect(compose).toMatch(/redis:/);
    expect(compose).toMatch(/healthcheck:/);
  });

  // TEST-043 → AC-021
  it('preserves audit history when a membership is suspended', async () => {
    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'gaps.suspend@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);
    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    const inviteToken = new URL(acceptUrl).searchParams.get('token') ?? '';

    const accepted = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token: inviteToken, password: 'GapsDoctor123!' })
      .expect(201);

    const membership = await app
      .get(PrismaService)
      .userMembership.findFirst({ where: { userId: accepted.body.userId, clinicId } });
    expect(membership?.id).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/memberships/${membership?.id}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const history = await app
      .get(PrismaService)
      .auditLog.findMany({ where: { entity: 'user_membership' } });

    expect(history.length).toBeGreaterThan(0);
    expect(history.some((row) => row.entityId.includes(accepted.body.userId))).toBe(true);
  });

  // TEST-044 → AC-040
  it('records a rotated refresh token in the revocation store', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'gaps.owner@riaya.local', password: PASSWORD })
      .expect(201);

    const raw = cookieValue(login, REFRESH_COOKIE);
    expect(raw).toBeDefined();
    const hash = createHash('sha256').update(String(raw)).digest('hex');

    const blacklist = app.get(TokenBlacklistService);
    expect(await blacklist.isRevoked(hash)).toBe(false);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${raw}`)
      .expect(201);

    expect(await blacklist.isRevoked(hash)).toBe(true);
  });
});
