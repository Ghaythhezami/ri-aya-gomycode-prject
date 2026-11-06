import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AppointmentTypesService } from './appointment-types.service';

interface Row {
  id: string;
  clinicId: string;
  code: string;
  name: Record<string, string>;
  durationMinutes: number;
  color: string;
  isEmergency: boolean;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
}

function setup(usage: Record<string, number> = {}) {
  let seq = 0;
  const rows: Row[] = [];
  const durations: Record<string, Record<string, number>> = {};
  const system = (code: string, minutes: number, emergency = false): Row => ({
    id: `sys-${code}`,
    clinicId: 'c1',
    code,
    name: { en: code },
    durationMinutes: minutes,
    color: 'primary',
    isEmergency: emergency,
    isActive: true,
    isSystem: true,
    sortOrder: rows.length * 10,
  });
  rows.push(system('CONSULTATION', 30), system('FOLLOW_UP', 15), system('EMERGENCY', 20, true));
  const match = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      k === 'id' && v && typeof v === 'object'
        ? r.id !== (v as { not: string }).not
        : (r as unknown as Record<string, unknown>)[k] === v,
    );
  const def = {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter((r) => match(r, where)),
    ),
    findFirst: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => match(r, where)) ?? null,
    ),
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { id: `new-${++seq}`, ...data };
      rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      rows.splice(
        rows.findIndex((r) => r.id === where.id),
        1,
      );
    }),
    updateMany: jest.fn(),
    createMany: jest.fn(),
  };
  const self: { current?: unknown } = {};
  const prisma = {
    appointmentTypeDef: def,
    appointment: {
      count: jest.fn(async ({ where }: { where: { type: string } }) => usage[where.type] ?? 0),
      groupBy: jest.fn(async () =>
        Object.entries(usage).map(([type, n]) => ({ type, _count: { _all: n } })),
      ),
    },
    clinicSettings: {
      findUnique: jest.fn(async () => null),
      updateMany: jest.fn(async ({ data }: { data: { durations: Record<string, number> } }) => {
        durations.c1 = data.durations;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(self.current)),
  };
  self.current = prisma;
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    del: jest.fn(async (k: string) => void store.delete(k)),
  };
  const audit = { record: jest.fn() };
  const events = { emit: jest.fn() };
  const settings = {
    get: jest.fn(async () => ({ defaultLanguage: 'en' })),
    invalidate: jest.fn(),
  };
  const service = new AppointmentTypesService(
    prisma as never,
    cache as never,
    audit as never,
    events as never,
    settings as never,
  );
  const scope = { clinicId: 'c1', organizationId: 'o1', userId: 'u1' };
  return { service, rows, prisma, cache, audit, events, settings, durations, scope };
}

const input = { name: { en: 'Vaccination' }, durationMinutes: 20 };

describe('AppointmentTypesService', () => {
  it('creates a custom type with a slug code, syncs durations, audits and busts the cache', async () => {
    const t = setup();
    await t.service.list('c1'); // warm the cache
    const dto = await t.service.create(t.scope, input);
    expect(dto.code).toBe('VACCINATION');
    expect(dto.isSystem).toBe(false);
    expect(t.durations.c1).toMatchObject({ CONSULTATION: 30, VACCINATION: 20 });
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'create', entity: 'appointment_type' }),
    );
    expect(t.cache.del).toHaveBeenCalledWith('appointment-types:c1');
    expect(t.events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'settings.updated' }),
    );
  });

  it('rejects a duplicate code with 409 and a bad duration with 422', async () => {
    const t = setup();
    await t.service.create(t.scope, input);
    await expect(t.service.create(t.scope, input)).rejects.toBeInstanceOf(ConflictException);
    await expect(
      t.service.create(t.scope, { ...input, code: 'X', durationMinutes: 7 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      t.service.create(t.scope, { name: {}, durationMinutes: 10 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('caps the clinic at 50 types', async () => {
    const t = setup();
    for (let i = 0; i < 47; i++) {
      await t.service.create(t.scope, { name: { en: `Type ${i}` }, durationMinutes: 10 });
    }
    await expect(t.service.create(t.scope, input)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('protects system types: code and EMERGENCY flag are locked, name and duration editable', async () => {
    const t = setup();
    await expect(
      t.service.update(t.scope, 'sys-CONSULTATION', { code: 'OTHER' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      t.service.update(t.scope, 'sys-EMERGENCY', { isEmergency: false }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const dto = await t.service.update(t.scope, 'sys-CONSULTATION', {
      name: { en: 'Visit' },
      durationMinutes: 45,
    });
    expect(dto.durationMinutes).toBe(45);
    expect(t.durations.c1?.CONSULTATION).toBe(45);
  });

  it('keeps at least one active non-emergency type', async () => {
    const t = setup();
    await t.service.update(t.scope, 'sys-CONSULTATION', { isActive: false });
    await expect(
      t.service.update(t.scope, 'sys-FOLLOW_UP', { isActive: false }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('refuses to delete a type in use or a system type, deletes an unused custom type', async () => {
    const t = setup({ VACCINATION: 3 });
    const dto = await t.service.create(t.scope, input);
    await expect(t.service.remove(t.scope, dto.id)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    });
    await expect(t.service.remove(t.scope, 'sys-FOLLOW_UP')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const free = await t.service.create(t.scope, { name: { en: 'Spare' }, durationMinutes: 10 });
    await expect(t.service.remove(t.scope, free.id)).resolves.toEqual({ success: true });
    expect(t.durations.c1).not.toHaveProperty('SPARE');
  });

  it('is tenant scoped: another clinic id is a 404', async () => {
    const t = setup();
    await expect(
      t.service.update({ ...t.scope, clinicId: 'other' }, 'sys-CONSULTATION', { sortOrder: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists active types only by default, with the localized display name', async () => {
    const t = setup();
    t.rows[0]!.name = { en: 'Consultation', fr: 'Consultation FR' };
    await t.service.update(t.scope, 'sys-FOLLOW_UP', { isActive: false });
    const active = await t.service.list('c1', { locale: 'fr' });
    expect(active.map((x) => x.code)).toEqual(['CONSULTATION', 'EMERGENCY']);
    expect(active[0]!.displayName).toBe('Consultation FR');
    expect(await t.service.list('c1', { includeInactive: true })).toHaveLength(3);
  });

  it('requireActive rejects unknown and inactive codes with 422', async () => {
    const t = setup();
    await expect(t.service.requireActive('c1', 'NOPE')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await t.service.update(t.scope, 'sys-CONSULTATION', { isActive: false });
    await expect(t.service.requireActive('c1', 'CONSULTATION')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(t.service.requireActive('c1', 'FOLLOW_UP')).resolves.toMatchObject({
      durationMinutes: 15,
    });
  });
});
