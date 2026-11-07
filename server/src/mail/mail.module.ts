import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleMailService, type MailService } from './mail.service';
import { DEFAULT_MAIL_FROM, ResendMailService } from './resend-mail.service';

export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

/** Resend when `RESEND_API_KEY` is set, otherwise the console transport (local development). */
export function createMailService(config?: Pick<ConfigService, 'get'>): MailService {
  const get = (key: string) => config?.get<string>(key) ?? process.env[key];
  const key = get('RESEND_API_KEY')?.trim();
  if (!key) return new ConsoleMailService();
  const from = get('MAIL_FROM')?.trim() || DEFAULT_MAIL_FROM;
  new Logger('MailService').log(
    `Resend transport enabled (from ${from.replace(/<.*>/, '').trim() || 'default'})`,
  );
  return new ResendMailService(key, from);
}

@Global()
@Module({
  providers: [
    {
      provide: MAIL_SERVICE,
      useFactory: (config?: ConfigService) => createMailService(config),
      inject: [{ token: ConfigService, optional: true }],
    },
  ],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
