import { Injectable } from '@nestjs/common';
import { mockProviderFails } from './reminder-schedule';

export interface ReminderMessage {
  deliveryId: string;
  channel: 'SMS' | 'EMAIL';
  to: string | null;
  appointmentCode: string;
  startsAt: Date;
}

export interface ReminderProvider {
  /** Resolves with the provider message id, rejects on failure. */
  send(message: ReminderMessage): Promise<string>;
}

export const REMINDER_PROVIDER = Symbol('REMINDER_PROVIDER');

/** Deterministic stand-in for an SMS/e-mail gateway: ids starting with hex 'f' fail. */
@Injectable()
export class MockReminderProvider implements ReminderProvider {
  async send(message: ReminderMessage): Promise<string> {
    if (mockProviderFails(message.deliveryId)) {
      throw new Error('Mock provider: delivery rejected');
    }
    return `mock-${message.channel.toLowerCase()}-${message.deliveryId.slice(0, 8)}`;
  }
}
