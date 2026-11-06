import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AppointmentTypeDef } from '@prisma/client';
import {
  APPOINTMENT_TYPE_COLORS,
  DEFAULT_DURATIONS,
  hasLocalized,
  normalizeLocalized,
  type AppointmentTypeColor,
  type AppointmentTypeDto,
  type AppointmentTypeInput,
  type LocalizedText,
} from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import {
  MAX_APPOINTMENT_TYPES,
  isValidCode,
  isValidDuration,
  normalizeCode,
  slugCode,
  typeDisplayName,
} from './appointment-type-rules';
import { unprocessable } from './type-errors';

const CACHE_TTL_SECONDS = 300;

export interface TypeScope {
  clinicId: string;
  organizationId: string;
  userId: string;
}

const SYSTEM_TYPES: {
  code: string;
  name: LocalizedText;
  color: AppointmentTypeColor;
  isEmergency: boolean;
  sortOrder: number;
}[] = [
  {
    code: 'CONSULTATION',
    name: { en: 'Consultation', fr: 'Consultation', ar: 'استشارة' },
    color: 'primary',
    isEmergency: false,
    sortOrder: 10,
  },
  {
    code: 'FOLLOW_UP',
    name: { en: 'Follow-up', fr: 'Suivi', ar: 'متابعة' },
    color: 'info',
    isEmergency: false,
    sortOrder: 20,
  },
  {
    code: 'EMERGENCY',
    name: { en: 'Emergency', fr: 'Urgence', ar: 'طوارئ' },
    color: 'alert',
    isEmergency: true,
    sortOrder: 30,
  },
];

function conflict(message: string, details?: unknown) {
  return new ConflictException({ code: 'VALIDATION_FAILED', message, details });
}

function notFound() {
  return new NotFoundException({ code: 'NOT_FOUND', message: 'Appointment type not found' });
}

function toDto(row: AppointmentTypeDef, usage: number): AppointmentTypeDto {
  return {
    id: row.id,
    code: row.code,
    name: normalizeLocalized(row.name),
    displayName: '',
    durationMinutes: row.durationMinutes,
    color: (APPOINTMENT_TYPE_COLORS as readonly string[]).includes(row.color)
      ? (row.color as AppointmentTypeColor)
      : 'primary',
    isEmergency: row.isEmergency,
    isActive: row.isActive,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    usageCount: usage,
  };
}

/** Appointment types of a clinic (ADR 0004 section 2): system types plus custom ones. */
@Injectable()
export class AppointmentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly settings: ClinicSettingsReader,
  ) {}

  static cacheKey(clinicId: string): string {
    return `appointment-types:${clinicId}`;
  }

  // ------------------------------------------------------------------ reads

  /** Create the three system types of a clinic when missing (idempotent). */
  async ensureSystemTypes(clinicId: string): Promise<void> {
    const row = await this.prisma.clinicSettings.findUnique({
      where: { clinicId },
      select: { durations: true },
    });
    const stored = (row?.durations ?? {}) as Record<string, unknown>;
    await this.prisma.appointmentTypeDef.createMany({
      data: SYSTEM_TYPES.map((t) => {
        const minutes = stored[t.code];
        return {
          clinicId,
          code: t.code,
          name: t.name as Prisma.InputJsonValue,
          durationMinutes:
            typeof minutes === 'number' && isValidDuration(minutes)
              ? minutes
              : DEFAULT_DURATIONS[t.code as keyof typeof DEFAULT_DURATIONS],
          color: t.color,
          isEmergency: t.isEmergency,
          isActive: true,
          isSystem: true,
          sortOrder: t.sortOrder,
        };
      }),
      skipDuplicates: true,
    });
    await this.cache.del(AppointmentTypesService.cacheKey(clinicId));
  }

  /** All types with usage counts, sorted; cached 5 minutes, busted on every write. */
  private async loadAll(clinicId: string): Promise<AppointmentTypeDto[]> {
    const key = AppointmentTypesService.cacheKey(clinicId);
    const cached = await this.cache.get<AppointmentTypeDto[]>(key);
    if (cached) return cached;
    let rows = await this.prisma.appointmentTypeDef.findMany({ where: { clinicId } });
    if (rows.length === 0) {
      await this.ensureSystemTypes(clinicId);
      rows = await this.prisma.appointmentTypeDef.findMany({ where: { clinicId } });
    }
    const usage = await this.prisma.appointment.groupBy({
      by: ['type'],
      where: { clinicId },
      _count: { _all: true },
    });
    const counts = new Map(usage.map((u) => [u.type, u._count._all]));
    const items = rows
      .map((r) => toDto(r, counts.get(r.code) ?? 0))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    await this.cache.set(key, items, CACHE_TTL_SECONDS);
    return items;
  }

  private async withNames(
    clinicId: string,
    items: AppointmentTypeDto[],
    locale?: string,
  ): Promise<AppointmentTypeDto[]> {
    const { defaultLanguage } = await this.settings.get(clinicId);
    return items.map((t) => ({
      ...t,
      displayName: typeDisplayName(t.name, t.code, locale, defaultLanguage),
    }));
  }

  async list(
    clinicId: string,
    opts: { includeInactive?: boolean; locale?: string } = {},
  ): Promise<AppointmentTypeDto[]> {
    const all = await this.loadAll(clinicId);
    const visible = opts.includeInactive ? all : all.filter((t) => t.isActive);
    return this.withNames(clinicId, visible, opts.locale);
  }

  async get(clinicId: string, code: string, locale?: string): Promise<AppointmentTypeDto> {
    const found = (await this.loadAll(clinicId)).find((t) => t.code === code.toUpperCase());
    if (!found) throw notFound();
    return (await this.withNames(clinicId, [found], locale))[0]!;
  }

  /** Every type (active or not) keyed by code; used by appointments to decorate rows. */
  async byCode(clinicId: string, locale?: string): Promise<Map<string, AppointmentTypeDto>> {
    const all = await this.withNames(clinicId, await this.loadAll(clinicId), locale);
    return new Map(all.map((t) => [t.code, t]));
  }

  /**
   * The ACTIVE type with this code, or 422 VALIDATION_FAILED (unknown or inactive).
   * Read straight from the table so a just-deactivated type is never accepted from a stale cache.
   */
  async requireActive(clinicId: string, code: string): Promise<AppointmentTypeDto> {
    const row = await this.prisma.appointmentTypeDef.findFirst({
      where: { clinicId, code, isActive: true },
    });
    if (!row) {
      throw unprocessable(`Unknown or inactive appointment type ${code}`, { field: 'type' });
    }
    return toDto(row, 0);
  }

  // ------------------------------------------------------------------ writes

  private async afterWrite(
    scope: TypeScope,
    action: 'created' | 'updated' | 'deleted',
    code: string,
  ): Promise<void> {
    await this.cache.del(AppointmentTypesService.cacheKey(scope.clinicId));
    await this.settings.invalidate(scope.clinicId);
    await this.events.emit({
      type: 'settings.updated',
      clinicId: scope.clinicId,
      organizationId: scope.organizationId,
      actorUserId: scope.userId,
      payload: { keys: ['appointmentTypes'], action, code },
    });
  }

  /** Keep clinic_settings.durations (code to minutes) in step for older readers. */
  private async syncDurations(tx: Prisma.TransactionClient, clinicId: string): Promise<void> {
    const rows = await tx.appointmentTypeDef.findMany({
      where: { clinicId },
      select: { code: true, durationMinutes: true },
    });
    const durations = Object.fromEntries(rows.map((r) => [r.code, r.durationMinutes]));
    await tx.clinicSettings.updateMany({ where: { clinicId }, data: { durations } });
  }

  /** At least one active, non-emergency type must remain bookable. */
  private assertBookableRemains(
    others: { isActive: boolean; isEmergency: boolean }[],
    self?: { isActive: boolean; isEmergency: boolean },
  ): void {
    const count =
      others.filter((t) => t.isActive && !t.isEmergency).length +
      (self && self.isActive && !self.isEmergency ? 1 : 0);
    if (count < 1) {
      throw unprocessable('At least one active, non-emergency appointment type must remain');
    }
  }

  async create(
    scope: TypeScope,
    input: AppointmentTypeInput,
    locale?: string,
  ): Promise<AppointmentTypeDto> {
    const { clinicId } = scope;
    const name = normalizeLocalized(input.name);
    if (!hasLocalized(name)) throw unprocessable('A name in at least one language is required');
    if (!isValidDuration(input.durationMinutes)) {
      throw unprocessable('Duration must be 5 to 480 minutes, in steps of 5', {
        field: 'durationMinutes',
      });
    }
    if (input.color && !(APPOINTMENT_TYPE_COLORS as readonly string[]).includes(input.color)) {
      throw unprocessable('Unknown colour', { field: 'color' });
    }
    await this.loadAll(clinicId); // makes sure the system types exist
    const existing = await this.prisma.appointmentTypeDef.findMany({ where: { clinicId } });
    if (existing.length >= MAX_APPOINTMENT_TYPES) {
      throw unprocessable(`A clinic can have at most ${MAX_APPOINTMENT_TYPES} appointment types`);
    }
    const taken = new Set(existing.map((t) => t.code));
    let code = input.code ? normalizeCode(input.code) : slugCode(name);
    if (!code) {
      let n = existing.length + 1;
      while (taken.has(`TYPE_${n}`)) n++;
      code = `TYPE_${n}`;
    }
    if (!isValidCode(code)) throw unprocessable('Invalid code', { field: 'code' });
    if (taken.has(code)) {
      throw conflict(`Appointment type ${code} already exists`, { field: 'code' });
    }

    const sortOrder = input.sortOrder ?? Math.max(0, ...existing.map((t) => t.sortOrder)) + 10;
    let row: AppointmentTypeDef;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.appointmentTypeDef.create({
          data: {
            clinicId,
            code,
            name: name as Prisma.InputJsonValue,
            durationMinutes: input.durationMinutes,
            color: input.color ?? 'primary',
            isEmergency: input.isEmergency ?? false,
            isActive: input.isActive ?? true,
            isSystem: false,
            sortOrder,
          },
        });
        await this.syncDurations(tx, clinicId);
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'create',
          entity: 'appointment_type',
          entityId: created.id,
          after: toDto(created, 0),
          clinicId,
          organizationId: scope.organizationId,
        });
        return created;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw conflict(`Appointment type ${code} already exists`, { field: 'code' });
      }
      throw error;
    }
    await this.afterWrite(scope, 'created', code);
    return this.get(clinicId, row.code, locale);
  }

  async update(
    scope: TypeScope,
    id: string,
    patch: Partial<AppointmentTypeInput>,
    locale?: string,
  ): Promise<AppointmentTypeDto> {
    const { clinicId } = scope;
    const row = await this.prisma.appointmentTypeDef.findFirst({ where: { id, clinicId } });
    if (!row) throw notFound();
    const all = await this.prisma.appointmentTypeDef.findMany({ where: { clinicId } });
    const data: Prisma.AppointmentTypeDefUpdateInput = {};

    if (patch.name !== undefined) {
      const name = normalizeLocalized(patch.name);
      if (!hasLocalized(name)) throw unprocessable('A name in at least one language is required');
      data.name = name as Prisma.InputJsonValue;
    }
    if (patch.durationMinutes !== undefined) {
      if (!isValidDuration(patch.durationMinutes)) {
        throw unprocessable('Duration must be 5 to 480 minutes, in steps of 5', {
          field: 'durationMinutes',
        });
      }
      data.durationMinutes = patch.durationMinutes;
    }
    if (patch.color !== undefined) {
      if (!(APPOINTMENT_TYPE_COLORS as readonly string[]).includes(patch.color)) {
        throw unprocessable('Unknown colour', { field: 'color' });
      }
      data.color = patch.color;
    }
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;

    if (patch.code !== undefined) {
      const code = normalizeCode(patch.code);
      if (code !== row.code) {
        if (row.isSystem) {
          throw unprocessable('The code of a system type cannot change', { field: 'code' });
        }
        if (!isValidCode(code)) throw unprocessable('Invalid code', { field: 'code' });
        const used = await this.prisma.appointment.count({ where: { clinicId, type: row.code } });
        if (used > 0) {
          throw conflict('The code of a type in use cannot change', { usageCount: used });
        }
        if (all.some((t) => t.code === code)) {
          throw conflict(`Appointment type ${code} already exists`, { field: 'code' });
        }
        data.code = code;
      }
    }

    const isEmergency = patch.isEmergency ?? row.isEmergency;
    if (row.code === 'EMERGENCY' && row.isSystem && isEmergency !== row.isEmergency) {
      throw unprocessable('The emergency flag of the EMERGENCY type cannot change', {
        field: 'isEmergency',
      });
    }
    data.isEmergency = isEmergency;
    const isActive = patch.isActive ?? row.isActive;
    data.isActive = isActive;
    this.assertBookableRemains(
      all.filter((t) => t.id !== row.id),
      { isActive, isEmergency },
    );

    let updated: AppointmentTypeDef;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.appointmentTypeDef.update({ where: { id: row.id }, data });
        await this.syncDurations(tx, clinicId);
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'update',
          entity: 'appointment_type',
          entityId: row.id,
          before: toDto(row, 0),
          after: toDto(next, 0),
          clinicId,
          organizationId: scope.organizationId,
        });
        return next;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw conflict('Appointment type code already exists', { field: 'code' });
      }
      throw error;
    }
    await this.afterWrite(scope, 'updated', updated.code);
    return this.get(clinicId, updated.code, locale);
  }

  async remove(scope: TypeScope, id: string): Promise<{ success: true }> {
    const { clinicId } = scope;
    const row = await this.prisma.appointmentTypeDef.findFirst({ where: { id, clinicId } });
    if (!row) throw notFound();
    if (row.isSystem) {
      throw conflict('System appointment types cannot be deleted; deactivate it instead');
    }
    const used = await this.prisma.appointment.count({ where: { clinicId, type: row.code } });
    if (used > 0) {
      throw conflict(
        'This appointment type is used by existing appointments; deactivate it instead',
        { usageCount: used },
      );
    }
    const others = await this.prisma.appointmentTypeDef.findMany({
      where: { clinicId, id: { not: row.id } },
    });
    this.assertBookableRemains(others);
    await this.prisma.$transaction(async (tx) => {
      await tx.appointmentTypeDef.delete({ where: { id: row.id } });
      await this.syncDurations(tx, clinicId);
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'delete',
        entity: 'appointment_type',
        entityId: row.id,
        before: toDto(row, 0),
        clinicId,
        organizationId: scope.organizationId,
      });
    });
    await this.afterWrite(scope, 'deleted', row.code);
    return { success: true };
  }

  /**
   * Set the duration of types by code from the legacy settings `durations` map. Unknown codes
   * are ignored. Runs inside the caller's transaction; the caller invalidates caches.
   */
  async applyDurations(
    tx: Prisma.TransactionClient,
    clinicId: string,
    durations: Record<string, number | undefined>,
  ): Promise<void> {
    for (const [code, minutes] of Object.entries(durations)) {
      if (minutes === undefined) continue;
      if (!isValidDuration(minutes)) {
        throw unprocessable(`Duration for ${code} must be a multiple of 5 minutes`, {
          field: `durations.${code}`,
        });
      }
      await tx.appointmentTypeDef.updateMany({
        where: { clinicId, code },
        data: { durationMinutes: minutes },
      });
    }
  }

  async invalidate(clinicId: string): Promise<void> {
    await this.cache.del(AppointmentTypesService.cacheKey(clinicId));
  }
}
