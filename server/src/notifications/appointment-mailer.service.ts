import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizeLocalized, pickLocalized } from '@riaya/shared';
import { doctorName } from '../common/mappers';
import { RequestLocale } from '../common/locale/request-locale';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';
import type { AppointmentEmail, AppointmentEmailKind, MailService } from '../mail/mail.service';
import { isDeliverable } from '../mail/resend-mail.service';
import { asMailLocale } from '../mail/templates';

/** Start time in the clinic time zone, in the recipient's language (Latin digits for Arabic). */
export function formatWhen(startsAt: Date, timeZone: string, locale: string): string {
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.DateTimeFormat(tag, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(startsAt);
}

/**
 * Builds and sends appointment e-mails to patients (confirmation, reminder, cancellation,
 * reschedule). Recipients: an address on file, a deliverable domain, and — for a self-registered
 * portal patient — contact details the clinic verified (same rule as reminders).
 */
@Injectable()
export class AppointmentMailer {
  private readonly logger = new Logger(AppointmentMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  async compose(
    appointmentId: string,
    kind: AppointmentEmailKind,
    opts: { requireEmailPreference?: boolean } = {},
  ): Promise<AppointmentEmail | null> {
    const a = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            email: true,
            contactPreference: true,
            source: true,
            portalAccount: { select: { preferredLocale: true, emailVerifiedAt: true } },
          },
        },
        doctor: {
          select: { firstName: true, lastName: true, firstNameI18n: true, lastNameI18n: true },
        },
        clinic: { select: { name: true, nameI18n: true, timezone: true } },
      },
    });
    if (!a) return null;
    const p = a.patient;
    const to = p.email?.trim();
    if (!to || !isDeliverable(to)) return null;
    if (opts.requireEmailPreference && p.contactPreference !== 'EMAIL') return null;
    if (p.source === 'PORTAL' && p.portalAccount && !p.portalAccount.emailVerifiedAt) return null;

    const settings = await this.prisma.clinicSettings.findUnique({
      where: { clinicId: a.clinicId },
      select: { defaultLanguage: true, patientPortalEnabled: true },
    });
    const locale = asMailLocale(p.portalAccount?.preferredLocale ?? settings?.defaultLanguage);
    const clinicName = pickLocalized(normalizeLocalized(a.clinic.nameI18n), locale, a.clinic.name);
    const backoffice = process.env.BACKOFFICE_URL;
    const portalOn = settings?.patientPortalEnabled !== false;
    return {
      to,
      locale,
      kind,
      clinicName,
      doctorName: RequestLocale.run(locale, () => doctorName(a.doctor)),
      when: formatWhen(a.startsAt, a.clinic.timezone, locale),
      code: a.code,
      ...(backoffice && portalOn ? { manageUrl: `${backoffice}/portal/appointments` } : {}),
    };
  }

  /** Best effort for event-driven notices: failures are logged (ids only), never thrown. */
  async notify(appointmentId: string, kind: AppointmentEmailKind): Promise<void> {
    try {
      const message = await this.compose(appointmentId, kind, { requireEmailPreference: true });
      if (!message) return;
      await this.mail.sendAppointmentEmail(message);
    } catch (error) {
      this.logger.warn(`${kind} mail for ${appointmentId} not sent: ${(error as Error).name}`);
    }
  }
}
