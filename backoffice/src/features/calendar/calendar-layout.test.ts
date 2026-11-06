import { describe, expect, it } from 'vitest';
import type { AppointmentListItem } from '@riaya/shared';
import { layoutOverlaps } from './layout';
import { groupByDay, hourRange } from './model';
import { addDays, monthGrid, startOfWeek, zonedParts, zonedToInstant } from './dates';

describe('layoutOverlaps', () => {
  it('gives non-overlapping items one full-width column each', () => {
    const layout = layoutOverlaps([
      { id: 'a', start: 540, end: 570 },
      { id: 'b', start: 570, end: 600 },
    ]);
    expect(layout.get('a')).toMatchObject({ col: 0, cols: 1 });
    expect(layout.get('b')).toMatchObject({ col: 0, cols: 1 });
  });

  it('splits two overlapping items into two columns', () => {
    const layout = layoutOverlaps([
      { id: 'a', start: 540, end: 600 },
      { id: 'b', start: 560, end: 620 },
    ]);
    expect(layout.get('a')).toMatchObject({ col: 0, cols: 2 });
    expect(layout.get('b')).toMatchObject({ col: 1, cols: 2 });
  });

  it('reuses a freed column inside the same cluster', () => {
    // a overlaps b and c; b and c do not overlap each other, so two columns suffice.
    const layout = layoutOverlaps([
      { id: 'a', start: 540, end: 660 },
      { id: 'b', start: 540, end: 600 },
      { id: 'c', start: 600, end: 660 },
    ]);
    expect(layout.get('a')?.cols).toBe(2);
    expect(layout.get('b')?.col).not.toBe(layout.get('a')?.col);
    expect(layout.get('c')?.col).toBe(layout.get('b')?.col);
    expect(layout.get('c')?.cols).toBe(2);
  });

  it('keeps separate clusters independent', () => {
    const layout = layoutOverlaps([
      { id: 'a', start: 540, end: 600 },
      { id: 'b', start: 550, end: 610 },
      { id: 'c', start: 700, end: 730 },
    ]);
    expect(layout.get('a')?.cols).toBe(2);
    expect(layout.get('c')).toMatchObject({ col: 0, cols: 1 });
  });

  it('lays out 500 items quickly', () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      start: 480 + (index % 40) * 15,
      end: 480 + (index % 40) * 15 + 30,
    }));
    const started = performance.now();
    const layout = layoutOverlaps(items);
    expect(layout.size).toBe(500);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

function appointment(id: string, startsAt: string, minutes = 30): AppointmentListItem {
  return {
    id,
    code: id,
    patient: { id: `p${id}`, name: 'Sarah Johnson', initials: 'SJ', code: 'P-1' },
    doctor: { id: 'd1', name: 'Dr. Carter', initials: 'EC', specialty: 'Cardiology' },
    room: null,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString(),
    durationMinutes: minutes,
    status: 'CONFIRMED',
    type: 'CONSULTATION',
    reason: null,
    needsReschedule: false,
    locked: false,
  };
}

describe('groupByDay', () => {
  it('buckets by clinic-local day, not UTC day', () => {
    // 22:30 UTC on the 21st is 02:30 on the 22nd in Dubai (UTC+4).
    const map = groupByDay([appointment('a', '2025-04-21T22:30:00Z')], 'Asia/Dubai');
    expect(map.has('2025-04-22')).toBe(true);
    expect(map.get('2025-04-22')?.[0]).toMatchObject({ start: 150, label: '02:30' });
  });

  it('assigns overlap columns per day and widens the visible hour range', () => {
    const map = groupByDay(
      [
        appointment('a', '2025-04-22T05:00:00Z', 60),
        appointment('b', '2025-04-22T05:30:00Z', 30),
        appointment('late', '2025-04-22T17:30:00Z', 60),
      ],
      'UTC',
    );
    const blocks = map.get('2025-04-22')!;
    expect(blocks.find((b) => b.item.id === 'a')?.cols).toBe(2);
    expect(blocks.find((b) => b.item.id === 'b')?.col).toBe(1);
    expect(hourRange([blocks])).toEqual({ startHour: 5, endHour: 19 });
  });
});

describe('calendar dates', () => {
  it('computes Monday-first weeks and month grids', () => {
    expect(startOfWeek('2025-04-22')).toBe('2025-04-21');
    expect(addDays('2025-04-30', 1)).toBe('2025-05-01');
    const grid = monthGrid('2025-04-15');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2025-03-31');
  });

  it('round-trips a clinic-local time through an instant', () => {
    const instant = zonedToInstant('2025-04-22', 9 * 60 + 30, 'Asia/Dubai');
    expect(instant).toBe('2025-04-22T05:30:00.000Z');
    expect(zonedParts(instant, 'Asia/Dubai')).toEqual({ ymd: '2025-04-22', minutes: 570 });
  });
});
