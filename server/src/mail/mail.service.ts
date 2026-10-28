import { Injectable, Logger } from '@nestjs/common';

export interface MailService {
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
  /** Invitation to join a clinic with a role (FR-007, BP-047). */
  sendInvitation(params: {
    email: string;
    acceptUrl: string;
    clinicName: string;
    role: string;
    locale?: 'en' | 'ar' | 'fr';
  }): Promise<void>;
}

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
    locale?: 'en' | 'ar' | 'fr';
  }): Promise<void> {
    // Console transport for local development. A real provider is swapped in
    // behind this interface; no template values are interpolated unescaped
    // (NFR-005).
    this.logger.log(
      `Invitation for ${params.email} to ${params.clinicName} as ${params.role} (${params.locale ?? 'en'}): ${params.acceptUrl}`,
    );
  }
}
