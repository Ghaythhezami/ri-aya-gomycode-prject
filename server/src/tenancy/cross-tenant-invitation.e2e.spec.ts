import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * Cross-tenant staff invitations.
 *
 * FR-007 lets an admin invite staff into a clinic, but the clinic MUST be one
 * the caller's token scope already covers. `clinicId` travels in the request
 * body, so it is attacker-controlled: a foreign clinic's id must be rejected,
 * never turned into an invitation that carries another organization's id.
 *
 * FR-033 is the same rule at the onboarding boundary: you can never attach
 * yourself to a clinic you were not invited to.
 */
const ADMIN_PASSWORD = 'CrossInviteAdmin123!';

describe('Cross-tenant staff invitation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let ownClinicId: string;
  let foreignClinicId: string;
  let foreignOrgId: string;

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
    prisma = app.get(PrismaService);

    // Organization A: the caller, a SUPER_ADMIN of their own organization.
    const own = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'cross.invite.admin@riaya.local',
        password: ADMIN_PASSWORD,
        firstName: 'Cross',
        lastName: 'InviteAdmin',
        organizationName: 'Cross Invite Org A',
        clinicName: 'Cross Invite Clinic A',
      })
      .expect(201);
    ownClinicId = own.body.clinic.id;

    // Organization B: a completely separate tenant with its own clinic.
    const foreign = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'cross.invite.outsider@riaya.local',
        password: ADMIN_PASSWORD,
        firstName: 'Cross',
        lastName: 'Outsider',
        organizationName: 'Cross Invite Org B',
        clinicName: 'Cross Invite Clinic B',
      })
      .expect(201);
    foreignClinicId = foreign.body.clinic.id;
    // The foreign organization is found through its only clinic: the tenant is
    // what must stay untouched, not just the clinic row.
    const foreignClinic = await prisma.clinic.findUnique({ where: { id: foreignClinicId } });
    if (!foreignClinic) throw new Error('Foreign clinic was not created');
    foreignOrgId = foreignClinic.organizationId;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'cross.invite.admin@riaya.local', password: ADMIN_PASSWORD })
      .expect(201);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses to invite staff into a clinic of another organization', async () => {
    mail.sendInvitation.mockClear();

    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'cross.invite.victim@riaya.local',
        clinicId: foreignClinicId,
        role: 'DOCTOR',
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CLINIC_NOT_FOUND');

    // Nothing may reach the foreign tenant: no row, and no email.
    const leaked = await prisma.invitation.findMany({
      where: { clinicId: foreignClinicId, email: 'cross.invite.victim@riaya.local' },
    });
    expect(leaked).toHaveLength(0);
    expect(mail.sendInvitation).not.toHaveBeenCalled();
  });

  it('still issues an invitation inside the caller’s own clinic', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'cross.invite.peer@riaya.local', clinicId: ownClinicId, role: 'DOCTOR' })
      .expect(201);

    expect(res.body.invitationId).toBeDefined();

    const created = await prisma.invitation.findMany({
      where: { clinicId: ownClinicId, email: 'cross.invite.peer@riaya.local' },
    });
    expect(created).toHaveLength(1);
  });

  it('leaves the foreign organization untouched', async () => {
    const foreignInvitations = await prisma.invitation.findMany({
      where: { organizationId: foreignOrgId },
    });
    expect(foreignInvitations).toHaveLength(0);
  });
});
