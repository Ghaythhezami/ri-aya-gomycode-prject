import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * AC-043, AC-044, AC-045 — the legacy self-signup is retired.
 *
 * The route must stay registered so existing clients still resolve it (FR-026),
 * but it must never create an identity (FR-036). This suite proves both halves:
 * the 410 response, and the absence of the account that would have been created.
 */
const PASSWORD = 'RetiredSignup123!';

describe('Signup retirement (e2e)', () => {
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

  const signupBody = {
    email: 'retired.signup@riaya.local',
    password: PASSWORD,
    firstName: 'Retired',
    lastName: 'Signup',
  };

  // TEST-007 → AC-045
  it('responds 410 Gone with the stable SIGNUP_RETIRED code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signupBody)
      .expect(410);

    expect(res.body.code).toBe('SIGNUP_RETIRED');
  });

  // TEST-008 → AC-045
  it('points the caller at the registration route', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...signupBody, email: 'retired.signup2@riaya.local' })
      .expect(410);

    expect(String(res.body.message)).toMatch(/auth\/register/i);
  });

  // TEST-009 → AC-043
  it('creates no identity at all — no row is written', async () => {
    await request(app.getHttpServer()).post('/api/auth/signup').send(signupBody).expect(410);

    // Asserted directly against the store rather than through a 401: an inactive
    // identity would also 401, so only the absence of the row proves FR-036.
    const row = await app
      .get(PrismaService)
      .user.findUnique({ where: { email: signupBody.email } });
    expect(row).toBeNull();
  });
});
