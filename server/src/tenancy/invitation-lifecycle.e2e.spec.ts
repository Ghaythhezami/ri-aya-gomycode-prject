import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * v2 invitation lifecycle: delivery outcomes, status derivation, cancel,
 * decline, link scope and the stored-record authority rule.
 */
const OWNER_PASSWORD = 'LifecycleOwner123!';
const INVITEE_PASSWORD = 'LifecycleStaff123!';

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  displayStatus: string;
  deliveryStatus: string;
  expiresAt: string;
}

function tokenFrom(acceptUrl: string): string {
  return new URL(acceptUrl).searchParams.get('token') ?? '';
}

describe('Invitation lifecycle (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let ownerId: string;
  let clinicId: string;
  let organizationId: string;
  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue({ status: 'SENT' }),
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
        email: 'lifecycle.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Lifecycle',
        lastName: 'Owner',
        organizationName: 'Lifecycle Org',
        clinicName: 'Lifecycle Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;
    organizationId = owner.body.organization.id;
    ownerId = owner.body.user.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'lifecycle.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function issueRaw(
    email: string,
    outcome: { status: string; error?: string },
    role = 'DOCTOR',
  ) {
    mail.sendInvitation.mockReset();
    mail.sendInvitation.mockResolvedValue(outcome);
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, clinicId, role })
      .expect(201);
    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    return { res, id: res.body.invitationId as string, token: tokenFrom(acceptUrl), acceptUrl };
  }

  async function issue(email: string, role = 'DOCTOR') {
    return issueRaw(email, { status: 'SENT' }, role);
  }

  async function list(): Promise<InvitationRow[]> {
    const res = await request(app.getHttpServer())
      .get('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    return res.body as InvitationRow[];
  }

  async function acceptNew(token: string) {
    return request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({
        token,
        password: INVITEE_PASSWORD,
        firstName: 'Lifecycle',
        lastName: 'Invitee',
      })
      .expect(201);
  }

  it('AC-048: persists SENT and FAILED delivery outcomes so the directory can tell them apart', async () => {
    const sent = await issue('lifecycle.sent@riaya.local');
    const failed = await issueRaw('lifecycle.failed@riaya.local', {
      status: 'FAILED',
      error: 'SMTP down',
    });

    expect(sent.res.body.deliveryStatus).toBe('SENT');
    expect(failed.res.body.deliveryStatus).toBe('FAILED');

    const rows = await list();
    expect(rows.find((row) => row.id === sent.id)?.deliveryStatus).toBe('SENT');
    expect(rows.find((row) => row.id === failed.id)?.deliveryStatus).toBe('FAILED');
  });

  it('AC-049: a failed SMTP send leaves the invitation PENDING with a failed outcome', async () => {
    const { id, res } = await issueRaw('lifecycle.delivery-failure@riaya.local', {
      status: 'FAILED',
      error: 'SMTP unreachable',
    });

    expect(res.status).toBe(201);
    expect(res.body.deliveryStatus).toBe('FAILED');
    const row = (await list()).find((item) => item.id === id);
    expect(row?.status).toBe('PENDING');
    expect(row?.deliveryStatus).toBe('FAILED');
  });

  it('AC-051: an expired PENDING invitation is reported as EXPIRED without a write', async () => {
    const prisma = app.get(PrismaService);
    const { id, token } = await issue('lifecycle.expired@riaya.local');
    await prisma.invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const row = (await list()).find((item) => item.id === id);
    expect(row?.status).toBe('PENDING');
    expect(row?.displayStatus).toBe('EXPIRED');

    await request(app.getHttpServer()).get(`/api/invitations/${token}`).expect(400);
  });

  it('AC-052: an accepted invitation stays ACCEPTED and cannot be cancelled or declined', async () => {
    const email = 'lifecycle.accepted@riaya.local';
    const { id, token } = await issue(email);
    await acceptNew(token);

    const row = (await list()).find((item) => item.id === id);
    expect(row?.displayStatus).toBe('ACCEPTED');

    const cancel = await request(app.getHttpServer())
      .patch(`/api/invitations/${id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(cancel.body.code).toBe('INVITATION_NOT_PENDING');

    const decline = await request(app.getHttpServer())
      .post(`/api/invitations/${token}/decline`)
      .send({ token })
      .expect(400);
    expect(decline.body.code).toBe('INVALID_INVITATION');

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD })
      .expect(400);
  });

  it('AC-053: cancelling a PENDING invitation invalidates its token', async () => {
    const { id, token } = await issue('lifecycle.cancelled@riaya.local');

    await request(app.getHttpServer())
      .patch(`/api/invitations/${id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const row = (await list()).find((item) => item.id === id);
    expect(row?.displayStatus).toBe('CANCELLED');

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/invitations/${token}/decline`)
      .send({ token })
      .expect(400);
  });

  it('AC-054: cancellation writes an audit row with the actor and before/after status', async () => {
    const prisma = app.get(PrismaService);
    const { id } = await issue('lifecycle.cancel-audit@riaya.local');

    await request(app.getHttpServer())
      .patch(`/api/invitations/${id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const entries = await prisma.auditLog.findMany({
      where: { entity: 'invitation', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    const entry = entries.find((item) => item.action === 'update');
    expect(entry).toBeDefined();
    expect(entry?.actorUserId).toBe(ownerId);
    const before = entry?.before as unknown as { status?: string };
    const after = entry?.after as unknown as { status?: string };
    expect(before.status).toBe('PENDING');
    expect(after.status).toBe('CANCELLED');
  });

  it('AC-055: cancelling a non-PENDING invitation is refused without a state change', async () => {
    const acceptedEmail = 'lifecycle.cancel-accepted@riaya.local';
    const accepted = await issue(acceptedEmail);
    await acceptNew(accepted.token);

    const acceptedCancel = await request(app.getHttpServer())
      .patch(`/api/invitations/${accepted.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(acceptedCancel.body.code).toBe('INVITATION_NOT_PENDING');
    expect((await list()).find((row) => row.id === accepted.id)?.displayStatus).toBe('ACCEPTED');

    const cancelled = await issue('lifecycle.cancel-twice@riaya.local');
    await request(app.getHttpServer())
      .patch(`/api/invitations/${cancelled.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const secondCancel = await request(app.getHttpServer())
      .patch(`/api/invitations/${cancelled.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(secondCancel.body.code).toBe('INVITATION_NOT_PENDING');
    expect((await list()).find((row) => row.id === cancelled.id)?.displayStatus).toBe('CANCELLED');
  });

  it('AC-056: declining a valid invitation sets REJECTED and invalidates the token', async () => {
    const { id, token } = await issue('lifecycle.declined@riaya.local');

    await request(app.getHttpServer())
      .post(`/api/invitations/${token}/decline`)
      .send({ token })
      .expect(201);

    const row = (await list()).find((item) => item.id === id);
    expect(row?.displayStatus).toBe('REJECTED');

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: INVITEE_PASSWORD })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/invitations/${token}/decline`)
      .send({ token })
      .expect(400);
  });

  it('AC-057: a declined invitation lists REJECTED and a new invitation can be issued', async () => {
    const email = 'lifecycle.reinvite@riaya.local';
    const first = await issue(email);
    await request(app.getHttpServer())
      .post(`/api/invitations/${first.token}/decline`)
      .send({ token: first.token })
      .expect(201);

    expect((await list()).find((row) => row.id === first.id)?.displayStatus).toBe('REJECTED');

    const second = await issue(email);
    expect(second.res.body.invitationId).toBeDefined();
    const accepted = await acceptNew(second.token);
    expect(accepted.body.role).toBe('DOCTOR');
  });

  it('AC-061: the invite link carries token, organization, clinic and role', async () => {
    const { acceptUrl, res } = await issue('lifecycle.link@riaya.local', 'RECEPTIONIST');
    const url = new URL(acceptUrl);

    expect(tokenFrom(acceptUrl)).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get('organizationId')).toBe(organizationId);
    expect(url.searchParams.get('clinicId')).toBe(clinicId);
    expect(url.searchParams.get('role')).toBe('RECEPTIONIST');
    expect(res.body.token).toBeUndefined();
  });

  it('AC-064: the stored invitation wins over tampered link claims', async () => {
    const { token } = await issue('lifecycle.tampered@riaya.local', 'DOCTOR');

    const resolved = await request(app.getHttpServer())
      .get(
        `/api/invitations/${token}?organizationId=evil-org&clinicId=evil-clinic&role=SUPER_ADMIN`,
      )
      .expect(200);
    expect(resolved.body.organizationId).toBe(organizationId);
    expect(resolved.body.clinicId).toBe(clinicId);
    expect(resolved.body.role).toBe('DOCTOR');

    const accepted = await acceptNew(token);
    expect(accepted.body.organizationId).toBe(organizationId);
    expect(accepted.body.clinicId).toBe(clinicId);
    expect(accepted.body.role).toBe('DOCTOR');
  });
});
