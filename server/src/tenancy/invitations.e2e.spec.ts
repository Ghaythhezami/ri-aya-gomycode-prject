import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * AC-015, AC-016, AC-017 — staff join a clinic only by invitation, with exactly
 * the invited role, and only the newest token per email+clinic can be used.
 */
const OWNER_PASSWORD = 'InviteOwner123!';
const INVITEE_PASSWORD = 'InviteStaff123!';

function tokenFrom(acceptUrl: string): string {
  return new URL(acceptUrl).searchParams.get('token') ?? '';
}

describe('Staff invitations (e2e)', () => {
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
        email: 'invite.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Invite',
        lastName: 'Owner',
        organizationName: 'Invite Org',
        clinicName: 'Invite Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invite.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // TEST-010 → AC-015
  it('issues an invitation token by email, never in the HTTP response', async () => {
    mail.sendInvitation.mockClear();
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invited.doctor@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);

    expect(res.body.invitationId).toBeDefined();
    expect(res.body.token).toBeUndefined();
    expect(mail.sendInvitation).toHaveBeenCalledTimes(1);

    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    expect(tokenFrom(acceptUrl)).toMatch(/^[a-f0-9]{64}$/);
  });

  // TEST-011 → AC-016
  it('grants exactly the invited role on acceptance', async () => {
    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invited.doctor2@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);
    const token = tokenFrom(mail.sendInvitation.mock.calls[0][0].acceptUrl as string);

    const accepted = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD, firstName: 'Invited', lastName: 'Doctor' })
      .expect(201);

    expect(accepted.body.role).toBe('DOCTOR');

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invited.doctor2@riaya.local', password: INVITEE_PASSWORD })
      .expect(201);

    expect(login.body.user.role).toBe('DOCTOR');
    expect(login.body.scope.clinicId).toBe(clinicId);
  });

  // TEST-012 → AC-017
  it('rejects a token that was already consumed', async () => {
    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invited.once@riaya.local', clinicId, role: 'RECEPTIONIST' })
      .expect(201);
    const token = tokenFrom(mail.sendInvitation.mock.calls[0][0].acceptUrl as string);

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD })
      .expect(400);

    expect(second.body.code).toBe('INVALID_INVITATION');
  });

  // TEST-013 → AC-017 (FR-031)
  it('revokes the earlier token when a newer invitation is issued for the same email', async () => {
    const email = 'invited.reissued@riaya.local';

    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, clinicId, role: 'DOCTOR' })
      .expect(201);
    const first = tokenFrom(mail.sendInvitation.mock.calls[0][0].acceptUrl as string);

    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, clinicId, role: 'CLINIC_ADMIN' })
      .expect(201);
    const second = tokenFrom(mail.sendInvitation.mock.calls[0][0].acceptUrl as string);

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token: first, password: INVITEE_PASSWORD })
      .expect(400);

    const accepted = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token: second, password: INVITEE_PASSWORD })
      .expect(201);

    // The newest invitation wins, including its role.
    expect(accepted.body.role).toBe('CLINIC_ADMIN');
  });

  // TEST-052 → AC-026
  it('AC-026: a valid invitation password makes the account usable and consumes the invitation', async () => {
    const email = 'invited.consumed@riaya.local';

    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, clinicId, role: 'DOCTOR' })
      .expect(201);
    const token = tokenFrom(mail.sendInvitation.mock.calls[0][0].acceptUrl as string);

    const accepted = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD, firstName: 'Consumed', lastName: 'Invitee' })
      .expect(201);
    expect(accepted.body.role).toBe('DOCTOR');

    // First half of AC-026: the credential just chosen works immediately.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: INVITEE_PASSWORD })
      .expect(201);
    expect(login.body.user.email).toBe(email);
    expect(login.body.user.role).toBe('DOCTOR');
    expect(login.body.scope.clinicId).toBe(clinicId);

    // Second half of AC-026: the invitation row itself is consumed, not merely
    // rejected because the email now exists.
    const prisma = app.get(PrismaService);
    const invitations = await prisma.invitation.findMany({ where: { clinicId } });
    const consumed = invitations.find((row) => row.email === email);
    expect(consumed).toBeDefined();
    expect(consumed?.consumedAt).toBeInstanceOf(Date);

    // A consumed invitation cannot be replayed into a second membership.
    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD })
      .expect(400);

    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) throw new Error('accept-invite did not create the identity');
    const memberships = await prisma.userMembership.findMany({ where: { userId: invitee.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('DOCTOR');
  });
});
