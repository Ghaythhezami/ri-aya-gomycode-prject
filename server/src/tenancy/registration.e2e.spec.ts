import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * AC-001, AC-002, AC-003, AC-018, AC-041, AC-042 — public registration creates an
 * active organization owner who can work immediately.
 *
 * The identity must carry NO role (FR-002); the SUPER_ADMIN grant lives on the
 * membership, and the credential payload must report that membership role (D13).
 */
const PASSWORD = 'OwnerSignup123!';

function newOwner(tag: string) {
  return {
    email: `owner.${tag}@riaya.local`,
    password: PASSWORD,
    firstName: 'Owner',
    lastName: tag,
    organizationName: `Org ${tag}`,
    clinicName: `Clinic ${tag}`,
  };
}

describe('Registration and owner onboarding (e2e)', () => {
  let app: INestApplication;
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
  });

  afterAll(async () => {
    await app.close();
  });

  // TEST-001 → AC-001
  it('creates identity, organization, first clinic and a SUPER_ADMIN membership', async () => {
    const body = newOwner('one');
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body)
      .expect(201);

    expect(res.body.user.email).toBe(body.email);
    expect(res.body.organization.name).toBe(body.organizationName);
    expect(res.body.clinic.name).toBe(body.clinicName);
    expect(res.body.clinic.organizationId).toBe(res.body.organization.id);
    expect(res.body.membership.role).toBe('SUPER_ADMIN');
    expect(res.body.membership.status).toBe('ACTIVE');

    // FR-002: the clinic-scoped role must NOT live on the identity.
    const identity = await app.get(PrismaService).user.findUnique({ where: { email: body.email } });
    expect(identity?.role ?? null).toBeNull();
  });

  // TEST-002 → AC-041
  it('signs the owner in immediately and reports the membership role', async () => {
    const body = newOwner('two');
    await request(app.getHttpServer()).post('/api/auth/register').send(body).expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(201);

    expect(login.body.accessToken).toBeDefined();
    // The identity role is NULL, so this value can only come from the membership
    // scope resolved at login (D13 regression guard).
    expect(login.body.user.role).toBe('SUPER_ADMIN');
    expect(login.body.scope.role).toBe('SUPER_ADMIN');
  });

  // TEST-003 → AC-042
  it('lists the created clinic as an active SUPER_ADMIN workspace', async () => {
    const body = newOwner('three');
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body)
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(201);

    const memberships = await request(app.getHttpServer())
      .get('/api/auth/memberships')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    const mine = memberships.body.find(
      (entry: { clinicId: string }) => entry.clinicId === registered.body.clinic.id,
    );
    expect(mine).toBeDefined();
    expect(mine.role).toBe('SUPER_ADMIN');
    expect(mine.clinicName).toBe(body.clinicName);
  });

  // TEST-004 → AC-002
  it('persists nothing when registration is rejected', async () => {
    const body = { ...newOwner('four'), password: 'tooweak' };
    await request(app.getHttpServer()).post('/api/auth/register').send(body).expect(400);

    const identity = await app.get(PrismaService).user.findUnique({ where: { email: body.email } });
    expect(identity).toBeNull();
  });

  // TEST-005 → AC-003
  it('rejects unknown fields instead of ignoring them', async () => {
    const body = { ...newOwner('five'), role: 'SUPER_ADMIN' };
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // TEST-006 → AC-018
  it('cannot be pointed at an existing clinic', async () => {
    const body = { ...newOwner('six'), clinicId: '00000000-0000-4000-8000-000000000001' };
    await request(app.getHttpServer()).post('/api/auth/register').send(body).expect(400);

    const identity = await app.get(PrismaService).user.findUnique({ where: { email: body.email } });
    expect(identity).toBeNull();
  });
});
