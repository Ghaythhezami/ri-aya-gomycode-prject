import { Injectable, Logger } from '@nestjs/common';
import { renderInvitation, renderPasswordReset } from './templates';

/** The recorded outcome of a send attempt (FR-041, AC-048). */
export interface DeliveryOutcome {
  status: 'SENT' | 'FAILED';
  /** Provider error message when the send failed; never contains credentials. */
  error?: string;
}

export interface MailService {
  sendPasswordReset(
    email: string,
    resetUrl: string,
    locale?: 'en' | 'ar' | 'fr',
  ): Promise<DeliveryOutcome>;
  /** Invitation to join a clinic with a role (FR-007, BP-047). */
  sendInvitation(params: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: 'en' | 'ar' | 'fr';
  }): Promise<DeliveryOutcome>;
}

/**
 * Console transport for local development and test. It records that a message
 * was rendered but writes nothing to a real inbox, so it always reports SENT.
 * No template value is interpolated unescaped (NFR-005), and neither the accept
 * URL nor the reset URL is logged: both carry a raw single-use token, and AC-046
 * forbids writing that token to a log. Use the Mailtrap inbox to read the link,
 * or set SMTP_HOST and SMTP_USER so the real transport is selected.
 */
@Injectable()
export class ConsoleMailService implements MailService {
  private readonly logger = new Logger('MailService');

  async sendPasswordReset(
    email: string,
    resetUrl: string,
    locale?: 'en' | 'ar' | 'fr',
  ): Promise<DeliveryOutcome> {
    const rendered = renderPasswordReset({ resetUrl, locale });
    this.logger.log(`Password reset email for ${email} (${rendered.subject})`);
    return { status: 'SENT' };
  }

  async sendInvitation(params: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: 'en' | 'ar' | 'fr';
  }): Promise<DeliveryOutcome> {
    const rendered = renderInvitation(params);
    this.logger.log(
      `Invitation for ${params.email} to ${params.clinicName} as ${params.role} (${params.locale ?? 'en'}, ${rendered.subject})`,
    );
    return { status: 'SENT' };
  }
}
