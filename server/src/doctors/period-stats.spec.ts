import { UnprocessableEntityException } from '@nestjs/common';
import { computePeriodStats, MAX_PERIOD_DAYS, resolvePeriod } from './period-stats';

// Mon-Fri 09:00-17:00 with a 12:00-13:00 break = 420 working minutes a day
// (Europe/Paris is UTC+1 in January).
const rules = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 540, endMinute: 1020, kind: 'WORK' },
  { weekday, startMinute: 720, endMinute: 780, kind: 'BREAK' },
]);
const TZ = 'Europe/Paris';
// 2026-01-12 is a Monday. Local hour h on day d is (h - 1):00 UTC.
const at = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 0, day, hour - 1, minute));
const appt = (day: number, hour: number, minutes = 30, status = 'COMPLETED') => ({
  startsAt: at(day, hour),
  endsAt: new Date(at(day, hour).getTime() + minutes * 60_000),
  status,
});

describe('resolvePeriod', () => {
  it('returns null without bounds and mirrors a single bound', () => {
    expect(resolvePeriod()).toBeNull();
    expect(resolvePeriod('2026-01-12')).toEqual({ from: '2026-01-12', to: '2026-01-12', days: 1 });
    expect(resolvePeriod(undefined, '2026-01-14')?.days).toBe(1);
  });

  it('accepts exactly 92 days and rejects 93 with 422', () => {
    expect(resolvePeriod('2026-01-01', '2026-04-02')?.days).toBe(MAX_PERIOD_DAYS);
    expect(() => resolvePeriod('2026-01-01', '2026-04-03')).toThrow(UnprocessableEntityException);
  });

  it('rejects an inverted range', () => {
    expect(() => resolvePeriod('2026-01-14', '2026-01-12')).toThrow(UnprocessableEntityException);
  });
});

describe('computePeriodStats', () => {
  const base = { timeZone: TZ, rules, from: '2026-01-12', to: '2026-01-16' };

  it('computes utilisation, counts and the busiest day over a week', () => {
    const { period, daily } = computePeriodStats({
      ...base,
      leaves: [],
      appointments: [
        appt(12, 9),
        appt(12, 10),
        appt(13, 9, 60),
        appt(13, 10),
        appt(13, 11),
        appt(14, 9, 30, 'NO_SHOW'),
        appt(15, 9, 30, 'CANCELLED'),
      ],
    });
    expect(daily).toHaveLength(5);
    expect(period.availableMinutes).toBe(5 * 420);
    expect(period.appointmentsCount).toBe(5);
    expect(period.completedCount).toBe(5);
    expect(period.noShowCount).toBe(1);
    expect(period.bookedMinutes).toBe(30 + 30 + 60 + 30 + 30);
    expect(period.utilisation).toBe(Math.round((100 * 180) / 2100));
    expect(period.busiestDay).toBe('2026-01-13');
    expect(daily[1]).toEqual({ date: '2026-01-13', appointments: 3, utilisation: 29 });
    expect(daily[2]!.appointments).toBe(0);
  });

  it('removes a leave day from the available minutes', () => {
    const leave = { startsAt: at(14, 0), endsAt: at(15, 0) };
    const { period, daily } = computePeriodStats({
      ...base,
      leaves: [leave],
      appointments: [appt(12, 9), appt(13, 9)],
    });
    expect(period.availableMinutes).toBe(4 * 420);
    expect(daily[2]).toEqual({ date: '2026-01-14', appointments: 0, utilisation: 0 });
    expect(period.utilisation).toBe(Math.round((100 * 60) / (4 * 420)));
  });

  it('reports no busiest day and 0 utilisation for an empty or unavailable range', () => {
    const empty = computePeriodStats({ ...base, leaves: [], appointments: [] });
    expect(empty.period.busiestDay).toBeNull();
    expect(empty.period.utilisation).toBe(0);
    const weekend = computePeriodStats({
      ...base,
      from: '2026-01-17',
      to: '2026-01-18',
      leaves: [],
      appointments: [],
    });
    expect(weekend.period.availableMinutes).toBe(0);
    expect(weekend.period.utilisation).toBe(0);
  });
});
