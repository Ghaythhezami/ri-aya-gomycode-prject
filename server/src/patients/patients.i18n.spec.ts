import { BadRequestException } from '@nestjs/common';
import { RequestLocale } from '../common/locale/request-locale';
import { toPatientDetail, toPatientListItem, type PatientRow } from './patient-mappers';
import { PatientsService } from './patients.service';

const row: PatientRow = {
  id: 'p1',
  code: 'P-001',
  firstName: 'Layla',
  lastName: 'Haddad',
  firstNameI18n: { en: 'Layla', fr: 'Leïla', ar: 'ليلى' },
  lastNameI18n: { en: 'Haddad', ar: 'حداد' },
  dateOfBirth: new Date('1990-05-17T00:00:00.000Z'),
  phone: '+971 50 123 1447',
  email: null,
  gender: 'female',
  address: null,
  status: 'ACTIVE',
  clinicalNotes: null,
  adminNotes: null,
  contactPreference: 'SMS',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('patient DTO localization', () => {
  it('localizes name and initials, keeps canonical columns', () => {
    RequestLocale.run('ar', () => {
      expect(toPatientListItem(row)).toMatchObject({
        name: 'ليلى حداد',
        initials: 'لح',
        firstName: 'Layla',
      });
    });
    expect(toPatientListItem(row).name).toBe('Layla Haddad');
  });

  it('adds firstNameI18n and lastNameI18n to the detail shape only', () => {
    const detail = toPatientDetail(row, false);
    expect(detail.firstNameI18n).toEqual(row.firstNameI18n);
    expect(detail.lastNameI18n).toEqual(row.lastNameI18n);
    expect(toPatientListItem(row).firstNameI18n).toBeUndefined();
  });
});

function makeService(defaultLanguage = 'en') {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const stored = { ...row, archivedAt: null };
  const tx = {
    $queryRaw: () => Promise.resolve([{ max: 0 }]),
    patient: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({ ...row, ...data });
      },
      update: ({ data }: { data: Record<string, unknown> }) => {
        updated.push(data);
        return Promise.resolve({ ...stored, ...data });
      },
    },
  };
  const prisma = {
    $queryRaw: () => Promise.resolve([]),
    $transactionWith: (fn: (t: typeof tx) => unknown) => fn(tx),
    patient: { findMany, count, findFirst: () => Promise.resolve(stored) },
    appointment: { groupBy: () => Promise.resolve([]) },
  };
  const service = new PatientsService(
    prisma as never,
    {
      get: () => ({ clinicId: 'c', userId: 'u', organizationId: 'o', role: 'CLINIC_ADMIN' }),
    } as never,
    { record: () => Promise.resolve() } as never,
    { get: () => Promise.resolve(null), set: () => Promise.resolve() } as never,
    { emit: () => Promise.resolve() } as never,
    { get: () => Promise.resolve({ defaultLanguage }) } as never,
    { has: () => Promise.resolve(true) } as never,
  );
  return { service, created, updated, findMany };
}

const base = { dateOfBirth: '1990-05-17', phone: '+971 50 123 1447' };

describe('PatientsService names and search', () => {
  it('derives canonical names from the clinic default language and builds searchText', async () => {
    const { service, created } = makeService('ar');
    await service.create({
      ...base,
      email: 'Layla@Example.com',
      firstNameI18n: { en: 'Layla', ar: 'ليلى' },
      lastNameI18n: { fr: 'Haddad', ar: 'حداد' },
    });
    expect(created[0]).toMatchObject({
      firstName: 'ليلى',
      lastName: 'حداد',
      firstNameI18n: { en: 'Layla', ar: 'ليلى' },
    });
    const text = created[0]!.searchText as string;
    expect(text).toBe(text.toLowerCase());
    for (const part of [
      'layla',
      'ليلى',
      'حداد',
      'haddad',
      'p-001',
      '+971 50 123 1447',
      'layla@example.com',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('keeps a provided canonical name and rejects a missing name', async () => {
    const { service, created } = makeService();
    await service.create({
      ...base,
      firstName: 'Layla',
      lastName: 'Haddad',
      firstNameI18n: { ar: 'ليلى' },
    });
    expect(created[0]).toMatchObject({ firstName: 'Layla', lastName: 'Haddad' });
    await expect(service.create({ ...base, firstName: 'Layla' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('recomputes searchText on update', async () => {
    const { service, updated } = makeService();
    await service.update('p1', { lastNameI18n: { fr: 'Haddad', ar: 'الحداد' } });
    expect(updated[0]).toMatchObject({
      lastName: 'Haddad',
      lastNameI18n: { fr: 'Haddad', ar: 'الحداد' },
    });
    expect(updated[0]!.searchText).toContain('الحداد');
    expect(updated[0]!.searchText).toContain('ليلى');
  });

  it('searches searchText so Arabic and French spellings match', async () => {
    const { service, findMany } = makeService();
    await service.list({ search: 'ليلى حد' } as never);
    const where = findMany.mock.calls[0]![0].where;
    expect(where.OR[0].AND).toEqual([
      { searchText: { contains: 'ليلى', mode: 'insensitive' } },
      { searchText: { contains: 'حد', mode: 'insensitive' } },
    ]);
  });
});
