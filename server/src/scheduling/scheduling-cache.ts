import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { toLocalDate } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import type { DomainEvent, DomainEventType } from '../events/domain-events';
import { DomainEventsService } from '../events/domain-events.service';
import { SchedulingService } from './scheduling.service';

const APPOINTMENT_EVENTS: DomainEventType[] = [
  'appointment.created',
  'appointment.updated',
  'appointment.rescheduled',
  'appointment.cancelled',
  'appointment.status_changed',
  'schedule.optimized',
];

const DASHBOARD_EVENTS: DomainEventType[] = [
  'queue.updated',
  'patient.created',
  'settings.updated',
];

/** Drops cached day metrics and the dashboard when the schedule or queue changes (SMT-1). */
@Injectable()
export class SchedulingCache implements OnModuleInit {
  /** The dashboard is cached per language; drop every variant. */
  static async dropDashboard(cache: RedisCacheService, clinicId: string): Promise<void> {
    await Promise.all(
      ['', ':en', ':ar', ':fr'].map((suffix) => cache.del(`dashboard:${clinicId}${suffix}`)),
    );
  }

  constructor(
    private readonly events: DomainEventsService,
    private readonly cache: RedisCacheService,
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
  ) {}

  onModuleInit(): void {
    for (const type of APPOINTMENT_EVENTS) this.events.on(type, (e) => this.invalidate(e));
    for (const type of DASHBOARD_EVENTS) {
      this.events.on(type, (e) => void SchedulingCache.dropDashboard(this.cache, e.clinicId));
    }
  }

  private async dates(e: DomainEvent, timeZone: string): Promise<Set<string>> {
    const out = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value !== 'string') return;
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) out.add(toLocalDate(d, timeZone));
    };
    add(e.payload.startsAt);
    add(e.payload.fromStartsAt);
    add(e.payload.toStartsAt);
    if (typeof e.payload.date === 'string') out.add(e.payload.date);
    if (!out.size && typeof e.payload.appointmentId === 'string') {
      const a = await this.prisma.appointment.findFirst({
        where: { id: e.payload.appointmentId, clinicId: e.clinicId },
        select: { startsAt: true },
      });
      if (a) out.add(toLocalDate(a.startsAt, timeZone));
    }
    if (!out.size) out.add(toLocalDate(new Date(), timeZone));
    return out;
  }

  async invalidate(e: DomainEvent): Promise<void> {
    // Dashboard first: it must be dropped even if the settings lookup fails.
    await SchedulingCache.dropDashboard(this.cache, e.clinicId);
    const timeZone = (await this.settings.get(e.clinicId)).clinic.timezone;
    for (const date of await this.dates(e, timeZone)) {
      await this.cache.del(SchedulingService.metricsKey(e.clinicId, date));
    }
  }
}
