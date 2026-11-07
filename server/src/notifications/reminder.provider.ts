import { Inject, Injectable } from '@nestjs/common';
import { MAIL_SERVICE } from '../mail/mail.module';
import type { MailService } from '../mail/mail.service';
import { MailNotDeliverableError, ResendMailService } from '../mail/resend-mail.service';
import { AppointmentMailer } from './appointment-mailer.service';
import { mockProviderFails } from './reminder-schedule';

export interface ReminderMessage {
  deliveryId: string;
  appointmentId: string;
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

/**
 * E-mail reminders go through the configured mail transport (Resend) with the localized
 * appointment template; SMS stays on the mock gateway until an SMS provider is configured.
 * Without a mail key (local, tests) every channel uses the deterministic mock.
 */
@Injectable()
export class MailReminderProvider implements ReminderProvider {
  private readonly mock = new MockReminderProvider();

  constructor(
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    private readonly mailer: AppointmentMailer,
  ) {}

  async send(message: ReminderMessage): Promise<string> {
    if (message.channel !== 'EMAIL' || !(this.mail instanceof ResendMailService)) {
      return this.mock.send(message);
    }
    const email = await this.mailer.compose(message.appointmentId, 'reminder');
    if (!email) throw new MailNotDeliverableError();
    await this.mail.sendAppointmentEmail(email);
    return `resend-${message.deliveryId.slice(0, 8)}`;
  }
}
