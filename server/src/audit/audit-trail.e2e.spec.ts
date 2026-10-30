import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * AC-019, AC-020 — every mutation is recorded in an append-only trail written
 * inside the same transaction as the mutation itself.
 */
const PASSWORD = 'AuditOwner123!';

describe('Audit trail (e2e)', () => {
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

  // TEST-021 → AC-019
  it('records an entry for the organization, the clinic and the membership', async () => {
    const body = {
      email: 'audit.owner@riaya.local',
      password: PASSWORD,
      firstName: 'Audit',
      lastName: 'Owner',
      organizationName: 'Audit Org',
      clinicName: 'Audit Clinic',
    };

    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body)
      .expect(201);

    const logs = await app
      .get(PrismaService)
      .auditLog.findMany({ where: { actorUserId: res.body.user.id } });

    const entities = logs.map((entry) => entry.entity).sort();
    expect(entities).toEqual(['clinic', 'organization', 'user_membership']);
  });

  // TEST-022 → AC-019
  it('captures actor, action and the after-state of the change', async () => {
    const logs = await app.get(PrismaService).auditLog.findMany({
      where: { entity: 'organization' },
    });
    const entry = logs.find((row) => (row.after as { name?: string })?.name === 'Audit Org');

    expect(entry).toBeDefined();
    expect(entry?.action).toBe('create');
    expect(entry?.entityId).toBeTruthy();
    expect(entry?.organizationId).toBeTruthy();
    expect(entry?.clinicId).toBeTruthy();
  });

  // TEST-023 → AC-020
  it('writes nothing when the mutation is rejected', async () => {
    const before = await app.get(PrismaService).auditLog.findMany({});

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'audit.rejected@riaya.local',
        password: 'weak',
        firstName: 'No',
        lastName: 'Audit',
        organizationName: 'Rejected Org',
        clinicName: 'Rejected Clinic',
      })
      .expect(400);

    const after = await app.get(PrismaService).auditLog.findMany({});
    expect(after).toHaveLength(before.length);
  });

  // TEST-024 → AC-019 (scoping)
  it('scopes clinic entries to their organization and clinic', async () => {
    const logs = await app.get(PrismaService).auditLog.findMany({ where: { entity: 'clinic' } });

    expect(logs.length).toBeGreaterThan(0);
    for (const entry of logs) {
      expect(entry.organizationId).toBeTruthy();
      expect(entry.clinicId).toBeTruthy();
    }
  });
});
