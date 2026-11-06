/** Pure reminder planning and notification keys (APP-5, RT-3). */
export interface PlannedReminder {
  channel: 'SMS' | 'EMAIL';
  offsetMinutes: number;
  scheduledFor: Date;
}

/**
 * Reminders for an appointment: (appointment channels ∩ clinic channels) x clinic offsets,
 * keeping only those whose send time is still in the future.
 */
export function planReminders(
  startsAt: Date,
  appointmentChannels: string[],
  clinicChannels: string[],
  offsets: number[],
  now: Date,
): PlannedReminder[] {
  const channels = [...new Set(appointmentChannels)]
    .filter(
      (c): c is 'SMS' | 'EMAIL' => (c === 'SMS' || c === 'EMAIL') && clinicChannels.includes(c),
    )
    .sort();
  const planned: PlannedReminder[] = [];
  for (const channel of channels) {
    for (const offsetMinutes of [...new Set(offsets)].sort((a, b) => b - a)) {
      const scheduledFor = new Date(startsAt.getTime() - offsetMinutes * 60_000);
      if (scheduledFor.getTime() > now.getTime())
        planned.push({ channel, offsetMinutes, scheduledFor });
    }
  }
  return planned;
}

/** Idempotency keys: the same event for the same entity always yields the same key. */
export function notificationDedupeKey(
  event: string,
  entityId: string,
  discriminator?: string | number,
): string {
  return discriminator === undefined
    ? `${event}:${entityId}`
    : `${event}:${entityId}:${discriminator}`;
}

/** Deterministic mock outcome: fails when the delivery id starts with hex 'f'. */
export function mockProviderFails(deliveryId: string): boolean {
  return deliveryId.toLowerCase().startsWith('f');
}
