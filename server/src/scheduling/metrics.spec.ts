import { computeDayMetrics, waitsForDoctor } from './metrics';

const M = 60_000;
const base = Date.UTC(2026, 10, 6, 5, 0); // 09:00 Dubai
const at = (minutes: number) => base + minutes * M;

describe('day metrics (hand calculated)', () => {
  // Doctor available 09:00-12:00 (180 min). Bookings 09:00-09:30, 09:30-10:00, 10:30-11:00.
  const doctor = { id: 'd1', available: [{ start: at(0), end: at(180) }] };
  const appointments = [
    { doctorId: 'd1', start: at(0), end: at(30) },
    { doctorId: 'd1', start: at(30), end: at(60) },
    { doctorId: 'd1', start: at(90), end: at(120) },
  ];

  it('computes minutes, gaps and utilisation', () => {
    const metrics = computeDayMetrics('2026-11-06', [doctor], appointments);
    const d = metrics.perDoctor[0]!;
    expect(d.availableMinutes).toBe(180);
    expect(d.bookedMinutes).toBe(90);
    expect(d.freeMinutes).toBe(90);
    expect(d.idleGapMinutes).toBe(30); // 10:00-10:30
    expect(d.utilisation).toBe(50);
    expect(metrics.totals.availability).toBe(50);
    expect(metrics.totals.appointments).toBe(3);
  });

  it('computes the waiting model: service = 30 x 1.15 = 34.5', () => {
    // finish1 = 34.5 -> wait2 = 4.5; finish2 = 69 -> wait3 = max(0, 69-90) = 0 ; average = 1.5
    const waits = waitsForDoctor(appointments);
    expect(waits).toEqual([0, 4.5, 0]);
    const metrics = computeDayMetrics('2026-11-06', [doctor], appointments);
    expect(metrics.totals.estimatedWaitMinutes).toBe(1.5);
    expect(metrics.perDoctor[0]!.estimatedWaitMinutes).toBe(1.5);
  });

  it('back-to-back bookings accumulate delay', () => {
    const waits = waitsForDoctor([
      { start: at(0), end: at(30) },
      { start: at(30), end: at(60) },
      { start: at(60), end: at(90) },
    ]);
    expect(waits).toEqual([0, 4.5, 9]);
  });

  it('clips bookings to availability and ignores unknown doctors', () => {
    const metrics = computeDayMetrics(
      '2026-11-06',
      [doctor],
      [
        { doctorId: 'd1', start: at(170), end: at(200) },
        { doctorId: 'ghost', start: at(0), end: at(30) },
      ],
    );
    expect(metrics.perDoctor[0]!.bookedMinutes).toBe(10);
    expect(metrics.totals.appointments).toBe(1);
  });

  it('empty day is all zeros', () => {
    const metrics = computeDayMetrics('2026-11-06', [{ id: 'x', available: [] }], []);
    expect(metrics.totals).toEqual({
      appointments: 0,
      bookedMinutes: 0,
      availableMinutes: 0,
      utilisation: 0,
      availability: 0,
      idleGapMinutes: 0,
      estimatedWaitMinutes: 0,
    });
  });
});
