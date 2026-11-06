import type { OptimizationProposal, SchedulingDay } from '@riaya/shared';
import { clamp, localMinutes } from './gridMath';

export interface FreeGap {
  startMinute: number;
  minutes: number;
}

/** Largest free interval of a doctor inside working hours, minus breaks and appointments. */
export function largestGap(
  doctor: SchedulingDay['doctors'][number],
  timeZone: string,
  dayStart: number,
  dayEnd: number,
  minMinutes = 15,
): FreeGap | null {
  const range = (r: { startsAt: string; endsAt: string }) => {
    const end = localMinutes(r.endsAt, timeZone);
    return {
      start: clamp(localMinutes(r.startsAt, timeZone), dayStart, dayEnd),
      end: clamp(end === 0 ? dayEnd : end, dayStart, dayEnd),
    };
  };
  const busy = [
    ...doctor.breaks.map(range),
    ...doctor.blocks.map((b) => ({
      start: clamp(localMinutes(b.startsAt, timeZone), dayStart, dayEnd),
      end: clamp(localMinutes(b.endsAt, timeZone) || dayEnd, dayStart, dayEnd),
    })),
  ].sort((a, b) => a.start - b.start);
  let best: FreeGap | null = null;
  for (const w of doctor.work.map(range).filter((r) => r.end > r.start)) {
    let cursor = w.start;
    const consider = (until: number) => {
      const minutes = until - cursor;
      if (minutes >= minMinutes && (!best || minutes > best.minutes)) {
        best = { startMinute: cursor, minutes };
      }
    };
    for (const b of busy) {
      if (b.end <= cursor || b.start >= w.end) continue;
      consider(Math.min(b.start, w.end));
      cursor = Math.max(cursor, b.end);
    }
    consider(w.end);
  }
  return best;
}

export type Recommendation =
  | {
      kind: 'move';
      key: string;
      appointmentId: string;
      patientName: string;
      from: string;
      to: string;
      toDoctorId: string;
    }
  | {
      kind: 'gap';
      key: string;
      doctorId: string;
      name: string;
      minutes: number;
      startMinute: number;
    }
  | {
      kind: 'balance';
      key: string;
      appointmentId: string;
      patientName: string;
      toDoctorId: string;
    };

/** Insight rows: one per move, one gap row per idle doctor, one balance row for a doctor change. */
export function buildRecommendations(
  proposal: OptimizationProposal | null,
  day: SchedulingDay,
  idle: { doctorId: string; name: string }[],
  slot: number,
): Recommendation[] {
  const out: Recommendation[] = [];
  for (const m of proposal?.moves ?? []) {
    out.push({
      kind: 'move',
      key: `move-${m.appointmentId}`,
      appointmentId: m.appointmentId,
      patientName: m.patientName,
      from: m.fromStartsAt,
      to: m.toStartsAt,
      toDoctorId: m.toDoctorId,
    });
  }
  for (const d of idle) {
    const doctor = day.doctors.find((x) => x.id === d.doctorId);
    const gap = doctor
      ? largestGap(doctor, day.timezone, day.dayStartMinute, day.dayEndMinute, slot)
      : null;
    if (gap) {
      out.push({
        kind: 'gap',
        key: `gap-${d.doctorId}`,
        doctorId: d.doctorId,
        name: d.name,
        minutes: gap.minutes,
        startMinute: gap.startMinute,
      });
    }
  }
  const transfer = proposal?.moves.find((m) => m.fromDoctorId !== m.toDoctorId);
  if (transfer) {
    out.push({
      kind: 'balance',
      key: `balance-${transfer.appointmentId}`,
      appointmentId: transfer.appointmentId,
      patientName: transfer.patientName,
      toDoctorId: transfer.toDoctorId,
    });
  }
  return out;
}
