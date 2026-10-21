import { Injectable, Logger } from '@nestjs/common';

export interface MailService {
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
}

@Injectable()
export class ConsoleMailService implements MailService {
  private readonly logger = new Logger('MailService');

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    this.logger.log(`Password reset email for ${email}: ${resetUrl}`);
  }
}
