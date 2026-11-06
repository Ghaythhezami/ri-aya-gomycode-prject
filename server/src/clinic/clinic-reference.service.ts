import { Injectable } from '@nestjs/common';
import type { ClinicReference, RoomDto } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { toDoctorRef } from '../common/mappers';

const TTL_SECONDS = 60;

export function toRoomDto(room: {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
}): RoomDto {
  return { id: room.id, name: room.name, kind: room.kind, isActive: room.isActive };
}

/** GET /clinic/reference: lookup data, cached 60 s per clinic under `reference:{clinicId}`. */
@Injectable()
export class ClinicReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly settings: ClinicSettingsReader,
  ) {}

  static cacheKey(clinicId: string): string {
    return `reference:${clinicId}`;
  }

  async get(clinicId: string): Promise<ClinicReference> {
    const key = ClinicReferenceService.cacheKey(clinicId);
    const cached = await this.cache.get<ClinicReference>(key);
    if (cached) return cached;

    const [settings, doctors, rooms] = await Promise.all([
      this.settings.get(clinicId),
      this.prisma.doctor.findMany({
        where: { clinicId, isActive: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, specialty: true },
      }),
      this.prisma.room.findMany({ where: { clinicId, isActive: true }, orderBy: { name: 'asc' } }),
    ]);
    const reference: ClinicReference = {
      clinic: {
        id: settings.clinic.id,
        name: settings.clinic.name,
        timezone: settings.clinic.timezone,
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
    await this.cache.del(ClinicReferenceService.cacheKey(clinicId));
  }
}
