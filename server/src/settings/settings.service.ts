import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuditDto, ClinicSettingsDto, CursorPage, RoleSummary } from '@riaya/shared';
import { AppointmentTypesService } from '../appointment-types/appointment-types.service';
import { AuditService } from '../audit/audit.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { addDays, localToUtc } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { decodeCursor, encodeCursor } from '../notifications/notifications.service';
import { offsetsProblems, openingHoursProblems } from './settings-rules';
import type { AuditQueryDto, UpdateSettingsDto } from './settings.dto';

const ACCESS: RoleSummary['accessLevel'][] = ['FULL', 'OPERATIONS', 'CLINICAL', 'FRONT_DESK'];
const ROLES: RoleSummary['role'][] = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: ClinicSettingsReader,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly types: AppointmentTypesService,
  ) {}

  get(clinicId: string): Promise<ClinicSettingsDto> {
    return this.reader.get(clinicId);
  }

  async update(
    scope: { clinicId: string; organizationId: string; userId: string },
    dto: UpdateSettingsDto,
  ): Promise<ClinicSettingsDto> {
    const problems = [
      ...(dto.openingHours ? openingHoursProblems(dto.openingHours) : []),
      ...(dto.reminderOffsets ? offsetsProblems(dto.reminderOffsets) : []),
    ];
    if (problems.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: problems.join('; '),
        details: problems,
      });
    }
    const { clinicId } = scope;
    const before = await this.reader.get(clinicId);

    const data: Prisma.ClinicSettingsUpdateInput = {};
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.defaultLanguage !== undefined) data.defaultLanguage = dto.defaultLanguage;
    if (dto.cancellationNoticeHours !== undefined)
      data.cancellationNoticeHours = dto.cancellationNoticeHours;
    if (dto.requireCancelReason !== undefined) data.requireCancelReason = dto.requireCancelReason;
    if (dto.targetWaitMinutes !== undefined) data.targetWaitMinutes = dto.targetWaitMinutes;
    if (dto.slotMinutes !== undefined) data.slotMinutes = dto.slotMinutes;
    const durationsPatch = dto.durations
      ? (stripUndefined(dto.durations) as Record<string, number>)
      : undefined;
    if (durationsPatch) data.durations = { ...before.durations, ...durationsPatch };
    if (dto.reminderOffsets) data.reminderOffsets = [...dto.reminderOffsets].sort((a, b) => b - a);
    if (dto.reminderChannels) data.reminderChannels = [...new Set(dto.reminderChannels)];
    if (dto.openingHours) {
      data.openingHours = [...dto.openingHours]
        .sort((a, b) => a.weekday - b.weekday)
        .map((d) => ({ weekday: d.weekday, open: d.open, close: d.close, closed: d.closed }));
    }
    if (dto.departments) {
      data.departments = dto.departments.map((d) => ({
        id: d.id ?? randomUUID(),
        name: d.name.trim(),
        specialties: d.specialties,
      }));
    }
    if (dto.appearance)
      data.appearance = { ...before.appearance, ...stripUndefined(dto.appearance) };

    const clinicData: Prisma.ClinicUpdateInput = {};
    if (dto.clinic?.name !== undefined) clinicData.name = dto.clinic.name.trim();
    if (dto.clinic?.address !== undefined) clinicData.address = dto.clinic.address;
    if (dto.clinic?.timezone !== undefined) clinicData.timezone = dto.clinic.timezone;
    if (dto.clinic?.currency !== undefined) clinicData.currency = dto.clinic.currency;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(clinicData).length)
        await tx.clinic.update({ where: { id: clinicId }, data: clinicData });
      await tx.clinicSettings.update({ where: { clinicId }, data });
      // Durations are owned by the appointment types; keep them in step.
      if (durationsPatch) await this.types.applyDurations(tx, clinicId, durationsPatch);
      const after = {
        ...stripUndefined(dto as unknown as Record<string, unknown>),
      };
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'clinic_settings',
        entityId: clinicId,
        before: pick(before as unknown as Record<string, unknown>, Object.keys(after)),
        after,
        clinicId,
        organizationId: scope.organizationId,
      });
    });

    await this.reader.invalidate(clinicId);
    if (durationsPatch) await this.types.invalidate(clinicId);
    await this.events.emit({
      type: 'settings.updated',
      clinicId,
      organizationId: scope.organizationId,
      actorUserId: scope.userId,
      payload: { keys: Object.keys(dto) },
    });
    return this.reader.get(clinicId);
  }

  async roles(clinicId: string): Promise<RoleSummary[]> {
    const grouped = await this.prisma.userMembership.groupBy({
      by: ['role'],
      where: { clinicId, status: 'ACTIVE' },
      _count: { _all: true },
    });
    return ROLES.map((role, i) => ({
      role,
      users: grouped.find((g) => g.role === role)?._count._all ?? 0,
      accessLevel: ACCESS[i]!,
    }));
  }

  async auditPage(clinicId: string, query: AuditQueryDto): Promise<CursorPage<AuditDto>> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const tz = (await this.reader.get(clinicId)).clinic.timezone;
    const and: Prisma.AuditLogWhereInput[] = [{ clinicId }];
    if (query.entity) and.push({ entity: query.entity });
    if (query.actorId) and.push({ actorUserId: query.actorId });
    const range: Prisma.DateTimeFilter = {};
    if (query.from) range.gte = localToUtc(query.from, 0, tz);
    if (query.to) range.lt = localToUtc(addDays(query.to, 1), 0, tz);
    if (range.gte || range.lt) and.push({ createdAt: range });
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.prisma.auditLog.findMany({
      where: { AND: and },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        action: r.action as AuditDto['action'],
        entity: r.entity,
        entityId: r.entityId,
        actor: r.actor
          ? { id: r.actor.id, name: `${r.actor.firstName} ${r.actor.lastName}`.trim() }
          : null,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}

function stripUndefined<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));
}
