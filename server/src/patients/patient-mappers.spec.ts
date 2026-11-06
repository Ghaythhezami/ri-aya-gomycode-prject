import { doctorName, initials, maskPhone, toPersonRef } from '../common/mappers';
import { toPatientDetail, type PatientRow } from './patient-mappers';
import { normalisePhone } from './patients.service';

const row: PatientRow = {
  id: 'p1',
  code: 'P-001',
  firstName: 'Layla',
  lastName: 'Haddad',
  dateOfBirth: new Date('1990-05-17T00:00:00.000Z'),
  phone: '+971 50 123 1447',
  email: null,
  gender: 'female',
  address: null,
  status: 'ACTIVE',
  clinicalNotes: 'secret',
  adminNotes: null,
  contactPreference: 'SMS',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('mappers', () => {
  it('builds initials and person refs', () => {
    expect(initials('layla', 'haddad')).toBe('LH');
    expect(toPersonRef({ id: 'x', firstName: 'Layla', lastName: 'Haddad' })).toEqual({
      id: 'x',
      name: 'Layla Haddad',
      initials: 'LH',
    });
    expect(doctorName({ firstName: 'Omar', lastName: 'Aziz' })).toBe('Dr. Omar Aziz');
  });

  it('masks phones keeping the prefix and last four digits', () => {
    expect(maskPhone('+971 50 123 1447')).toBe('+971 50 ••• 1447');
    expect(maskPhone('+971501231447')).toBe('+971 50 ••• 1447');
    expect(maskPhone('12345')).toBe('••• 2345');
  });

  it('normalises phones to digits', () => {
    expect(normalisePhone('+971 (50) 123-1447')).toBe('971501231447');
  });

  it('returns clinical notes only when the role may read them', () => {
    expect(toPatientDetail(row, true).clinicalNotes).toBe('secret');
    const hidden = toPatientDetail(row, false);
    expect('clinicalNotes' in hidden).toBe(false);
    expect(hidden.canReadClinicalNotes).toBe(false);
    expect(hidden.dateOfBirth).toBe('1990-05-17');
  });
});
