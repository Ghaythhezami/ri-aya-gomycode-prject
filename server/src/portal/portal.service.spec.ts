import { CAPABILITY_KEY } from '../common/decorators/capability.decorator';
import { PatientContext } from './auth/patient-context';
import { PortalService } from './portal.service';
import { StaffInviteController } from './staff-invite.controller';
import { StaffInviteService } from './staff-invite.service';
import { TenantContext } from '../tenancy/tenant-context';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

interface Row {
  [k: string]: any;
}

const CLINIC = 'clinic-1';
const ME = { accountId: 'acc-1', patientId: 'pat-1', clinicId: CLINIC, locale: 'en' as const };
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);

const doctor = {
  id: 'doc-1',
  firstName: 'Lina',
  lastName: 'Aoun',
  firstNameI18n: {},
  lastNameI18n: {},
  specialty: 'Cardiology',
};

function appt(over: Row = {}): Row {
  return {
    id: 'ap-1',
    code: 'AP-1001',
    clinicId: CLINIC,
    patientId: 'pat-1',
    doctorId: 'doc-1',
    doctor,
    type: 'CONSULTATION',
    startsAt: hoursFromNow(48),
    endsAt: hoursFromNow(48.5),
    status: 'SCHEDULED',
    reason: null,
    ...over,
  };
}

function setup(
  rows: Row[] = [appt()],
  over: { open?: number; emergency?: boolean; verified?: boolean; busy?: boolean } = {},
) {
  const prisma: Row = {
    clinic: { findUnique: jest.fn(async () => ({ organizationId: 'org-1' })) },
    clinicSettings: {
      findUnique: jest.fn(async () => ({
        patientPortalEnabled: true,
        cancellationNoticeHours: 24,
        defaultLanguage: 'en',
      })),
    },
    patientAccount: {
      findFirst: jest.fn(async () => ({
        emailVerifiedAt: (over.verified ?? true) ? new Date() : null,
      })),
    },
    appointment: {
      // Every portal read filters by the token's clinic and patient; the fake honours that.
      findFirst: jest.fn(
        async ({ where }: Row) =>
          rows.find(
            (r) =>
              r.id === where.id && r.clinicId === where.clinicId && r.patientId === where.patientId,
          ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: Row) =>
        rows.filter((r) => r.clinicId === where.clinicId && r.patientId === where.patientId),
      ),
      count: jest.fn(async () => over.open ?? 0),
    },
    $transactionWith: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
  const patient = new PatientContext();
  patient.set(ME);
  const tenant = new TenantContext();
  const types = {
    requireActive: jest.fn(async (_c: string, code: string) => ({
      code,
      isEmergency: over.emergency ?? code === 'EMERGENCY',
    })),
    byCode: jest.fn(async () => new Map([['CONSULTATION', { displayName: 'Consultation' }]])),
  };
  const appointments = {
    create: jest.fn(async () => ({ id: 'ap-1' })),
    cancel: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const redis = {
    incrementStrict: jest.fn(async () => (over.busy ? 2 : 1)),
    delStrict: jest.fn(async () => undefined),
  };
  const service = new PortalService(
    prisma as never,
    patient,
    tenant,
    {} as never,
    appointments as never,
    {} as never,
    types as never,
    audit as never,
    redis as never,
  );
  return { service, prisma, appointments, types, tenant, audit, redis };
}

describe('PortalService scoping', () => {
  it('lists only appointments of the token patient and clinic', async () => {
    const { service, prisma } = setup([appt(), appt({ id: 'ap-2', patientId: 'pat-2' })]);
    const out = await service.listAppointments({ scope: 'upcoming' });
    expect(out.map((a) => a.id)).toEqual(['ap-1']);
    expect(prisma.appointment.findMany.mock.calls[0][0].where).toMatchObject({
      clinicId: CLINIC,
      patientId: 'pat-1',
    });
  });

  it('answers 404 for another patient appointment on cancel and reschedule', async () => {
    const { service, appointments } = setup([appt({ id: 'ap-9', patientId: 'pat-2' })]);
    await expect(service.cancel('ap-9', {})).rejects.toMatchObject({ status: 404 });
    await expect(
      service.reschedule('ap-9', { startsAt: hoursFromNow(72).toISOString() }),
    ).rejects.toMatchObject({ status: 404 });
    expect(appointments.cancel).not.toHaveBeenCalled();
    expect(appointments.update).not.toHaveBeenCalled();
  });

  it('answers 404 for an appointment of another clinic', async () => {
    const { service } = setup([appt({ id: 'ap-8', clinicId: 'clinic-2' })]);
    await expect(service.cancel('ap-8', {})).rejects.toMatchObject({ status: 404 });
  });

  it('computes canChange from status and the clinic notice period', async () => {
    const { service } = setup([
      appt({ id: 'far' }),
      appt({ id: 'near', startsAt: hoursFromNow(5), endsAt: hoursFromNow(5.5) }),
      appt({ id: 'done', status: 'COMPLETED' }),
    ]);
    const out = Object.fromEntries(
      (await service.listAppointments({})).map((a) => [a.id, a.canChange]),
    );
    expect(out).toEqual({ far: true, near: false, done: false });
  });
});

describe('PortalService booking', () => {
  const dto = (over: Row = {}) =>
    ({
      doctorId: 'doc-1',
      type: 'CONSULTATION',
      startsAt: hoursFromNow(72).toISOString(),
      ...over,
    }) as never;

  it('books through the staff service with the token patient and source PORTAL', async () => {
    const { service, appointments, tenant } = setup();
    let seen: unknown;
    appointments.create.mockImplementationOnce(async () => {
      seen = tenant.get();
      return { id: 'ap-1' };
    });
    // The tenant middleware opens the request frame the service then fills.
    const out = await new Promise<{ id: string }>((resolve, reject) =>
      tenant.runWithFrame(() => {
        service.book(dto({ reason: 'check-up' })).then(resolve, reject);
      }),
    );
    expect(out.id).toBe('ap-1');
    expect(appointments.create).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'pat-1', doctorId: 'doc-1', reason: 'check-up' }),
      { source: 'PORTAL' },
    );
    expect(seen).toMatchObject({ clinicId: CLINIC, userId: 'portal:acc-1' });
  });

  it('ignores a patientId smuggled in the body', async () => {
    const { service, appointments } = setup();
    await service.book(dto({ patientId: 'pat-2' }));
    expect((appointments.create.mock.calls[0] as unknown[])[0]).toMatchObject({
      patientId: 'pat-1',
    });
  });

  it('rejects emergency types without booking', async () => {
    const { service, appointments } = setup();
    await expect(service.book(dto({ type: 'EMERGENCY' }))).rejects.toMatchObject({ status: 422 });
    expect(appointments.create).not.toHaveBeenCalled();
  });

  it('rejects a fourth upcoming appointment and a past start', async () => {
    const full = setup([appt()], { open: 3 });
    await expect(full.service.book(dto())).rejects.toMatchObject({
      status: 409,
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(full.appointments.create).not.toHaveBeenCalled();
    const past = setup();
    await expect(
      past.service.book(dto({ startsAt: hoursFromNow(-1).toISOString() })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lets an unverified account hold only one upcoming appointment', async () => {
    const one = setup([appt()], { open: 1, verified: false });
    await expect(one.service.book(dto())).rejects.toMatchObject({
      status: 409,
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(one.appointments.create).not.toHaveBeenCalled();
    const verified = setup([appt()], { open: 1, verified: true });
    await expect(verified.service.book(dto())).resolves.toBeDefined();
    const none = setup([appt()], { open: 0, verified: false });
    await expect(none.service.book(dto())).resolves.toBeDefined();
  });

  it('serialises the booking cap with a per-patient lock and releases it', async () => {
    const busy = setup([appt()], { busy: true });
    await expect(busy.service.book(dto())).rejects.toMatchObject({
      status: 409,
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(busy.appointments.create).not.toHaveBeenCalled();
    expect(busy.redis.incrementStrict).toHaveBeenCalledWith('portal:booking:pat-1', 10);

    const ok = setup();
    await ok.service.book(dto());
    expect(ok.redis.delStrict).toHaveBeenCalledWith('portal:booking:pat-1');
    const full = setup([appt()], { open: 3 });
    await expect(full.service.book(dto())).rejects.toMatchObject({ status: 409 });
    expect(full.redis.delStrict).toHaveBeenCalledWith('portal:booking:pat-1');
  });

  it('propagates SLOT_CONFLICT from the booking service', async () => {
    const { service, appointments } = setup();
    appointments.create.mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { status: 409, response: { code: 'SLOT_CONFLICT' } }),
    );
    await expect(service.book(dto())).rejects.toMatchObject({
      response: { code: 'SLOT_CONFLICT' },
    });
  });
});

describe('PortalService cancel and reschedule notice', () => {
  it('refuses to cancel or reschedule inside the notice with CANCELLATION_POLICY', async () => {
    const near = appt({ startsAt: hoursFromNow(5), endsAt: hoursFromNow(5.5) });
    const { service, appointments } = setup([near]);
    await expect(service.cancel('ap-1', {})).rejects.toMatchObject({
      status: 409,
      response: { code: 'CANCELLATION_POLICY' },
    });
    await expect(
      service.reschedule('ap-1', { startsAt: hoursFromNow(90).toISOString() }),
    ).rejects.toMatchObject({ response: { code: 'CANCELLATION_POLICY' } });
    expect(appointments.cancel).not.toHaveBeenCalled();
  });

  it('cancels and reschedules an own appointment outside the notice, with an audit row', async () => {
    const { service, appointments, audit } = setup();
    await service.cancel('ap-1', { reason: 'travelling' });
    expect(appointments.cancel).toHaveBeenCalledWith('ap-1', 'travelling');
    const startsAt = hoursFromNow(96).toISOString();
    await service.reschedule('ap-1', { startsAt });
    expect(appointments.update).toHaveBeenCalledWith('ap-1', { startsAt });
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('does not change an appointment that is already completed', async () => {
    const { service } = setup([appt({ status: 'COMPLETED' })]);
    await expect(service.cancel('ap-1', {})).rejects.toMatchObject({
      response: { code: 'ILLEGAL_TRANSITION' },
    });
  });
});

describe('Staff portal invite', () => {
  function inviteSetup(patient: Row | null) {
    const created: Row[] = [];
    const revoked: Row[] = [];
    const prisma: Row = {
      patient: { findFirst: jest.fn(async () => patient) },
      $transactionWith: jest.fn(async (fn: (tx: Row) => unknown) =>
        fn({
          patientInvite: {
            updateMany: jest.fn(async (args: Row) => {
              revoked.push(args);
              return { count: 1 };
            }),
            create: jest.fn(async ({ data }: Row) => {
              created.push(data);
              return { id: 'inv-1', ...data };
            }),
          },
        }),
      ),
    };
    const tenant = new TenantContext();
    tenant.set({
      userId: 'user-1',
      organizationId: 'org-1',
      clinicId: CLINIC,
      role: 'RECEPTIONIST',
      membershipId: 'm-1',
    });
    const audit = { record: jest.fn(async () => undefined) };
    const service = new StaffInviteService(
      prisma as never,
      tenant,
      audit as never,
      new ConfigService({ BACKOFFICE_URL: 'https://app.example' }),
    );
    return { service, created, revoked, prisma, audit };
  }

  it('returns a 7-day url and stores only the token hash', async () => {
    const { service, created, audit } = inviteSetup({ id: 'pat-1', portalAccount: null });
    const out = await service.invite('pat-1');
    const token = new URL(out.url).hash.replace('#token=', '');
    expect(out.url.startsWith('https://app.example/portal/invite#token=')).toBe(true);
    expect(new URL(out.url).search).toBe('');
    expect(created[0]!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(created[0])).not.toContain(token);
    const days = (new Date(out.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    expect(audit.record).toHaveBeenCalled();
  });

  it('revokes the earlier open invites of the patient when a new one is issued', async () => {
    const { service, revoked } = inviteSetup({ id: 'pat-1', portalAccount: null });
    await service.invite('pat-1');
    expect(revoked[0]).toMatchObject({
      where: { patientId: 'pat-1', clinicId: CLINIC, consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('409 when the patient already has an account, 404 for another clinic patient', async () => {
    await expect(
      inviteSetup({ id: 'pat-1', portalAccount: { id: 'a' } }).service.invite('pat-1'),
    ).rejects.toMatchObject({ status: 409 });
    const { service, prisma } = inviteSetup(null);
    await expect(service.invite('pat-x')).rejects.toMatchObject({ status: 404 });
    expect(prisma.patient.findFirst.mock.calls[0][0].where).toMatchObject({ clinicId: CLINIC });
  });

  it('is limited to the manageAppointments capability', () => {
    expect(Reflect.getMetadata(CAPABILITY_KEY, StaffInviteController.prototype.invite)).toBe(
      'manageAppointments',
    );
  });
});

describe('Staff portal status and verify', () => {
  function statusSetup(patient: Row | null) {
    const updates: Row[] = [];
    const prisma: Row = {
      patient: { findFirst: jest.fn(async () => patient) },
      $transactionWith: jest.fn(async (fn: (tx: Row) => unknown) =>
        fn({
          patientAccount: {
            update: jest.fn(async (args: Row) => {
              updates.push(args);
              patient!.portalAccount.emailVerifiedAt = args.data.emailVerifiedAt;
            }),
          },
        }),
      ),
    };
    const tenant = new TenantContext();
    tenant.set({
      userId: 'user-1',
      organizationId: 'org-1',
      clinicId: CLINIC,
      role: 'RECEPTIONIST',
      membershipId: 'm-1',
    });
    const audit = { record: jest.fn(async () => undefined) };
    const service = new StaffInviteService(
      prisma as never,
      tenant,
      audit as never,
      new ConfigService({}),
    );
    return { service, updates, audit, prisma };
  }
  const account = () => ({
    id: 'acc-1',
    email: 'a@b.c',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    emailVerifiedAt: null,
  });

  it('reports the portal status of a patient, scoped to the clinic', async () => {
    const { service, prisma } = statusSetup({
      id: 'pat-1',
      source: 'PORTAL',
      possibleDuplicateOfId: 'pat-0',
      portalAccount: account(),
    });
    await expect(service.status('pat-1')).resolves.toEqual({
      hasAccount: true,
      verified: false,
      email: 'a@b.c',
      createdAt: '2026-11-01T00:00:00.000Z',
      source: 'PORTAL',
      possibleDuplicateOfId: 'pat-0',
    });
    expect(prisma.patient.findFirst.mock.calls[0][0].where).toMatchObject({ clinicId: CLINIC });
    const none = statusSetup({ id: 'pat-2', source: 'STAFF', portalAccount: null });
    await expect(none.service.status('pat-2')).resolves.toMatchObject({
      hasAccount: false,
      verified: false,
      email: null,
      source: 'STAFF',
    });
  });

  it('verifies the account (emailVerifiedAt) with an audit row, and answers 404 without an account', async () => {
    const { service, updates, audit } = statusSetup({
      id: 'pat-1',
      source: 'PORTAL',
      possibleDuplicateOfId: null,
      portalAccount: account(),
    });
    const out = await service.verify('pat-1');
    expect(out.verified).toBe(true);
    expect(updates[0]).toMatchObject({
      where: { id: 'acc-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'patient_account', action: 'update' }),
    );
    const missing = statusSetup({ id: 'pat-3', source: 'STAFF', portalAccount: null });
    await expect(missing.service.verify('pat-3')).rejects.toMatchObject({ status: 404 });
    const unknown = statusSetup(null);
    await expect(unknown.service.verify('x')).rejects.toMatchObject({ status: 404 });
  });

  it('both routes are limited to the manageAppointments capability', () => {
    for (const method of ['status', 'verify'] as const) {
      expect(Reflect.getMetadata(CAPABILITY_KEY, StaffInviteController.prototype[method])).toBe(
        'manageAppointments',
      );
    }
  });
});

describe('PortalService summary', () => {
  it('returns the patient-facing text only and null when there is none', async () => {
    const { service, prisma } = setup();
    prisma.patientSummary = { findFirst: jest.fn() };
    prisma.user = { findUnique: jest.fn(async () => null) };
    prisma.patientSummary.findFirst.mockResolvedValueOnce({
      id: 's1',
      content: 'CLINICIAN ONLY',
      patientContent: 'Plain words',
      publishedAt: new Date(),
      createdAt: new Date(),
      authorId: 'u1',
    });
    await expect(service.summary()).resolves.toMatchObject({ id: 's1', content: 'Plain words' });
    expect(prisma.patientSummary.findFirst.mock.calls[0][0].where.patientContent).toEqual({
      not: null,
    });
    prisma.patientSummary.findFirst.mockResolvedValueOnce({
      id: 's2',
      content: 'CLINICIAN ONLY',
      patientContent: '  ',
      publishedAt: new Date(),
      createdAt: new Date(),
      authorId: 'u1',
    });
    await expect(service.summary()).resolves.toBeNull();
    prisma.patientSummary.findFirst.mockResolvedValueOnce(null);
    await expect(service.summary()).resolves.toBeNull();
  });
});
