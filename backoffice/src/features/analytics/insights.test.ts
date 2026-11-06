import { describe, expect, it } from 'vitest';
import {
  demandCells,
  describeRecommendation,
  hourLabel,
  intensityStep,
  LEAD_TIME_KEYS,
  matrixMax,
  ratePercent,
  sortLeadTime,
  sortWeekdays,
  trimHourSpan,
} from './insights';

const fmt = {
  weekday: (d: number) => `D${d}`,
  number: (v: number) => String(v),
  list: (items: string[]) => items.join(' + '),
};

const empty = () => Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

describe('insights helpers', () => {
  it('trims the hour span to hours with demand', () => {
    const m = empty();
    m[0]![9] = 3;
    m[4]![16] = 1;
    expect(trimHourSpan(m)).toEqual({ start: 9, end: 16 });
    expect(trimHourSpan(empty())).toBeNull();
  });

  it('buckets intensity into 0 and 1..5', () => {
    expect(intensityStep(0, 10)).toBe(0);
    expect(intensityStep(5, 0)).toBe(0);
    expect(intensityStep(1, 10)).toBe(1);
    expect(intensityStep(5, 10)).toBe(3);
    expect(intensityStep(10, 10)).toBe(5);
    const m = empty();
    m[2]![10] = 12;
    expect(matrixMax(m)).toBe(12);
  });

  it('orders lead-time and weekday buckets', () => {
    const rows = ['31d+', '0-1d', '8-30d', '2-7d'].map((key) => ({ key, rate: 0.1, count: 1 }));
    expect(sortLeadTime(rows).map((r) => r.key)).toEqual([...LEAD_TIME_KEYS]);
    const days = ['4', '0', '2'].map((key) => ({ key, rate: 0, count: 0 }));
    expect(sortWeekdays(days).map((r) => r.key)).toEqual(['0', '2', '4']);
  });

  it('lists non-zero demand cells by count desc', () => {
    const m = empty();
    m[1]![9] = 2;
    m[0]![8] = 7;
    expect(demandCells(m)).toEqual([
      { weekday: 0, hour: 8, count: 7 },
      { weekday: 1, hour: 9, count: 2 },
    ]);
  });

  it('formats hours and rates', () => {
    expect(hourLabel(9)).toBe('09:00');
    expect(ratePercent(0.2134)).toBe(21.3);
  });

  it('describes recommendations', () => {
    expect(
      describeRecommendation(
        { kind: 'HIGH_NO_SHOW_SLOT', params: { weekday: 3, hour: 9, rate: 0.214, count: 34 } },
        fmt,
      ),
    ).toEqual({
      key: 'highNoShow',
      values: { weekday: 'D3', time: '09:00', rate: '21', count: '34' },
    });
    const peak = describeRecommendation(
      {
        kind: 'PEAK_HOURS',
        params: {
          cells: [
            { weekday: 4, hour: 11, count: 25 },
            { weekday: 1, hour: 9, count: 20 },
          ],
        },
      },
      fmt,
      1,
    );
    expect(peak.values.cells).toBe('D4 11:00 (25)');
    expect(
      describeRecommendation(
        {
          kind: 'UNDERUSED_DOCTOR',
          params: { doctorId: 'd', doctorName: 'Dr X', bookedMinutes: 120, medianMinutes: 480 },
        },
        fmt,
      ),
    ).toEqual({ key: 'underused', values: { name: 'Dr X', booked: '120', median: '480' } });
    expect(
      describeRecommendation(
        { kind: 'UNDERUSED_DOCTOR', params: { doctorId: 'd', bookedMinutes: 1, medianMinutes: 2 } },
        fmt,
      ).key,
    ).toBe('underusedUnnamed');
  });
});
