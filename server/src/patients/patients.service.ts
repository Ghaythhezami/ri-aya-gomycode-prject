import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  normalizeLocalized,
  type LocalizedText,
  type AppointmentListItem,
  type DuplicateCheckResult,
  type Paginated,
  type PatientDetail,
  type PatientListItem,
} from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { DomainEventsService } from '../events/domain-events.service';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { RequestLocale } from '../common/locale/request-locale';
import { buildSearchText, resolveNameInput } from '../common/locale/localized-input';
import { paginated, parseSort, resolvePagination } from '../common/pagination';
import { APPOINTMENT_LIST_INCLUDE, toAppointmentListItem } from '../common/mappers';
import {
  CreatePatientDto,
  DuplicatesQueryDto,
  ListPatientsQueryDto,
  PATIENT_SORTS,
  UpdatePatientDto,
} from './dto/patient.dto';
import {
  patientAuditSnapshot,
  toPatientDetail,
  toPatientListItem,
  type PatientRow,
  type PatientVisits,
} from './patient-mappers';

const LIST_TTL_SECONDS = 30;
const FREED = ['CANCELLED', 'NO_SHOW'] as ('CANCELLED' | 'NO_SHOW')[];

/** Digits only, for phone comparison. */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function parseDob(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date > new Date()
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid date of birth',
      details: { field: 'dateOfBirth' },
    });
  }
  return date;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly cache: RedisCacheService,
    private readonly events: DomainEventsService,
    private readonly settings: ClinicSettingsReader,
    private readonly rbac: RbacService,
  ) {}

  private canReadNotes(scope: TenantScope): Promise<boolean> {
    return this.rbac.has(scope, 'readClinicalNotes');
  }

  /** Clinic default language for deriving canonical names; null when settings are unavailable. */
  private async defaultLanguage(clinicId: string): Promise<string | null> {
    try {
      return (await this.settings.get(clinicId)).defaultLanguage;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ cache

  private versionKey(clinicId: string) {
    return `patients:v:${clinicId}`;
  }

  private async version(clinicId: string): Promise<number> {
    return (await this.cache.get<number>(this.versionKey(clinicId))) ?? 0;
  }

  private async invalidate(clinicId: string): Promise<void> {
    await this.cache.set(this.versionKey(clinicId), Date.now(), 24 * 3600);
  }

  // ------------------------------------------------------------------ list

  private async phoneMatchIds(clinicId: string, digits: string, exact: boolean): Promise<string[]> {
    if (digits.length < 3) return [];
    const rows = exact
      ? await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM patients
          WHERE "clinicId" = ${clinicId} AND status = 'ACTIVE'
            AND regexp_replace(phone, '\\D', '', 'g') = ${digits}`
      : await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM patients
          WHERE "clinicId" = ${clinicId}
            AND regexp_replace(phone, '\\D', '', 'g') LIKE ${'%' + digits + '%'}`;
    return rows.map((r) => r.id);
  }

  private async visits(clinicId: string, ids: string[]): Promise<Map<string, PatientVisits>> {
    const result = new Map<string, PatientVisits>();
    if (ids.length === 0) return result;
    const now = new Date();
    const [last, next] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['patientId'],
        where: { clinicId, patientId: { in: ids }, status: 'COMPLETED', startsAt: { lt: now } },
        _max: { startsAt: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          clinicId,
          patientId: { in: ids },
          status: { notIn: FREED },
          startsAt: { gte: now },
        },
        _min: { startsAt: true },
      }),
    ]);
    for (const id of ids) result.set(id, { lastVisit: null, nextAppointment: null });
    for (const row of last) result.get(row.patientId)!.lastVisit = row._max.startsAt;
    for (const row of next) result.get(row.patientId)!.nextAppointment = row._min.startsAt;
    return result;
  }

  async list(query: ListPatientsQueryDto): Promise<Paginated<PatientListItem>> {
    const { clinicId } = this.tenant.get();
    const version = await this.version(clinicId);
    const cacheKey = `patients:list:${clinicId}:${version}:${RequestLocale.get() ?? '-'}:${JSON.stringify(query)}`;
    const cached = await this.cache.get<Paginated<PatientListItem>>(cacheKey);
    if (cached) return cached;

    const { page, limit, skip, take } = resolvePagination(query);
    const sort = parseSort(query.sort, PATIENT_SORTS, 'name');
    const where: Prisma.PatientWhereInput = {
      clinicId,
      status: query.status ?? 'ACTIVE',
      ...(query.gender ? { gender: query.gender } : {}),
    };
    const search = query.search?.trim();
    if (search) {
      const terms = search.split(/\s+/).filter(Boolean);
      const phoneIds = await this.phoneMatchIds(clinicId, normalisePhone(search), false);
      where.OR = [
        // searchText holds every language's spelling, lower-cased; Prisma parameterises the
        // pattern and escapes % and _ in `contains`, so the trigram index serves it.
        {
          AND: terms.map((term) => ({
            searchText: { contains: term.toLowerCase(), mode: 'insensitive' as const },
          })),
        },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
      ];
    }

    let rows: PatientRow[];
    let total: number;
    let visits: Map<string, PatientVisits>;
    if (sort.field === 'lastVisit') {
      const all = await this.prisma.patient.findMany({ where });
      total = all.length;
      visits = await this.visits(
        clinicId,
        all.map((p) => p.id),
      );
      const stamp = (id: string) => visits.get(id)?.lastVisit?.getTime() ?? 0;
      const dir = sort.direction === 'asc' ? 1 : -1;
      all.sort((a, b) => {
        const diff = stamp(a.id) - stamp(b.id);
        return diff === 0 ? a.lastName.localeCompare(b.lastName) : diff * dir;
      });
      rows = all.slice(skip, skip + take);
    } else {
      const direction = sort.direction;
      const orderBy: Prisma.PatientOrderByWithRelationInput[] =
        sort.field === 'name'
          ? [{ lastName: direction }, { firstName: direction }]
          : [{ [sort.field]: direction }];
      [rows, total] = await Promise.all([
        this.prisma.patient.findMany({ where, orderBy, skip, take }),
        this.prisma.patient.count({ where }),
      ]);
      visits = await this.visits(
        clinicId,
        rows.map((p) => p.id),
      );
    }

    const result = paginated(
      rows.map((row) => toPatientListItem(row, visits.get(row.id))),
      page,
      limit,
      total,
    );
    await this.cache.set(cacheKey, result, LIST_TTL_SECONDS);
    return result;
  }

  // ------------------------------------------------------------------ duplicates

  async findDuplicates(query: DuplicatesQueryDto): Promise<DuplicateCheckResult> {
    const { clinicId } = this.tenant.get();
    const or: Prisma.PatientWhereInput[] = [];
    if (query.firstName && query.lastName && query.dateOfBirth) {
      or.push({
        firstName: { equals: query.firstName.trim(), mode: 'insensitive' },
        lastName: { equals: query.lastName.trim(), mode: 'insensitive' },
        dateOfBirth: new Date(`${query.dateOfBirth}T00:00:00.000Z`),
      });
    }
    const digits = query.phone ? normalisePhone(query.phone) : '';
    const phoneIds = digits ? await this.phoneMatchIds(clinicId, digits, true) : [];
    if (phoneIds.length) or.push({ id: { in: phoneIds } });
    if (or.length === 0) return { matches: [] };
    const rows = await this.prisma.patient.findMany({
      where: { clinicId, status: 'ACTIVE', OR: or },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    const visits = await this.visits(
      clinicId,
      rows.map((r) => r.id),
    );
    return { matches: rows.map((r) => toPatientListItem(r, visits.get(r.id))) };
  }

  // ------------------------------------------------------------------ read

  private async load(clinicId: string, id: string) {
    const row = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Patient not found' });
    return row;
  }

  async get(id: string): Promise<PatientDetail> {
    const scope = this.tenant.get();
    const row = await this.load(scope.clinicId, id);
    const visits = await this.visits(scope.clinicId, [id]);
    return toPatientDetail(row, await this.canReadNotes(scope), visits.get(id));
  }

  async appointments(
    id: string,
  ): Promise<{ upcoming: AppointmentListItem[]; past: AppointmentListItem[] }> {
    const { clinicId } = this.tenant.get();
    await this.load(clinicId, id);
    const now = new Date();
    const [upcoming, past] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { clinicId, patientId: id, startsAt: { gte: now }, status: { notIn: FREED } },
        include: APPOINTMENT_LIST_INCLUDE,
        orderBy: { startsAt: 'asc' },
        take: 50,
      }),
      this.prisma.appointment.findMany({
        where: { clinicId, patientId: id, startsAt: { lt: now } },
        include: APPOINTMENT_LIST_INCLUDE,
        orderBy: { startsAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      upcoming: upcoming.map(toAppointmentListItem),
      past: past.map(toAppointmentListItem),
    };
  }

  // ------------------------------------------------------------------ write

  private async nextCode(tx: Prisma.TransactionClient, clinicId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)::int AS max
      FROM patients WHERE "clinicId" = ${clinicId} AND code ~ '^P-[0-9]+$'`;
    return `P-${String((rows[0]?.max ?? 0) + 1).padStart(3, '0')}`;
  }

  async create(dto: CreatePatientDto): Promise<PatientDetail> {
    const scope = this.tenant.get();
    const dateOfBirth = parseDob(dto.dateOfBirth);
    const lang = await this.defaultLanguage(scope.clinicId);
    const first = resolveNameInput('firstName', dto.firstName, dto.firstNameI18n, lang);
    const last = resolveNameInput('lastName', dto.lastName, dto.lastNameI18n, lang);
    if (!dto.force) {
      const { matches } = await this.findDuplicates({
        firstName: first.canonical,
        lastName: last.canonical,
        dateOfBirth: dto.dateOfBirth,
        phone: dto.phone,
      });
      if (matches.length) {
        throw new ConflictException({
          code: 'DUPLICATE_PATIENT',
          message: 'A matching patient already exists',
          details: { matches },
        });
      }
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const created = await this.prisma.$transactionWith(async (tx) => {
          const code = await this.nextCode(tx, scope.clinicId);
          const row = await tx.patient.create({
            data: {
              clinicId: scope.clinicId,
              code,
              firstName: first.canonical,
              lastName: last.canonical,
              firstNameI18n: first.i18n,
              lastNameI18n: last.i18n,
              searchText: buildSearchText([
                first.canonical,
                first.i18n,
                last.canonical,
                last.i18n,
                code,
                dto.phone.trim(),
                dto.email,
              ]),
              dateOfBirth,
              phone: dto.phone.trim(),
              email: dto.email ?? null,
              gender: dto.gender ?? null,
              address: dto.address ?? null,
              adminNotes: dto.adminNotes ?? null,
              contactPreference: dto.contactPreference ?? 'SMS',
            },
          });
          await this.audit.record(tx, {
            actorUserId: scope.userId,
            action: 'create',
            entity: 'patient',
            entityId: row.id,
            after: patientAuditSnapshot(row),
          });
          return row;
        });
        await this.invalidate(scope.clinicId);
        await this.events.emit({
          type: 'patient.created',
          clinicId: scope.clinicId,
          organizationId: scope.organizationId,
          actorUserId: scope.userId,
          payload: { patientId: created.id },
        });
        return toPatientDetail(created, await this.canReadNotes(scope));
      } catch (error) {
        const unique =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!unique || attempt >= 2) throw error;
      }
    }
  }

  async update(id: string, dto: UpdatePatientDto): Promise<PatientDetail> {
    const scope = this.tenant.get();
    if (dto.clinicalNotes !== undefined && !(await this.canReadNotes(scope))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You cannot edit clinical notes',
      });
    }
    const before = await this.load(scope.clinicId, id);
    const data: Prisma.PatientUpdateInput = {};
    const lang = await this.defaultLanguage(scope.clinicId);
    const names = {
      firstName: before.firstName,
      lastName: before.lastName,
      firstNameI18n: normalizeLocalized(before.firstNameI18n) as LocalizedText,
      lastNameI18n: normalizeLocalized(before.lastNameI18n) as LocalizedText,
    };
    if (dto.firstName !== undefined || dto.firstNameI18n !== undefined) {
      const given = dto.firstNameI18n !== undefined ? normalizeLocalized(dto.firstNameI18n) : null;
      const r = resolveNameInput(
        'firstName',
        dto.firstName ?? (given && Object.keys(given).length === 0 ? names.firstName : undefined),
        given ?? names.firstNameI18n,
        lang,
      );
      names.firstName = r.canonical;
      names.firstNameI18n = r.i18n;
      data.firstName = r.canonical;
      data.firstNameI18n = r.i18n;
    }
    if (dto.lastName !== undefined || dto.lastNameI18n !== undefined) {
      const given = dto.lastNameI18n !== undefined ? normalizeLocalized(dto.lastNameI18n) : null;
      const r = resolveNameInput(
        'lastName',
        dto.lastName ?? (given && Object.keys(given).length === 0 ? names.lastName : undefined),
        given ?? names.lastNameI18n,
        lang,
      );
      names.lastName = r.canonical;
      names.lastNameI18n = r.i18n;
      data.lastName = r.canonical;
      data.lastNameI18n = r.i18n;
    }
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = parseDob(dto.dateOfBirth);
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.contactPreference !== undefined) data.contactPreference = dto.contactPreference;
    if (dto.adminNotes !== undefined) data.adminNotes = dto.adminNotes;
    if (dto.clinicalNotes !== undefined) data.clinicalNotes = dto.clinicalNotes;
    data.searchText = buildSearchText([
      names.firstName,
      names.firstNameI18n,
      names.lastName,
      names.lastNameI18n,
      before.code,
      data.phone !== undefined ? (data.phone as string) : before.phone,
      data.email !== undefined ? (data.email as string | null) : before.email,
    ]);

    const updated = await this.prisma.$transactionWith(async (tx) => {
      const row = await tx.patient.update({ where: { id: before.id }, data });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'patient',
        entityId: row.id,
        before: patientAuditSnapshot(before),
        after: patientAuditSnapshot(row),
      });
      return row;
    });
    await this.invalidate(scope.clinicId);
    const visits = await this.visits(scope.clinicId, [id]);
    return toPatientDetail(updated, await this.canReadNotes(scope), visits.get(id));
  }

  async archive(id: string): Promise<PatientDetail> {
    const scope = this.tenant.get();
    const before = await this.load(scope.clinicId, id);
    const updated = await this.prisma.$transactionWith(async (tx) => {
      const row = await tx.patient.update({
        where: { id: before.id },
        data: { status: 'ARCHIVED', archivedAt: before.archivedAt ?? new Date() },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'patient',
        entityId: row.id,
        before: patientAuditSnapshot(before),
        after: patientAuditSnapshot(row),
      });
      return row;
    });
    await this.invalidate(scope.clinicId);
    const visits = await this.visits(scope.clinicId, [id]);
    return toPatientDetail(updated, await this.canReadNotes(scope), visits.get(id));
  }
}
