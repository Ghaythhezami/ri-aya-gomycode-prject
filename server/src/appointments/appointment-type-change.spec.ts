import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

const MIN = 60_000;
const FUTURE = new Date(Date.now() + 3 * 24 * 3600_000);

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    clinicId: 'c1',
    code: 'AP-1001',
    patientId: 'p1',
    doctorId: 'd1',
    roomId: null,
    startsAt: FUTURE,
    endsAt: new Date(FUTURE.getTime() + 30 * MIN),
    status: 'SCHEDULED',
    type: 'CONSULTATION',
    reason: null,
    notes: null,
    cancelReason: null,
    locked: false,
    needsReschedule: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'p1', code: 'P-1', firstName: 'A', lastName: 'B' },
    doctor: { id: 'd1', firstName: 'C', lastName: 'D', specialty: 'GP', roomId: null },
    room: null,
    reminders: [],
    ...over,
  };
}

type TypeDef = { code: string; durationMinutes: number; isEmergency: boolean; displayName: string };

function setup(existing: ReturnType<typeof row> | null, clash = false) {
  const updateCalls: { data: Record<string, unknown> }[] = [];
  const tx = {
    appointment: {
      findFirst: jest.fn(async () => (clash ? { id: 'other' } : null)),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        updateCalls.push(args);
        return { ...existing!, ...args.data };
      }),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        ...row(),
        ...args.data,
      })),
    },
    $queryRaw: jest.fn(async () => [{ max: 1000 }]),
  };
  const prisma = {
    appointment: { findFirst: jest.fn(async () => existing) },
    doctor: {
      findFirst: jest.fn(async () => ({ id: 'd1', isActive: true, roomId: null, specialty: 'GP' })),
      findMany: jest.fn(async () => []),
    },
    patient: { findFirst: jest.fn(async () => ({ id: 'p1', status: 'ACTIVE' })) },
    room: { findFirst: jest.fn() },
    workingHour: { findMany: jest.fn(async () => []) },
    doctorLeave: { findMany: jest.fn(async () => []) },
    $transactionWith: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const defs = new Map<string, TypeDef>([
    ['LONG', { code: 'LONG', durationMinutes: 45, isEmergency: true, displayName: 'Long' }],
    [
      'CONSULTATION',
      { code: 'CONSULTATION', durationMinutes: 30, isEmergency: false, displayName: 'C' },
    ],
  ]);
  const types = {
    requireActive: jest.fn(async (_clinic: string, code: string) => {
      const d = defs.get(code);
      if (!d || code === 'OLD') {
        throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'inactive' });
      }
      return d;
    }),
    byCode: jest.fn(async () => defs),
  };
  const audit = { record: jest.fn() };
  const events = { emit: jest.fn() };
  const settings = {
    get: jest.fn(async () => ({
      clinic: { timezone: 'UTC' },
      slotMinutes: 15,
      reminderChannels: [],
    })),
  };
  const locks = { get: jest.fn(async () => null), release: jest.fn() };
  const tenant = {
    get: jest.fn(() => ({
      clinicId: 'c1',
      organizationId: 'o1',
      userId: 'u1',
      role: 'CLINIC_ADMIN',
    })),
  };
  const service = new AppointmentsService(
    prisma as never,
    tenant as never,
    audit as never,
    events as never,
    settings as never,
    locks as never,
    {} as never,
    types as never,
  );
  return { service, prisma, tx, types, audit, events, updateCalls };
}

describe('AppointmentsService.changeType', () => {
  it('applies the new type duration to the end time and emits appointment.updated', async () => {
    const t = setup(row());
    await t.service.changeType('a1', { type: 'LONG' });
    const data = t.updateCalls[0]!.data;
    expect(data.type).toBe('LONG');
    expect((data.endsAt as Date).getTime() - FUTURE.getTime()).toBe(45 * MIN);
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'update', entity: 'appointment' }),
    );
    expect(t.events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appointment.updated' }),
    );
    expect(t.events.emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appointment.rescheduled' }),
    );
  });

  it('keeps the end time with keepDuration', async () => {
    const t = setup(row());
    await t.service.changeType('a1', { type: 'LONG', keepDuration: true });
    const data = t.updateCalls[0]!.data;
    expect((data.endsAt as Date).getTime() - FUTURE.getTime()).toBe(30 * MIN);
  });

  it('surfaces SLOT_CONFLICT when the longer slot overlaps another appointment', async () => {
    const t = setup(row(), true);
    const error = await t.service.changeType('a1', { type: 'LONG' }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'SLOT_CONFLICT' });
  });

  it('rejects non SCHEDULED/CONFIRMED appointments with 409 ILLEGAL_TRANSITION', async () => {
    const t = setup(row({ status: 'COMPLETED' }));
    const error = await t.service.changeType('a1', { type: 'LONG' }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('rejects past appointments with 422', async () => {
    const past = new Date(Date.now() - 3600_000);
    const t = setup(row({ startsAt: past, endsAt: new Date(past.getTime() + 30 * MIN) }));
    await expect(t.service.changeType('a1', { type: 'LONG' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects an unknown or inactive type with 422', async () => {
    const t = setup(row());
    await expect(t.service.changeType('a1', { type: 'OLD' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(t.updateCalls).toHaveLength(0);
  });

  it('returns 404 for an appointment of another clinic (query is clinic scoped)', async () => {
    const t = setup(null);
    await expect(t.service.changeType('a1', { type: 'LONG' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(t.prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1', clinicId: 'c1' } }),
    );
  });
});

describe('AppointmentsService.create with appointment types', () => {
  const dto = {
    patientId: 'p1',
    doctorId: 'd1',
    startsAt: FUTURE.toISOString(),
    type: 'LONG',
  };

  it('books a custom type with its default duration', async () => {
    const t = setup(null);
    await t.service.create(dto as never);
    const data = (
      t.tx.appointment.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.type).toBe('LONG');
    expect((data.endsAt as Date).getTime() - (data.startsAt as Date).getTime()).toBe(45 * MIN);
  });

  it('rejects an inactive or unknown type with 422 and books nothing', async () => {
    const t = setup(null);
    await expect(t.service.create({ ...dto, type: 'OLD' } as never)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(t.tx.appointment.create).not.toHaveBeenCalled();
  });
});
