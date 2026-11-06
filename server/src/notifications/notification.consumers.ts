import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import type { DomainEvent } from '../events/domain-events';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { doctorName } from '../common/mappers';
import { NotificationsService } from './notifications.service';
import { notificationDedupeKey, planReminders } from './reminder-schedule';

const str = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value);

/**
 * Domain-event consumers (RT-3, APP-5): in-app notifications and reminder rows.
 * Template keys (frontend: notifications.templates.<key>.title / .body):
 * booked, cancelled, rescheduled, noShow, newPatient, availability, delay,
 * scheduleOptimized, scheduleMoved.
 */
@Injectable()
export class NotificationConsumers implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumers.name);

  constructor(
    private readonly events: DomainEventsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: ClinicSettingsReader,
  ) {}

  onModuleInit(): void {
    this.events.on('appointment.created', (e) => this.onCreated(e));
    this.events.on('appointment.cancelled', (e) => this.onCancelled(e));
    this.events.on('appointment.rescheduled', (e) => this.onRescheduled(e));
    this.events.on('appointment.status_changed', (e) => this.onStatusChanged(e));
    this.events.on('patient.created', (e) => this.onPatientCreated(e));
    this.events.on('doctor.availability_changed', (e) => this.onAvailability(e));
  }

  private async params(clinicId: string, appointmentId: string) {
    const a = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { firstName: true, lastName: true } },
      },
    });
    if (!a) return null;
    return {
      appointment: a,
      params: {
        patient: `${a.patient.firstName} ${a.patient.lastName}`.trim(),
        doctor: doctorName(a.doctor),
        time: a.startsAt.toISOString(),
        code: a.code,
      },
    };
  }

  private async onCreated(e: DomainEvent): Promise<void> {
    const appointmentId = str(e.payload.appointmentId);
    const loaded = await this.params(e.clinicId, appointmentId);
    if (!loaded) return;
    await this.notifications.create({
      clinicId: e.clinicId,
      category: 'CONFIRMATION',
      titleKey: 'notifications.templates.booked.title',
      bodyKey: 'notifications.templates.booked.body',
      params: loaded.params,
      entityType: 'appointment',
      entityId: appointmentId,
      dedupeKey: notificationDedupeKey('appointment.created', appointmentId),
    });
    await this.createReminders(e.clinicId, loaded.appointment);
  }

  private async createReminders(
    clinicId: string,
    appointment: { id: string; startsAt: Date; reminderChannels: string[]; status: string },
  ): Promise<void> {
    if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(appointment.status)) return;
    const settings = await this.settings.get(clinicId);
    const planned = planReminders(
      appointment.startsAt,
      appointment.reminderChannels,
      settings.reminderChannels,
      settings.reminderOffsets,
      new Date(),
    );
    if (!planned.length) return;
    await this.prisma.reminderDelivery.createMany({
      data: planned.map((p) => ({
        appointmentId: appointment.id,
        channel: p.channel,
        offsetMinutes: p.offsetMinutes,
        scheduledFor: p.scheduledFor,
      })),
      skipDuplicates: true,
    });
  }

  private async onCancelled(e: DomainEvent): Promise<void> {
    const appointmentId = str(e.payload.appointmentId);
    const loaded = await this.params(e.clinicId, appointmentId);
    await this.cancelPending(appointmentId);
    if (!loaded) return;
    await this.notifications.create({
      clinicId: e.clinicId,
      category: 'CANCELLATION',
      titleKey: 'notifications.templates.cancelled.title',
      bodyKey: 'notifications.templates.cancelled.body',
      params: { ...loaded.params, reason: str(e.payload.reason) },
      entityType: 'appointment',
      entityId: appointmentId,
      dedupeKey: notificationDedupeKey('appointment.cancelled', appointmentId),
    });
  }

  private async cancelPending(appointmentId: string): Promise<void> {
    await this.prisma.reminderDelivery.updateMany({
      where: { appointmentId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  }

  private async onRescheduled(e: DomainEvent): Promise<void> {
    const appointmentId = str(e.payload.appointmentId);
    const loaded = await this.params(e.clinicId, appointmentId);
    if (!loaded) return;
    const { appointment } = loaded;
    const now = new Date();
    const existing = await this.prisma.reminderDelivery.findMany({ where: { appointmentId } });
    for (const row of existing) {
      const scheduledFor = new Date(appointment.startsAt.getTime() - row.offsetMinutes * 60_000);
      await this.prisma.reminderDelivery.update({
        where: { id: row.id },
        data: {
          scheduledFor,
          status: scheduledFor.getTime() > now.getTime() ? 'PENDING' : 'CANCELLED',
          sentAt: null,
          error: null,
          attempts: 0,
        },
      });
    }
    await this.createReminders(e.clinicId, appointment);
    await this.notifications.create({
      clinicId: e.clinicId,
      category: 'AVAILABILITY',
      titleKey: 'notifications.templates.rescheduled.title',
      bodyKey: 'notifications.templates.rescheduled.body',
      params: { ...loaded.params, from: str(e.payload.fromStartsAt) },
      entityType: 'appointment',
      entityId: appointmentId,
      dedupeKey: notificationDedupeKey(
        'appointment.rescheduled',
        appointmentId,
        new Date(str(e.payload.toStartsAt)).getTime() || e.occurredAt.getTime(),
      ),
    });
  }

  private async onStatusChanged(e: DomainEvent): Promise<void> {
    const to = str(e.payload.to);
    if (to !== 'NO_SHOW' && to !== 'CANCELLED') return;
    const appointmentId = str(e.payload.appointmentId);
    await this.cancelPending(appointmentId);
    if (to !== 'NO_SHOW') return;
    const loaded = await this.params(e.clinicId, appointmentId);
    if (!loaded) return;
    await this.notifications.create({
      clinicId: e.clinicId,
      category: 'SYSTEM',
      titleKey: 'notifications.templates.noShow.title',
      bodyKey: 'notifications.templates.noShow.body',
      params: loaded.params,
      entityType: 'appointment',
      entityId: appointmentId,
      dedupeKey: notificationDedupeKey('appointment.no_show', appointmentId),
    });
  }

  private async onPatientCreated(e: DomainEvent): Promise<void> {
    const patientId = str(e.payload.patientId);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: e.clinicId },
      select: { firstName: true, lastName: true, code: true },
    });
    if (!patient) return;
    await this.notifications.create({
      clinicId: e.clinicId,
      category: 'SYSTEM',
      titleKey: 'notifications.templates.newPatient.title',
      bodyKey: 'notifications.templates.newPatient.body',
      params: { patient: `${patient.firstName} ${patient.lastName}`.trim(), code: patient.code },
      entityType: 'patient',
      entityId: patientId,
      dedupeKey: notificationDedupeKey('patient.created', patientId),
    });
  }

  private async onAvailability(e: DomainEvent): Promise<void> {
    const doctorId = str(e.payload.doctorId);
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, clinicId: e.clinicId },
      select: { firstName: true, lastName: true },
    });
    if (!doctor) return;
    await this.notifications.create({
      clinicId: e.clinicId,
      category: 'AVAILABILITY',
      titleKey: 'notifications.templates.availability.title',
      bodyKey: 'notifications.templates.availability.body',
      params: { doctor: doctorName(doctor) },
      entityType: 'doctor',
      entityId: doctorId,
      dedupeKey: notificationDedupeKey(
        'doctor.availability_changed',
        doctorId,
        e.occurredAt.getTime(),
      ),
    });
  }
}
