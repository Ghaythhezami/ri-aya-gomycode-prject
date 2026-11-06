import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { renderInvitation, renderPasswordReset } from './templates';
import type { DeliveryOutcome, MailService } from './mail.service';

/**
 * SMTP transport backed by Mailtrap (FR-039, NFR-014).
 *
 * Credentials are read ONLY from environment variables, are never logged, and a
 * send failure is reported as an outcome rather than thrown, so the invitation
 * transaction that already committed is never rolled back (NFR-016, AC-049).
 */
@Injectable()
export class SmtpMailService implements MailService {
  private readonly logger = new Logger('SmtpMailService');
  private readonly from: string;
  private readonly transporter: Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    this.from = process.env.MAIL_FROM ?? "Ri'aya <no-reply@riaya.local>";

    // A misconfigured transport still constructs; the failure surfaces per send
    // as a FAILED outcome, so one bad config does not crash boot.
    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  /** Send one message and normalise the result into a delivery outcome. */
  private async deliver(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<DeliveryOutcome> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, text });
      return { status: 'SENT' };
    } catch (error) {
      // The error text can contain the SMTP response; it never contains the
      // password, which is held only inside the transport's auth config.
      const message = error instanceof Error ? error.message : 'Unknown mail error';
      this.logger.warn(`Delivery to ${to} failed: ${message}`);
      return { status: 'FAILED', error: message };
    }
  }

  async sendPasswordReset(
    email: string,
    resetUrl: string,
    locale?: 'en' | 'ar' | 'fr',
  ): Promise<DeliveryOutcome> {
    const rendered = renderPasswordReset({ resetUrl, locale });
    return this.deliver(email, rendered.subject, rendered.html, rendered.text);
  }

  async sendInvitation(params: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: 'en' | 'ar' | 'fr';
  }): Promise<DeliveryOutcome> {
    const rendered = renderInvitation(params);
    return this.deliver(params.email, rendered.subject, rendered.html, rendered.text);
  }
}
