import { canChangeAppointmentType } from './actions';

const NOW = Date.parse('2026-12-01T08:00:00Z');

describe('canChangeAppointmentType', () => {
  it('needs manageAppointments, an open status and a future start', () => {
    expect(canChangeAppointmentType(true, 'SCHEDULED', '2026-12-01T09:00:00Z', NOW)).toBe(true);
    expect(canChangeAppointmentType(true, 'CONFIRMED', '2026-12-01T09:00:00Z', NOW)).toBe(true);
    expect(canChangeAppointmentType(false, 'SCHEDULED', '2026-12-01T09:00:00Z', NOW)).toBe(false);
    expect(canChangeAppointmentType(true, 'CHECKED_IN', '2026-12-01T09:00:00Z', NOW)).toBe(false);
    expect(canChangeAppointmentType(true, 'SCHEDULED', '2026-12-01T07:00:00Z', NOW)).toBe(false);
  });
});
