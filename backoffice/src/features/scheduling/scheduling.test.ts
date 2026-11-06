import { describe, expect, it } from 'vitest';
import type { OptimizationProposal, SchedulingDay } from '@riaya/shared';
import {
  applyPending,
  deltaXToMinutes,
  localMinutes,
  minuteToPercent,
  nonWorkingSegments,
  resolveDrop,
  rowIndexAfterDrag,
  snapMinute,
  zonedToUtcIso,
} from './gridMath';
import {
  initialInsightsState,
  insightsPhase,
  insightsReducer,
  waitImprovement,
} from './insightsState';

const totals = {
  appointments: 1,
  bookedMinutes: 0,
  availableMinutes: 0,
  utilisation: 0,
  availability: 0,
  idleGapMinutes: 0,
};
const proposal = (over: Partial<OptimizationProposal> = {}): OptimizationProposal => ({
  id: 'p1',
  date: '2026-01-05',
  objective: 'MIN_WAIT',
  version: 'v',
  status: 'IMPROVED',
  moves: [
    {
      appointmentId: 'a',
      code: 'A',
      patientName: 'X',
      fromDoctorId: 'd1',
      toDoctorId: 'd2',
      fromStartsAt: '',
      toStartsAt: '',
      durationMinutes: 15,
      reasonKey: 'r',
    },
  ],
  before: { ...totals, estimatedWaitMinutes: 18 },
  after: { ...totals, estimatedWaitMinutes: 10 },
  unresolved: [],
  idleDoctors: [],
  createdAt: '',
  state: 'PROPOSED',
  undoUntil: null,
  ...over,
});
const unresolved = [{ appointmentId: 'b', code: 'B', reasonKey: 'k' }];

describe('grid math', () => {
  it('maps minutes to percent', () => {
    expect(minuteToPercent(540, 480, 1080)).toBe(10);
    expect(minuteToPercent(0, 480, 1080)).toBe(0);
  });
  it('snaps to the slot grid', () => {
    expect(snapMinute(547, 15)).toBe(540);
    expect(snapMinute(548, 15)).toBe(555);
  });
  it('inverts horizontal drag in RTL', () => {
    expect(deltaXToMinutes(60, 2, false)).toBe(30);
    expect(deltaXToMinutes(60, 2, true)).toBe(-30);
  });
  it('picks the row and clamps', () => {
    expect(rowIndexAfterDrag(1, 85, 80, 4)).toBe(2);
    expect(rowIndexAfterDrag(0, -400, 80, 4)).toBe(0);
  });
  it('resolves a drop with snapping and day bounds', () => {
    const base = {
      startMinute: 540,
      duration: 30,
      rowIndex: 0,
      dy: 0,
      rowCount: 3,
      dayStart: 480,
      dayEnd: 1080,
      slot: 15,
      rtl: false,
      pxPerMinute: 2,
    };
    expect(resolveDrop({ ...base, dx: 62 }).startMinute).toBe(570);
    expect(resolveDrop({ ...base, dx: 5000 }).startMinute).toBe(1050);
    expect(resolveDrop({ ...base, dx: 62, rtl: true }).startMinute).toBe(510);
  });
  it('converts clinic local time both ways', () => {
    const iso = zonedToUtcIso('2026-01-05', 570, 'Asia/Dubai');
    expect(iso).toBe('2026-01-05T05:30:00.000Z');
    expect(localMinutes(iso, 'Asia/Dubai')).toBe(570);
  });
  it('hatches time outside work and breaks', () => {
    const segs = nonWorkingSegments(
      {
        work: [{ startsAt: '2026-01-05T08:00:00Z', endsAt: '2026-01-05T12:00:00Z' }],
        breaks: [{ startsAt: '2026-01-05T08:00:00Z', endsAt: '2026-01-05T09:00:00Z' }],
      },
      'UTC',
      360,
      1080,
    );
    expect(segs).toContainEqual({ startMinute: 360, endMinute: 480, kind: 'off' });
    expect(segs).toContainEqual({ startMinute: 720, endMinute: 1080, kind: 'off' });
    expect(segs).toContainEqual({ startMinute: 480, endMinute: 540, kind: 'break' });
  });
  it('applies pending moves across doctors', () => {
    const day = {
      date: '2026-01-05',
      timezone: 'UTC',
      dayStartMinute: 480,
      dayEndMinute: 1080,
      version: 'v',
      metrics: { date: '', perDoctor: [], totals: { ...totals, estimatedWaitMinutes: 0 } },
      doctors: [
        {
          id: 'd1',
          name: 'A',
          initials: 'A',
          specialty: 's',
          work: [],
          breaks: [],
          blocks: [
            {
              appointmentId: 'a',
              code: 'A',
              patientName: 'X',
              type: 'CONSULTATION',
              status: 'SCHEDULED',
              startsAt: '2026-01-05T09:00:00Z',
              endsAt: '2026-01-05T09:30:00Z',
              movable: true,
              conflict: false,
            },
          ],
        },
        { id: 'd2', name: 'B', initials: 'B', specialty: 's', work: [], breaks: [], blocks: [] },
      ],
    } as SchedulingDay;
    const rows = applyPending(day, {
      a: {
        appointmentId: 'a',
        fromDoctorId: 'd1',
        toDoctorId: 'd2',
        fromStartsAt: '',
        toStartsAt: '2026-01-05T10:00:00Z',
        durationMinutes: 30,
        patientName: 'X',
      },
    });
    expect(rows[0]!.blocks).toHaveLength(0);
    expect(rows[1]!.blocks[0]).toMatchObject({ startMinute: 600, pending: true });
  });
});

describe('insights state machine', () => {
  it('reaches all phases', () => {
    let s = initialInsightsState;
    expect(insightsPhase(s)).toBe('idle');
    s = insightsReducer(s, { type: 'pending', count: 2 });
    expect(insightsPhase(s)).toBe('unsaved');
    s = insightsReducer(s, { type: 'pending', count: 0 });
    s = insightsReducer(s, { type: 'optimized', proposal: proposal() });
    expect(insightsPhase(s)).toBe('awaiting');
    expect(waitImprovement(s.proposal!)).toBe(8);
    const phaseOf = (p: OptimizationProposal) =>
      insightsPhase(insightsReducer(s, { type: 'optimized', proposal: p }));
    expect(phaseOf(proposal({ unresolved }))).toBe('conflicts');
    expect(phaseOf(proposal({ moves: [], unresolved }))).toBe('noAlternatives');
    expect(phaseOf(proposal({ status: 'NO_IMPROVEMENT', moves: [] }))).toBe('noImprovement');
    expect(insightsPhase(insightsReducer(s, { type: 'stale' }))).toBe('stale');
    const applied = insightsReducer(s, {
      type: 'applied',
      proposal: proposal({ state: 'APPLIED' }),
    });
    expect(insightsPhase(applied)).toBe('success');
    expect(insightsPhase(insightsReducer(applied, { type: 'undone' }))).toBe('idle');
  });
  it('drops an unapplied proposal when a manual change appears', () => {
    const s = insightsReducer(
      insightsReducer(initialInsightsState, { type: 'optimized', proposal: proposal() }),
      { type: 'pending', count: 1 },
    );
    expect(insightsPhase(s)).toBe('unsaved');
  });
});
