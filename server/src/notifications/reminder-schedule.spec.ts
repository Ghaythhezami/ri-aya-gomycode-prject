import { mockProviderFails, notificationDedupeKey, planReminders } from './reminder-schedule';

const starts = new Date('2026-11-10T10:00:00Z');

describe('reminder planning', () => {
  it('keeps only offsets whose send time is still ahead', () => {
    const planned = planReminders(
      starts,
      ['SMS', 'EMAIL'],
      ['SMS', 'EMAIL'],
      [1440, 120],
      new Date('2026-11-09T12:00:00Z'),
    );
    expect(planned.map((p) => `${p.channel}:${p.offsetMinutes}`)).toEqual(['EMAIL:120', 'SMS:120']);
  });

  it('includes the 24h offset when far enough ahead', () => {
    const planned = planReminders(
      starts,
      ['SMS'],
      ['SMS', 'EMAIL'],
      [1440, 120],
      new Date('2026-11-08T00:00:00Z'),
    );
    expect(planned.map((p) => p.offsetMinutes)).toEqual([1440, 120]);
    expect(planned[0]!.scheduledFor.toISOString()).toBe('2026-11-09T10:00:00.000Z');
  });

  it('intersects appointment and clinic channels and drops unknown ones', () => {
    expect(planReminders(starts, ['EMAIL'], ['SMS'], [120], new Date(0))).toEqual([]);
    expect(planReminders(starts, ['SMS', 'PIGEON'], ['SMS'], [120], new Date(0))).toHaveLength(1);
  });

  it('skips reminders whose time has passed', () => {
    expect(
      planReminders(starts, ['SMS'], ['SMS'], [120], new Date('2026-11-10T09:00:00Z')),
    ).toEqual([]);
  });
});

describe('notification keys and mock provider', () => {
  it('builds stable dedupe keys', () => {
    expect(notificationDedupeKey('appointment.created', 'a1')).toBe('appointment.created:a1');
    expect(notificationDedupeKey('appointment.rescheduled', 'a1', 1730000000)).toBe(
      'appointment.rescheduled:a1:1730000000',
    );
    expect(notificationDedupeKey('x', 'a')).toBe(notificationDedupeKey('x', 'a'));
  });
  it('fails deterministically on ids starting with f', () => {
    expect(mockProviderFails('f1234')).toBe(true);
    expect(mockProviderFails('a1234')).toBe(false);
  });
});
