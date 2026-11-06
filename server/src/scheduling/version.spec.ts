import { scheduleVersion } from './version';

const row = (id: string, minutes: number) => ({
  id,
  doctorId: 'd',
  startsAt: new Date(Date.UTC(2026, 10, 6, 9, minutes)),
  endsAt: new Date(Date.UTC(2026, 10, 6, 9, minutes + 30)),
  status: 'SCHEDULED',
});

describe('scheduleVersion', () => {
  it('is order independent and changes with any field', () => {
    const a = scheduleVersion([row('a', 0), row('b', 30)]);
    expect(scheduleVersion([row('b', 30), row('a', 0)])).toBe(a);
    expect(scheduleVersion([row('a', 0), row('b', 45)])).not.toBe(a);
    expect(scheduleVersion([{ ...row('a', 0), status: 'CONFIRMED' }, row('b', 30)])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
