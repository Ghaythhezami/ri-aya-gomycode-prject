import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { REMINDER_PROVIDER, type ReminderProvider } from './reminder.provider';

export const PROCESS_INTERVAL_MS = 30_000;

/**
 * Sends due reminders (APP-5). DB-backed scheduler (see docs/adr/0002-reminders-scheduler.md):
 * a row is claimed by an optimistic `attempts` increment, so two instances never send twice.
 * Only SENT rows are ever reported as sent.
 */
@Injectable()
export class ReminderProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REMINDER_PROVIDER) private readonly provider: ReminderProvider,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || process.env.VERCEL) return;
    this.timer = setInterval(() => {
      void this.processDue(new Date(), 50).catch((e: Error) =>
        this.logger.warn(`Reminder run failed: ${e.message}`),
      );
    }, PROCESS_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processDue(
    now: Date,
    limit = 50,
  ): Promise<{ sent: number; failed: number; cancelled: number }> {
    const result = { sent: 0, failed: 0, cancelled: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const due = await this.prisma.reminderDelivery.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: now } },
        orderBy: { scheduledFor: 'asc' },
        take: limit,
        include: {
          appointment: {
            select: {
              code: true,
              startsAt: true,
              status: true,
              patient: { select: { phone: true, email: true } },
            },
          },
        },
      });
      for (const delivery of due) {
        const claim = await this.prisma.reminderDelivery.updateMany({
          where: { id: delivery.id, status: 'PENDING', attempts: delivery.attempts },
          data: { attempts: { increment: 1 } },
        });
        if (claim.count !== 1) continue;
        const appointment = delivery.appointment;
        if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(appointment.status)) {
          await this.prisma.reminderDelivery.update({
            where: { id: delivery.id },
            data: { status: 'CANCELLED' },
          });
          result.cancelled++;
          continue;
        }
        try {
          await this.provider.send({
            deliveryId: delivery.id,
            channel: delivery.channel === 'EMAIL' ? 'EMAIL' : 'SMS',
            to:
              delivery.channel === 'EMAIL' ? appointment.patient.email : appointment.patient.phone,
            appointmentCode: appointment.code,
            startsAt: appointment.startsAt,
          });
          await this.prisma.reminderDelivery.update({
            where: { id: delivery.id },
            data: { status: 'SENT', sentAt: now, error: null },
          });
          result.sent++;
        } catch (error) {
          await this.prisma.reminderDelivery.update({
            where: { id: delivery.id },
            data: { status: 'FAILED', error: (error as Error).message.slice(0, 300) },
          });
          result.failed++;
        }
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
