import { Global, Module } from '@nestjs/common';
import { ConsoleMailService, type MailService } from './mail.service';
import { SmtpMailService } from './smtp-mail.service';

export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

/**
 * Resolves the mail transport from configuration (FR-039).
 *
 * When SMTP host and credentials are present the real SMTP transport is used;
 * otherwise the console transport stays for local and test, so a developer with
 * no provider still runs the full invitation flow (the link is logged). The
 * MAIL_SERVICE token contract is unchanged, so no consumer changes.
 */
const mailServiceFactory = (): MailService =>
  process.env.SMTP_HOST && process.env.SMTP_USER ? new SmtpMailService() : new ConsoleMailService();

@Global()
@Module({
  providers: [{ provide: MAIL_SERVICE, useFactory: mailServiceFactory }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
