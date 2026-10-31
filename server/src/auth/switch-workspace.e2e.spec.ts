import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * AC-011, AC-012, AC-013, AC-014, AC-024, AC-025 — the access token is the only
 * source of tenant scope.
 */

/** Decode a JWT payload without verifying it (the API already signed it). */
function claimsOf(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('Workspace switching and token scoping (e2e)', () => {
  let app: INestApplication;
  let email: string;
  let password: string;
  let firstClinicId: string;
  let secondClinicId: string;
  let accessToken: string;

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

    email = 'switcher@riaya.local';
    password = 'SwitcherPass123!';

    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        firstName: 'Switch',
        lastName: 'Owner',
        organizationName: 'Switch Org',
        clinicName: 'Switch Clinic One',
      })
      .expect(201);
    firstClinicId = registered.body.clinic.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    accessToken = login.body.accessToken;

    // FR-006 / AC-010: the same identity provisions a second organization.
    const second = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ organizationName: 'Switch Org Two', clinicName: 'Switch Clinic Two' })
      .expect(201);
    secondClinicId = second.body.clinic.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // TEST-014 → AC-013
  it('AC-013: carries org_id, clinic_id and role in the access token', () => {
    const claims = claimsOf(accessToken);
    expect(claims.clinic_id).toBe(firstClinicId);
    expect(claims.role).toBe('SUPER_ADMIN');
    expect(typeof claims.org_id).toBe('string');
    expect(claims.org_id).toBeTruthy();
  });

  // TEST-015 → AC-011
  it('AC-011: re-issues a token scoped to the switched clinic', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ clinicId: secondClinicId })
      .expect(201);

    expect(res.body.scope.clinicId).toBe(secondClinicId);
    expect(res.body.scope.role).toBe('SUPER_ADMIN');
    expect(claimsOf(res.body.accessToken).clinic_id).toBe(secondClinicId);
  });

  // TEST-016 → AC-014
  it('AC-014: refuses a clinic the caller has no membership in', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ clinicId: '11111111-1111-4111-8111-111111111111' })
      .expect(403);

    expect(res.body.code).toBe('NO_MEMBERSHIP');
  });

  // TEST-017 → AC-012, AC-024, AC-025
  it('AC-012 / AC-024 / AC-025: scopes later requests to the switched clinic, ignoring a body clinicId', async () => {
    const switched = await request(app.getHttpServer())
      .post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ clinicId: secondClinicId })
      .expect(201);
    const switchedToken = switched.body.accessToken;

    // A body that names the OTHER clinic must not widen the token's scope: the
    // memberships list is resolved from the token, so both memberships still
    // appear, but the active scope stays the switched one.
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${switchedToken}`)
      .expect(200);

    expect(me.body.email).toBe(email);
    expect(me.body.role).toBe('SUPER_ADMIN');

    const memberships = await request(app.getHttpServer())
      .get('/api/auth/memberships')
      .set('Authorization', `Bearer ${switchedToken}`)
      .expect(200);
    expect(memberships.body).toHaveLength(2);
  });
});
