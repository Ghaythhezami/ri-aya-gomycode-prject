import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AppointmentEmail, MailLocale, MailService } from './mail.service';
import {
  appointmentEmail,
  invitationEmail,
  passwordResetEmail,
  type RenderedEmail,
} from './templates';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;
export const DEFAULT_MAIL_FROM = "RI'AYA <onboarding@resend.dev>";
const STAFF_RESET_MINUTES = 60;
const PORTAL_RESET_MINUTES = 30;

/**
 * Domains that can never receive mail (RFC 2606 / RFC 6761) — the fictional demo data uses
 * them (`@riaya.local`, `@example.com`), so the demo never mails a made-up address.
 */
const RESERVED = /(^|\.)(example|test|invalid|localhost|local)$|(^|\.)example\.(com|net|org)$/i;

export function isDeliverable(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return false;
  return !RESERVED.test(email.slice(at + 1).trim());
}

export class MailNotDeliverableError extends Error {
  constructor() {
    super('No deliverable e-mail address (reserved demo domain or unverified contact); not sent');
    this.name = 'MailNotDeliverableError';
  }
}

export class MailProviderError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Mail provider rejected the message (${status}${detail ? `: ${detail}` : ''})`);
    this.name = 'MailProviderError';
  }
}

/** Resend HTTP transport (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailService implements MailService {
  private readonly logger = new Logger('ResendMail');

  constructor(
    private readonly apiKey: string,
    private readonly from: string = DEFAULT_MAIL_FROM,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendPasswordReset(email: string, resetUrl: string, locale: MailLocale = 'en') {
    await this.send(
      email,
      passwordResetEmail({ locale, clinicName: "RI'AYA", resetUrl, minutes: STAFF_RESET_MINUTES }),
      'password-reset',
    );
  }

  async sendInvitation(p: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: MailLocale;
  }) {
    await this.send(
      p.email,
      invitationEmail({
        locale: p.locale ?? 'en',
        clinicName: p.clinicName,
        role: p.role,
        acceptUrl: p.acceptUrl,
      }),
      'invitation',
    );
  }

  async sendPortalPasswordReset(p: {
    email: string;
    resetUrl: string;
    clinicName: string;
    locale?: MailLocale;
  }) {
    await this.send(
      p.email,
      passwordResetEmail({
        locale: p.locale ?? 'en',
        clinicName: p.clinicName,
        resetUrl: p.resetUrl,
        minutes: PORTAL_RESET_MINUTES,
      }),
      'portal-password-reset',
    );
  }

  async sendAppointmentEmail(m: AppointmentEmail) {
    await this.send(
      m.to,
      appointmentEmail(m),
      `appointment-${m.kind}`,
      `${m.code}:${m.kind}:${m.when}`,
    );
  }

  private async send(
    to: string,
    email: RenderedEmail,
    tag: string,
    idempotencySeed?: string,
  ): Promise<void> {
    if (!isDeliverable(to)) throw new MailNotDeliverableError();
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    };
    // Same appointment + kind + time is sent once even if a job retries (Resend keeps keys 24 h).
    if (idempotencySeed) {
      headers['idempotency-key'] = createHash('sha256')
        .update(`${to}|${idempotencySeed}`)
        .digest('hex')
        .slice(0, 64);
    }
    const response = await this.fetchImpl(RESEND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: 'category', value: tag }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      let detail = '';
      try {
        const body = (await response.json()) as { name?: string; message?: string };
        detail = (body.name ?? body.message ?? '').slice(0, 120);
      } catch {
        // no body
      }
      // Ids and status only: never the recipient address (privacy).
      this.logger.warn(`send ${tag} failed: status ${response.status} ${detail}`);
      throw new MailProviderError(response.status, detail);
    }
  }
}
