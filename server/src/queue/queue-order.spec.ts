import {
  compareQueueEntries,
  formatQueueNumber,
  nextQueueSequence,
  type OrderableEntry,
} from './queue-order';

const T = Date.UTC(2026, 10, 6, 5, 0);
const m = (minutes: number) => T + minutes * 60_000;
const entry = (over: Partial<OrderableEntry>): OrderableEntry => ({
  number: 'A001',
  priority: 'NORMAL',
  appointmentStartsAt: m(0),
  checkedInAt: m(0),
  ...over,
});
const sorted = (list: OrderableEntry[]) => [...list].sort(compareQueueEntries).map((e) => e.number);

describe('queue call order', () => {
  it('1. emergency before urgent before normal', () => {
    expect(
      sorted([
        entry({ number: 'N', priority: 'NORMAL' }),
        entry({ number: 'U', priority: 'URGENT' }),
        entry({ number: 'E', priority: 'EMERGENCY' }),
      ]),
    ).toEqual(['E', 'U', 'N']);
  });

  it('2. a late emergency still jumps an earlier normal', () => {
    expect(
      sorted([
        entry({ number: 'N', appointmentStartsAt: m(0), checkedInAt: m(0) }),
        entry({
          number: 'E',
          priority: 'EMERGENCY',
          appointmentStartsAt: m(90),
          checkedInAt: m(80),
        }),
      ]),
    ).toEqual(['E', 'N']);
  });

  it('3. same priority: earlier appointment time first', () => {
    expect(
      sorted([
        entry({ number: 'B', appointmentStartsAt: m(30) }),
        entry({ number: 'A', appointmentStartsAt: m(10) }),
      ]),
    ).toEqual(['A', 'B']);
  });

  it('4. same priority and time: earlier check-in first', () => {
    expect(
      sorted([
        entry({ number: 'B', checkedInAt: m(20) }),
        entry({ number: 'A', checkedInAt: m(5) }),
      ]),
    ).toEqual(['A', 'B']);
  });

  it('5. appointment time beats check-in time', () => {
    expect(
      sorted([
        entry({
          number: 'late-booked-early-arrival',
          appointmentStartsAt: m(60),
          checkedInAt: m(0),
        }),
        entry({
          number: 'early-booked-late-arrival',
          appointmentStartsAt: m(10),
          checkedInAt: m(40),
        }),
      ]),
    ).toEqual(['early-booked-late-arrival', 'late-booked-early-arrival']);
  });

  it('6. priority beats appointment time within normals and urgents', () => {
    expect(
      sorted([
        entry({ number: 'N1', appointmentStartsAt: m(0) }),
        entry({ number: 'U1', priority: 'URGENT', appointmentStartsAt: m(120) }),
      ]),
    ).toEqual(['U1', 'N1']);
  });

  it('7. full ties fall back to the queue number', () => {
    expect(sorted([entry({ number: 'A002' }), entry({ number: 'A001' })])).toEqual([
      'A001',
      'A002',
    ]);
  });

  it('8. an unknown priority ranks as normal', () => {
    expect(
      sorted([
        entry({ number: 'X', priority: 'WEIRD' }),
        entry({ number: 'U', priority: 'URGENT' }),
      ]),
    ).toEqual(['U', 'X']);
  });

  it('9. comparator is antisymmetric and zero only for identical entries', () => {
    const a = entry({ number: 'A001', priority: 'URGENT' });
    const b = entry({ number: 'A002' });
    expect(Math.sign(compareQueueEntries(a, b))).toBe(-Math.sign(compareQueueEntries(b, a)));
    expect(compareQueueEntries(a, { ...a })).toBe(0);
  });

  it('10. sorting a shuffled mixed list is stable and deterministic', () => {
    const list = [
      entry({ number: 'A005', priority: 'NORMAL', appointmentStartsAt: m(20), checkedInAt: m(15) }),
      entry({ number: 'A001', priority: 'URGENT', appointmentStartsAt: m(40), checkedInAt: m(30) }),
      entry({ number: 'A003', priority: 'NORMAL', appointmentStartsAt: m(10), checkedInAt: m(12) }),
      entry({
        number: 'A004',
        priority: 'EMERGENCY',
        appointmentStartsAt: m(50),
        checkedInAt: m(45),
      }),
      entry({ number: 'A002', priority: 'NORMAL', appointmentStartsAt: m(20), checkedInAt: m(5) }),
    ];
    const expected = ['A004', 'A001', 'A003', 'A002', 'A005'];
    expect(sorted(list)).toEqual(expected);
    expect(sorted([...list].reverse())).toEqual(expected);
  });

  it('11. with ten entries the first is always the highest priority earliest appointment', () => {
    const list = Array.from({ length: 10 }, (_, i) =>
      entry({
        number: `A${String(i).padStart(3, '0')}`,
        priority: i % 3 === 0 ? 'URGENT' : 'NORMAL',
        appointmentStartsAt: m(100 - i * 5),
        checkedInAt: m(i),
      }),
    );
    expect(sorted(list)[0]).toBe('A009');
  });
});

describe('queue numbers', () => {
  it('formats and increments', () => {
    expect(formatQueueNumber(7)).toBe('A007');
    expect(formatQueueNumber(123)).toBe('A123');
    expect(nextQueueSequence([])).toBe(1);
    expect(nextQueueSequence(['A001', 'A009', 'A003'])).toBe(10);
  });
});
