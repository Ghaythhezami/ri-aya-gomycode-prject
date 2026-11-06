import { mergeIntervals, subtractIntervals, type Interval } from '../core/availability';

const MINUTE = 60_000;

export interface Utilisation {
  bookedMinutes: number;
  availableMinutes: number;
  /** round(100 * booked / available), 0 when there is no availability. */
  utilisation: number;
}

/**
 * Booked minutes are clipped to the available intervals (time outside working
 * hours, in a break or on leave does not count) and overlapping bookings are
 * counted once.
 */
export function computeUtilisation(available: Interval[], booked: Interval[]): Utilisation {
  const free = mergeIntervals(available);
  const availableMs = free.reduce((sum, i) => sum + (i.end - i.start), 0);
  if (availableMs <= 0) return { bookedMinutes: 0, availableMinutes: 0, utilisation: 0 };
  // booked ∩ free = booked − (free complement); compute as booked − (booked − free).
  const mergedBooked = mergeIntervals(booked);
  const outside = subtractIntervals(mergedBooked, free);
  const bookedMs =
    mergedBooked.reduce((sum, i) => sum + (i.end - i.start), 0) -
    outside.reduce((sum, i) => sum + (i.end - i.start), 0);
  const bookedMinutes = Math.round(bookedMs / MINUTE);
  const availableMinutes = Math.round(availableMs / MINUTE);
  return {
    bookedMinutes,
    availableMinutes,
    utilisation: Math.min(100, Math.round((100 * bookedMinutes) / availableMinutes)),
  };
}
