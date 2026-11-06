import {
  doctorName,
  roomName,
  toAppointmentListItem,
  toDoctorRef,
  toPersonRef,
  type AppointmentRow,
} from './mappers';
import { RequestLocale } from './locale/request-locale';

const patient = {
  id: 'p1',
  firstName: 'Layla',
  lastName: 'Haddad',
  firstNameI18n: { en: 'Layla', fr: 'Leïla', ar: 'ليلى' },
  lastNameI18n: { ar: 'حداد' },
};
const doctor = {
  id: 'd1',
  firstName: 'Omar',
  lastName: 'Farouk',
  firstNameI18n: { fr: 'Omar', ar: 'عمر' },
  lastNameI18n: { ar: 'فاروق' },
  specialty: 'Orthopedics',
};

describe('localized names through the mappers', () => {
  it('falls back outside a request and without the JSON columns', () => {
    expect(toPersonRef({ id: 'x', firstName: 'A', lastName: 'B' }).name).toBe('A B');
    expect(doctorName({ firstName: 'Omar', lastName: 'Farouk', firstNameI18n: {} })).toBe(
      'Dr. Omar Farouk',
    );
    // No locale: en, then fr, then ar, then the canonical column.
    expect(toPersonRef(patient).name).toBe('Layla حداد');
  });

  it('resolves the request language with fallbacks', () => {
    RequestLocale.run('ar', () => {
      expect(toPersonRef(patient)).toEqual({ id: 'p1', name: 'ليلى حداد', initials: 'لح' });
      expect(doctorName(doctor)).toBe('د. عمر فاروق');
      expect(toDoctorRef(doctor).initials).toBe('عف');
    });
    RequestLocale.run('fr', () => {
      // French first name exists, French last name does not: falls back to the first filled.
      expect(toPersonRef(patient).name).toBe('Leïla حداد');
      expect(doctorName(doctor)).toBe('Dr Omar فاروق');
    });
    RequestLocale.run('en', () => {
      expect(toPersonRef(patient).name).toBe('Layla حداد');
    });
  });

  it('localizes room names in appointment lists', () => {
    const row: AppointmentRow = {
      id: 'a',
      code: 'A-1',
      startsAt: new Date('2026-01-01T08:00:00Z'),
      endsAt: new Date('2026-01-01T08:30:00Z'),
      status: 'SCHEDULED',
      type: 'CONSULTATION',
      reason: null,
      needsReschedule: false,
      locked: false,
      patient: { ...patient, code: 'P-001' },
      doctor,
      room: { id: 'r', name: 'Room 1', nameI18n: { fr: 'Salle 1', ar: 'غرفة 1' } },
    };
    RequestLocale.run('fr', () => {
      expect(toAppointmentListItem(row).room?.name).toBe('Salle 1');
    });
    expect(roomName({ name: 'Room 1', nameI18n: {} })).toBe('Room 1');
  });
});
