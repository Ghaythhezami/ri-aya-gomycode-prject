import {
  addDays,
  dateInZone,
  dateStrip,
  dayPartOf,
  firstPartWithSlots,
  groupSlots,
  isPastDate,
  slotOnDate,
} from './slots';

const slot = (iso: string) => ({ startsAt: iso, endsAt: iso });

describe('clinic time zone date maths', () => {
  it('uses the clinic calendar day, not the browser or UTC day', () => {
    // 22:30 UTC on 1 Mar is already 2 Mar at 02:30 in Dubai (UTC+4) and still 1 Mar in New York.
    const now = new Date('2026-03-01T22:30:00Z');
    expect(dateInZone(now, 'Asia/Dubai')).toBe('2026-03-02');
    expect(dateInZone(now, 'America/New_York')).toBe('2026-03-01');
  });

  it('builds a strip of consecutive clinic days across month ends', () => {
    expect(dateStrip('UTC', 4, new Date('2026-02-27T10:00:00Z'))).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('adds days with no daylight-saving drift', () => {
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09'); // US DST starts 8 Mar
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('knows when a date is already past in the clinic zone', () => {
    const now = new Date('2026-03-01T22:30:00Z');
    expect(isPastDate('2026-03-01', 'Asia/Dubai', now)).toBe(true);
    expect(isPastDate('2026-03-01', 'America/New_York', now)).toBe(false);
  });

  it('classifies slots by part of day in the clinic zone', () => {
    expect(dayPartOf('2026-03-02T05:00:00Z', 'Asia/Dubai')).toBe('morning'); // 09:00
    expect(dayPartOf('2026-03-02T09:00:00Z', 'Asia/Dubai')).toBe('afternoon'); // 13:00
    expect(dayPartOf('2026-03-02T14:30:00Z', 'Asia/Dubai')).toBe('evening'); // 18:30
  });

  it('groups, orders and drops past slots', () => {
    const now = new Date('2026-03-02T05:10:00Z');
    const groups = groupSlots(
      [
        slot('2026-03-02T09:00:00Z'),
        slot('2026-03-02T05:00:00Z'), // past
        slot('2026-03-02T06:00:00Z'),
        slot('2026-03-02T15:00:00Z'),
      ],
      'Asia/Dubai',
      now,
    );
    expect(groups.morning.map((s) => s.startsAt)).toEqual(['2026-03-02T06:00:00Z']);
    expect(groups.afternoon).toHaveLength(1);
    expect(groups.evening).toHaveLength(1);
    expect(firstPartWithSlots(groups)).toBe('morning');
    expect(firstPartWithSlots({ morning: [], afternoon: [], evening: [slot('x')] })).toBe(
      'evening',
    );
  });

  it('detects slots that belong to another clinic day', () => {
    expect(slotOnDate(slot('2026-03-01T21:00:00Z'), '2026-03-02', 'Asia/Dubai')).toBe(true);
    expect(slotOnDate(slot('2026-03-01T21:00:00Z'), '2026-03-01', 'Asia/Dubai')).toBe(false);
  });
});
