import { Injectable } from '@nestjs/common';
import {
  DEFAULT_DURATIONS,
  type AppointmentType,
  type ClinicSettingsDto,
  type Department,
  type OpeningDay,
} from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';

export const DEFAULT_OPENING_HOURS: OpeningDay[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: 8 * 60,
  close: 17 * 60,
  closed: weekday === 6,
}));

export const DEFAULT_APPEARANCE: ClinicSettingsDto['appearance'] = {
  density: 'comfortable',
  highContrast: false,
  reduceMotion: false,
};

const CACHE_TTL_SECONDS = 60;

/**
 * Clinic settings with defaults (SET-1). The row is created lazily on first read,
 * so a clinic that never opened Settings still gets a complete, typed object.
 * Cached in Redis for 60 s; `invalidate` MUST be called after every write.
 */
@Injectable()
export class ClinicSettingsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  static cacheKey(clinicId: string): string {
    return `settings:${clinicId}`;
  }

  async get(clinicId: string): Promise<ClinicSettingsDto> {
    const cached = await this.cache.get<ClinicSettingsDto>(ClinicSettingsReader.cacheKey(clinicId));
    if (cached) return cached;

    const clinic = await this.prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    let row = await this.prisma.clinicSettings.findUnique({ where: { clinicId } });
    if (!row) {
      row = await this.prisma.clinicSettings.upsert({
        where: { clinicId },
        update: {},
        create: {
          clinicId,
          durations: DEFAULT_DURATIONS,
          openingHours: DEFAULT_OPENING_HOURS as never,
          departments: [],
          appearance: DEFAULT_APPEARANCE,
        },
      });
    }

    // Appointment types are the source of truth; the stored map is the fallback.
    const typeRows = await this.prisma.appointmentTypeDef.findMany({
      where: { clinicId },
      select: { code: true, durationMinutes: true },
    });
    const durations: Record<AppointmentType, number> = {
      ...DEFAULT_DURATIONS,
      ...((row.durations ?? {}) as Partial<Record<AppointmentType, number>>),
      ...Object.fromEntries(typeRows.map((t) => [t.code, t.durationMinutes])),
    };
    const dto: ClinicSettingsDto = {
      clinic: {
        id: clinic.id,
        name: clinic.name,
        code: `CL-${clinic.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        address: clinic.address,
        timezone: clinic.timezone,
        currency: clinic.currency,
      },
      contactEmail: row.contactEmail,
      phone: row.phone,
      defaultLanguage: (['en', 'ar', 'fr'].includes(row.defaultLanguage)
        ? row.defaultLanguage
        : 'en') as ClinicSettingsDto['defaultLanguage'],
      cancellationNoticeHours: row.cancellationNoticeHours,
      requireCancelReason: row.requireCancelReason,
      targetWaitMinutes: row.targetWaitMinutes,
      slotMinutes: row.slotMinutes,
      durations,
      reminderOffsets: row.reminderOffsets,
      reminderChannels: row.reminderChannels.filter(
        (c): c is 'SMS' | 'EMAIL' => c === 'SMS' || c === 'EMAIL',
      ),
      openingHours: Array.isArray(row.openingHours)
        ? (row.openingHours as unknown as OpeningDay[])
        : DEFAULT_OPENING_HOURS,
      departments: Array.isArray(row.departments)
        ? (row.departments as unknown as Department[])
        : [],
      appearance: { ...DEFAULT_APPEARANCE, ...((row.appearance ?? {}) as object) },
      updatedAt: row.updatedAt.toISOString(),
    };
    await this.cache.set(ClinicSettingsReader.cacheKey(clinicId), dto, CACHE_TTL_SECONDS);
    return dto;
  }

  async invalidate(clinicId: string): Promise<void> {
    await this.cache.del(ClinicSettingsReader.cacheKey(clinicId));
    // Reference data is cached per language (ClinicReferenceService.cacheKey); clear each.
    await Promise.all(
      ['', ':en', ':ar', ':fr'].map((suffix) => this.cache.del(`reference:${clinicId}${suffix}`)),
    );
  }
}
