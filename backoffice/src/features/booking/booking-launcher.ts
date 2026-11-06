import { useSyncExternalStore } from 'react';

/**
 * Global "open the booking wizard" switch (APP-3). Any screen can call
 * `openBooking({ patientId })`; the shell renders the wizard once.
 */
export interface BookingRequest {
  patientId?: string;
  doctorId?: string;
  /** ISO instant to preselect. */
  startsAt?: string;
}

let current: BookingRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openBooking(request: BookingRequest = {}) {
  current = { ...request };
  emit();
}

export function closeBooking() {
  current = null;
  emit();
}

export function useBookingRequest(): BookingRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
