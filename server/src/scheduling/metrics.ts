/**
 * Day metrics and the waiting model (SMT-1). Pure functions, no I/O.
 *
 * Waiting model (see docs/scheduling-metrics.md): a doctor's appointments are served in
 * start order; service time = duration x OVERRUN_FACTOR; finish_i = max(start_i, finish_{i-1}) + service_i;
 * wait_i = max(0, finish_{i-1} - start_i). Doctor estimate = average wait, clinic estimate = average
 * over all appointments.
 */
import type { DayMetrics, DayMetricsTotals, DoctorDayMetrics } from '@riaya/shared';
import { mergeIntervals, totalMinutes, type Interval } from '../core/availability';

export const MINUTE_MS = 60_000;
export const OVERRUN_FACTOR = 1.15;

export interface MetricAppointment {
  doctorId: string;
  start: number;
  end: number;
}

export interface MetricDoctor {
  id: string;
  available: Interval[];
}

/** Wait of every appointment (minutes), in start order. */
export function waitsForDoctor(appointments: { start: number; end: number }[]): number[] {
  const sorted = [...appointments].sort((a, b) => a.start - b.start || a.end - b.end);
  const waits: number[] = [];
  let previousFinish = Number.NEGATIVE_INFINITY;
  for (const appointment of sorted) {
    const wait = Number.isFinite(previousFinish)
      ? Math.max(0, previousFinish - appointment.start) / MINUTE_MS
      : 0;
    waits.push(wait);
    const service = (appointment.end - appointment.start) * OVERRUN_FACTOR;
    previousFinish = Math.max(appointment.start, previousFinish) + service;
  }
  return waits;
}

export function sumWaits(appointments: { start: number; end: number }[]): number {
  return waitsForDoctor(appointments).reduce((a, b) => a + b, 0);
}

/** Booked time clipped to availability, merged so overlapping bookings are not counted twice. */
function clippedBooked(available: Interval[], appointments: { start: number; end: number }[]) {
  const clipped: Interval[] = [];
  for (const slot of available) {
    for (const a of appointments) {
      const start = Math.max(slot.start, a.start);
      const end = Math.min(slot.end, a.end);
      if (end > start) clipped.push({ start, end });
    }
  }
  return mergeIntervals(clipped);
}

function idleGaps(available: Interval[], booked: Interval[]): number {
  let gaps = 0;
  for (const slot of available) {
    const inside = booked.filter((b) => b.start >= slot.start && b.end <= slot.end);
    for (let i = 1; i < inside.length; i++) {
      gaps += (inside[i]!.start - inside[i - 1]!.end) / MINUTE_MS;
    }
  }
  return gaps;
}

export function doctorMetrics(
  doctor: MetricDoctor,
  appointments: { start: number; end: number }[],
): DoctorDayMetrics {
  const availableMinutes = totalMinutes(doctor.available);
  const booked = clippedBooked(doctor.available, appointments);
  const bookedMinutes = totalMinutes(booked);
  const waits = waitsForDoctor(appointments);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  return {
    doctorId: doctor.id,
    bookedMinutes: round1(bookedMinutes),
    availableMinutes: round1(availableMinutes),
    freeMinutes: round1(Math.max(0, availableMinutes - bookedMinutes)),
    idleGapMinutes: round1(idleGaps(doctor.available, booked)),
    utilisation: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0,
    estimatedWaitMinutes: round1(average),
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeDayMetrics(
  date: string,
  doctors: MetricDoctor[],
  appointments: MetricAppointment[],
): DayMetrics {
  const perDoctor = doctors.map((doctor) =>
    doctorMetrics(
      doctor,
      appointments.filter((a) => a.doctorId === doctor.id),
    ),
  );
  const known = new Set(doctors.map((d) => d.id));
  const counted = appointments.filter((a) => known.has(a.doctorId));
  const available = perDoctor.reduce((s, d) => s + d.availableMinutes, 0);
  const booked = perDoctor.reduce((s, d) => s + d.bookedMinutes, 0);
  const waitSum = doctors.reduce(
    (s, d) => s + sumWaits(counted.filter((a) => a.doctorId === d.id)),
    0,
  );
  const totals: DayMetricsTotals = {
    appointments: counted.length,
    bookedMinutes: round1(booked),
    availableMinutes: round1(available),
    utilisation: available > 0 ? Math.round((booked / available) * 100) : 0,
    availability: available > 0 ? Math.round(((available - booked) / available) * 100) : 0,
    idleGapMinutes: round1(perDoctor.reduce((s, d) => s + d.idleGapMinutes, 0)),
    estimatedWaitMinutes: counted.length ? round1(waitSum / counted.length) : 0,
  };
  return { date, perDoctor, totals };
}
