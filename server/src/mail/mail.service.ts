import { Injectable, Logger } from '@nestjs/common';

export type MailLocale = 'en' | 'ar' | 'fr';

export type AppointmentEmailKind = 'confirmation' | 'reminder' | 'cancelled' | 'rescheduled';

export interface AppointmentEmail {
  to: string;
  locale: MailLocale;
  kind: AppointmentEmailKind;
  clinicName: string;
  doctorName: string;
  /** Start, already formatted in the clinic time zone and the recipient's locale. */
  when: string;
  /** Appointment code, e.g. AP-1042. */
  code: string;
  /** Link to the patient portal (appointments page), when the clinic has the portal on. */
  manageUrl?: string;
}

/**
 * Outgoing e-mail. Implementations throw when the provider rejects the message so callers can
 * record a failure; callers that must not leak account existence (password reset) catch.
 */
export interface MailService {
  sendPasswordReset(email: string, resetUrl: string, locale?: MailLocale): Promise<void>;
  /** Invitation to join a clinic with a role (FR-007, BP-047). */
  sendInvitation(params: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: MailLocale;
  }): Promise<void>;
  /** Patient portal password reset (one-time link, 30 minutes). */
  sendPortalPasswordReset(params: {
    email: string;
    resetUrl: string;
    clinicName: string;
    locale?: MailLocale;
  }): Promise<void>;
  /** Appointment confirmation, reminder, cancellation or reschedule notice to a patient. */
  sendAppointmentEmail(message: AppointmentEmail): Promise<void>;
}

/** Local development transport: logs instead of sending (no provider key configured). */
@Injectable()
export class ConsoleMailService implements MailService {
  private readonly logger = new Logger('MailService');

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    this.logger.log(`Password reset email for ${email}: ${resetUrl}`);
  }

  async sendInvitation(params: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: MailLocale;
  }): Promise<void> {
    this.logger.log(
      `Invitation for ${params.email} to ${params.clinicName} as ${params.role} (${params.locale ?? 'en'}): ${params.acceptUrl}`,
    );
  }

  async sendPortalPasswordReset(params: {
    email: string;
    resetUrl: string;
    clinicName: string;
    locale?: MailLocale;
  }): Promise<void> {
    this.logger.log(`Portal password reset for ${params.email}: ${params.resetUrl}`);
  }

  async sendAppointmentEmail(message: AppointmentEmail): Promise<void> {
    this.logger.log(`Appointment ${message.kind} email for ${message.code} (${message.locale})`);
  }
}
