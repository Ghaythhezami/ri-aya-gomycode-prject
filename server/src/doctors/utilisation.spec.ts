import { availableIntervals, type Interval } from '../core/availability';
import { localToUtc } from '../core/clinic-time';
import { computeUtilisation } from './utilisation';

const TZ = 'Asia/Dubai';
const DATE = '2026-11-09';
const at = (minute: number) => localToUtc(DATE, minute, TZ).getTime();
const range = (a: number, b: number): Interval => ({ start: at(a), end: at(b) });

describe('computeUtilisation', () => {
  const rules = [
    { weekday: 1, startMinute: 480, endMinute: 960, kind: 'WORK' }, // 08:00-16:00
    { weekday: 1, startMinute: 720, endMinute: 780, kind: 'BREAK' }, // 12:00-13:00
  ];
  const available = availableIntervals(DATE, TZ, rules); // 7 hours = 420 min

  it('is 0 when nothing is booked', () => {
    expect(computeUtilisation(available, [])).toEqual({
      bookedMinutes: 0,
      availableMinutes: 420,
      utilisation: 0,
    });
  });

  it('is 0 when there is no availability, even with bookings', () => {
    expect(computeUtilisation([], [range(480, 540)])).toEqual({
      bookedMinutes: 0,
      availableMinutes: 0,
      utilisation: 0,
    });
  });

  it('computes round(100 * booked / available)', () => {
    // 6 x 30 min = 180 of 420 minutes = 42.857 -> 43
    const booked = [480, 510, 540, 570, 600, 630].map((m) => range(m, m + 30));
    expect(computeUtilisation(available, booked)).toEqual({
      bookedMinutes: 180,
      availableMinutes: 420,
      utilisation: 43,
    });
  });

  it('is 100 when the whole day is booked', () => {
    expect(computeUtilisation(available, [range(480, 720), range(780, 960)]).utilisation).toBe(100);
  });

  it('clips bookings to the available intervals', () => {
    // 11:30-12:30 only 30 minutes are available (the break starts at 12:00)
    expect(computeUtilisation(available, [range(690, 750)]).bookedMinutes).toBe(30);
    // entirely outside working hours
    expect(computeUtilisation(available, [range(1000, 1060)]).bookedMinutes).toBe(0);
  });

  it('counts overlapping bookings once', () => {
    expect(computeUtilisation(available, [range(480, 540), range(500, 560)]).bookedMinutes).toBe(
      80,
    );
  });

  it('never exceeds 100', () => {
    expect(computeUtilisation([range(480, 540)], [range(0, 1440)]).utilisation).toBe(100);
  });

  it('rounds half up', () => {
    // 1 of 8 minutes = 12.5 -> 13
    expect(computeUtilisation([range(480, 488)], [range(480, 481)]).utilisation).toBe(13);
  });
});
