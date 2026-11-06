import { Injectable } from '@nestjs/common';
import { normalizeLocalized, type ClinicReference, type RoomDto } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { localizedValue, roomName, toDoctorRef } from '../common/mappers';
import { RequestLocale } from '../common/locale/request-locale';

const TTL_SECONDS = 60;

export function toRoomDto(room: {
  id: string;
  name: string;
  nameI18n?: unknown;
  kind: string;
  isActive: boolean;
}): RoomDto {
  return {
    id: room.id,
    name: roomName(room),
    nameI18n: normalizeLocalized(room.nameI18n),
    kind: room.kind,
    isActive: room.isActive,
  };
}

const CACHE_LOCALES = ['-', 'en', 'fr', 'ar'];

/** GET /clinic/reference: lookup data, cached 60 s per clinic under `reference:{clinicId}`. */
@Injectable()
export class ClinicReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly settings: ClinicSettingsReader,
  ) {}

  /** Names are localized per request language, so the cache holds one entry per language. */
  static cacheKey(clinicId: string, locale: string | null = RequestLocale.get()): string {
    return locale ? `reference:${clinicId}:${locale}` : `reference:${clinicId}`;
  }

  async get(clinicId: string): Promise<ClinicReference> {
    const key = ClinicReferenceService.cacheKey(clinicId);
    const cached = await this.cache.get<ClinicReference>(key);
    if (cached) return cached;

    const [settings, clinicRow, doctors, rooms] = await Promise.all([
      this.settings.get(clinicId),
      this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { nameI18n: true } }),
      this.prisma.doctor.findMany({
        where: { clinicId, isActive: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          firstNameI18n: true,
          lastNameI18n: true,
          specialty: true,
        },
      }),
      this.prisma.room.findMany({ where: { clinicId, isActive: true }, orderBy: { name: 'asc' } }),
    ]);
    const reference: ClinicReference = {
      clinic: {
        id: settings.clinic.id,
        name: localizedValue(clinicRow?.nameI18n, settings.clinic.name),
        timezone: settings.clinic.timezone,
        defaultLanguage: settings.defaultLanguage,
      },
      doctors: doctors.map(toDoctorRef),
      specialties: [...new Set(doctors.map((d) => d.specialty))].sort((a, b) => a.localeCompare(b)),
      rooms: rooms.map(toRoomDto),
      durations: settings.durations,
      slotMinutes: settings.slotMinutes,
      targetWaitMinutes: settings.targetWaitMinutes,
    };
    await this.cache.set(key, reference, TTL_SECONDS);
    return reference;
  }

  async invalidate(clinicId: string): Promise<void> {
    await Promise.all(
      CACHE_LOCALES.map((l) =>
        this.cache.del(ClinicReferenceService.cacheKey(clinicId, l === '-' ? null : l)),
      ),
    );
  }
}
