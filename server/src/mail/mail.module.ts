import { Global, Module } from '@nestjs/common';
import { ConsoleMailService } from './mail.service';

export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

@Global()
@Module({
  providers: [{ provide: MAIL_SERVICE, useClass: ConsoleMailService }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
