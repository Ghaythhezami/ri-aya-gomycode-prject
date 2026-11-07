import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  PortalAppointment,
  PortalClinic,
  PortalDoctor,
  PortalMe,
  PortalSlot,
  PortalSummary,
} from '@riaya/shared';
import { normalizeLocalized, pickLocalized } from '@riaya/shared';
import { AppointmentTypesService } from '../appointment-types/appointment-types.service';
import { AppointmentsService } from '../appointments/appointments.service';
import type {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../appointments/dto/appointment.dto';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { buildSearchText, resolveNameInput } from '../common/locale/localized-input';
import { RequestLocale } from '../common/locale/request-locale';
import { doctorName, initials, localizedNames, personName } from '../common/mappers';
import { PrismaService } from '../database/prisma.service';
import { DoctorsService } from '../doctors/doctors.service';
import { TenantContext } from '../tenancy/tenant-context';
import { PatientContext, type PortalPrincipal } from './auth/patient-context';
import { PortalAuthService } from './auth/portal-auth.service';
import type {
  PortalAppointmentsQueryDto,
  PortalBookDto,
  PortalCancelDto,
  PortalProfileDto,
  PortalRescheduleDto,
  PortalSlotsQueryDto,
} from './dto/portal.dto';
import { MAX_FUTURE_APPOINTMENTS, MAX_FUTURE_APPOINTMENTS_UNVERIFIED } from './portal.constants';

const ACTIVE_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] as const;
const CHANGEABLE_STATUSES = ['SCHEDULED', 'CONFIRMED'];
const HOUR_MS = 3600_000;

const APPOINTMENT_INCLUDE = { doctor: true } satisfies Prisma.AppointmentInclude;
type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

function notFound(message = 'Appointment not found') {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}

function toDoctor(d: AppointmentRow['doctor']): PortalDoctor {
  const n = localizedNames(d);
  return {
    id: d.id,
    name: doctorName(d),
    specialty: d.specialty,
    initials: initials(n.firstName, n.lastName),
  };
}

/** Patient-facing self-service on top of the staff services (ADR 0005 section 1). */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patient: PatientContext,
    private readonly tenant: TenantContext,
    private readonly auth: PortalAuthService,
    private readonly appointments: AppointmentsService,
    private readonly doctors: DoctorsService,
    private readonly types: AppointmentTypesService,
    private readonly audit: AuditService,
    private readonly redis: RedisCacheService,
  ) {}

  // ------------------------------------------------------------------ public

  async clinics(): Promise<PortalClinic[]> {
    const rows = await this.prisma.clinicSettings.findMany({
      where: { patientPortalEnabled: true },
      select: {
        patientSelfRegistration: true,
        clinic: { select: { id: true, name: true, nameI18n: true, address: true, timezone: true } },
      },
    });
    return rows
      .map((r) => ({
        id: r.clinic.id,
        name: pickLocalized(
          normalizeLocalized(r.clinic.nameI18n),
          RequestLocale.get(),
          r.clinic.name,
        ),
        address: r.clinic.address,
        timezone: r.clinic.timezone,
        selfRegistration: r.patientSelfRegistration,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ------------------------------------------------------------------ scope helpers

  /**
   * Binds the staff `TenantContext` to the patient's clinic so the staff booking and slot services
   * can be reused unchanged. The synthetic user id (`portal:<accountId>`) never matches a staff user;
   * the receptionist role makes the late-cancellation policy apply.
   */
  private async scope(): Promise<PortalPrincipal> {
    const p = this.patient.get();
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: p.clinicId },
      select: { organizationId: true },
    });
    const settings = await this.prisma.clinicSettings.findUnique({
      where: { clinicId: p.clinicId },
      select: { patientPortalEnabled: true },
    });
    if (!clinic || (settings && !settings.patientPortalEnabled)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'The patient portal is not available for this clinic',
      });
    }
    this.tenant.set({
      userId: `portal:${p.accountId}`,
      organizationId: clinic.organizationId,
      clinicId: p.clinicId,
      role: 'RECEPTIONIST',
      membershipId: 'portal',
    });
    return p;
  }

  private async noticeHours(clinicId: string): Promise<number> {
    const s = await this.prisma.clinicSettings.findUnique({
      where: { clinicId },
      select: { cancellationNoticeHours: true },
    });
    return s?.cancellationNoticeHours ?? 2;
  }

  // ------------------------------------------------------------------ profile

  me(): Promise<PortalMe> {
    return this.auth.meFor(this.patient.get().accountId);
  }

  async updateMe(dto: PortalProfileDto): Promise<PortalMe> {
    const p = this.patient.get();
    const account = await this.prisma.patientAccount.findFirst({
      where: { id: p.accountId, clinicId: p.clinicId, patientId: p.patientId },
      include: { patient: true },
    });
    if (!account) throw notFound('Account not found');
    const patient = account.patient;
    const settings = await this.prisma.clinicSettings.findUnique({
      where: { clinicId: p.clinicId },
      select: { defaultLanguage: true },
    });
    const lang = settings?.defaultLanguage ?? null;

    const first = dto.firstNameI18n
      ? resolveNameInput('firstName', undefined, dto.firstNameI18n, lang)
      : null;
    const last = dto.lastNameI18n
      ? resolveNameInput('lastName', undefined, dto.lastNameI18n, lang)
      : null;
    const phone = dto.phone?.trim() ?? patient.phone;
    const firstCanonical = first?.canonical ?? patient.firstName;
    const lastCanonical = last?.canonical ?? patient.lastName;
    const firstI18n = first?.i18n ?? normalizeLocalized(patient.firstNameI18n);
    const lastI18n = last?.i18n ?? normalizeLocalized(patient.lastNameI18n);
    const now = new Date();

    await this.prisma.$transactionWith(async (tx) => {
      await tx.patient.update({
        where: { id: patient.id },
        data: {
          firstName: firstCanonical,
          lastName: lastCanonical,
          firstNameI18n: firstI18n,
          lastNameI18n: lastI18n,
          phone,
          ...(dto.contactPreference ? { contactPreference: dto.contactPreference } : {}),
          searchText: buildSearchText([
            firstCanonical,
            firstI18n,
            lastCanonical,
            lastI18n,
            patient.code,
            phone,
            patient.email,
          ]),
        },
      });
      await tx.patientAccount.update({
        where: { id: account.id },
        data: {
          ...(dto.preferredLocale ? { preferredLocale: dto.preferredLocale } : {}),
          ...(dto.aiConsent === true && !account.aiConsentAt ? { aiConsentAt: now } : {}),
          ...(dto.aiConsent === false ? { aiConsentAt: null } : {}),
          ...(dto.onboardingCompleted === true && !account.onboardingCompletedAt
            ? { onboardingCompletedAt: now }
            : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'update',
        entity: 'patient_account',
        entityId: account.id,
        clinicId: p.clinicId,
        after: {
          fields: Object.keys(dto),
          ...(dto.aiConsent !== undefined ? { aiConsent: dto.aiConsent } : {}),
        },
      });
    });
    return this.me();
  }

  // ------------------------------------------------------------------ catalogue

  async listDoctors(): Promise<PortalDoctor[]> {
    const p = this.patient.get();
    const rows = await this.prisma.doctor.findMany({
      where: { clinicId: p.clinicId, isActive: true },
    });
    return rows
      .map((d) => toDoctor(d as AppointmentRow['doctor']))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async appointmentTypes() {
    const p = this.patient.get();
    const list = await this.types.list(p.clinicId, { locale: RequestLocale.get() ?? p.locale });
    return list
      .filter((t) => t.isActive && !t.isEmergency)
      .map((t) => ({ type: t.code, name: t.displayName, durationMinutes: t.durationMinutes }));
  }

  async slots(query: PortalSlotsQueryDto): Promise<PortalSlot[]> {
    await this.scope();
    // Slot length follows the chosen visit type when the patient picked one.
    const all = await this.doctors.slots(query.doctorId, {
      date: query.date,
      ...(query.durationMinutes ? { durationMinutes: query.durationMinutes } : {}),
    });
    const now = Date.now();
    return all
      .filter((s) => s.available && new Date(s.startsAt).getTime() > now)
      .map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));
  }

  // ------------------------------------------------------------------ appointments

  private async toPortal(rows: AppointmentRow[], clinicId: string): Promise<PortalAppointment[]> {
    const [typeMap, notice] = await Promise.all([
      this.types.byCode(clinicId, RequestLocale.get() ?? undefined),
      this.noticeHours(clinicId),
    ]);
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      doctor: toDoctor(r.doctor),
      type: r.type,
      typeName: typeMap.get(r.type)?.displayName ?? r.type,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      canChange:
        CHANGEABLE_STATUSES.includes(r.status) && r.startsAt.getTime() - now >= notice * HOUR_MS,
      reason: r.reason,
    }));
  }

  async listAppointments(query: PortalAppointmentsQueryDto): Promise<PortalAppointment[]> {
    const p = this.patient.get();
    const upcoming = (query.scope ?? 'upcoming') === 'upcoming';
    const now = new Date();
    const rows = await this.prisma.appointment.findMany({
      where: {
        clinicId: p.clinicId,
        patientId: p.patientId,
        ...(upcoming ? { startsAt: { gte: now } } : { startsAt: { lt: now } }),
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: upcoming ? 'asc' : 'desc' },
      take: 200,
    });
    return this.toPortal(rows, p.clinicId);
  }

  /** The patient's own appointment, or 404 (another patient's or clinic's id never resolves). */
  private async own(p: PortalPrincipal, id: string): Promise<AppointmentRow> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, clinicId: p.clinicId, patientId: p.patientId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!row) throw notFound();
    return row;
  }

  private async assertChangeable(p: PortalPrincipal, row: AppointmentRow): Promise<void> {
    if (!CHANGEABLE_STATUSES.includes(row.status)) {
      throw new ConflictException({
        code: 'ILLEGAL_TRANSITION',
        message: `An appointment that is ${row.status} cannot be changed`,
      });
    }
    const notice = await this.noticeHours(p.clinicId);
    if (row.startsAt.getTime() - Date.now() < notice * HOUR_MS) {
      throw new ConflictException({
        code: 'CANCELLATION_POLICY',
        message: 'This appointment is too close to change online. Please call the clinic.',
        details: { noticeHours: notice },
      });
    }
  }

  private async auditChange(
    p: PortalPrincipal,
    id: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.prisma.$transactionWith((tx) =>
      this.audit.record(tx, {
        action: 'update',
        entity: 'appointment',
        entityId: id,
        clinicId: p.clinicId,
        before,
        after: { ...(after as object), via: 'portal', patientAccountId: p.accountId },
      }),
    );
  }

  async book(dto: PortalBookDto): Promise<PortalAppointment> {
    const p = await this.scope();
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose a time in the future',
        details: { field: 'startsAt' },
      });
    }
    const typeDef = await this.types.requireActive(p.clinicId, dto.type);
    if (typeDef.isEmergency) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message:
          'Emergencies cannot be booked online. Please call the clinic or emergency services.',
        details: { field: 'type' },
      });
    }
    // Per-patient lock around "count open appointments -> book": two parallel requests cannot
    // both pass the cap. Strict store (Redis or Postgres); fails closed when it is down.
    const lockKey = `portal:booking:${p.patientId}`;
    const holder = await this.redis.incrementStrict(lockKey, 10);
    if (holder > 1) {
      throw new ConflictException({
        code: 'VALIDATION_FAILED',
        message: 'Another booking is in progress, please retry in a moment',
      });
    }
    let created: { id: string };
    try {
      // Self-registered accounts the clinic has not verified yet may hold one upcoming visit.
      const account = await this.prisma.patientAccount.findFirst({
        where: { id: p.accountId, clinicId: p.clinicId },
        select: { emailVerifiedAt: true },
      });
      const cap = account?.emailVerifiedAt
        ? MAX_FUTURE_APPOINTMENTS
        : MAX_FUTURE_APPOINTMENTS_UNVERIFIED;
      const open = await this.prisma.appointment.count({
        where: {
          clinicId: p.clinicId,
          patientId: p.patientId,
          startsAt: { gt: new Date() },
          status: { in: [...ACTIVE_STATUSES] },
        },
      });
      if (open >= cap) {
        throw new ConflictException({
          code: 'VALIDATION_FAILED',
          message: `You can have at most ${cap} upcoming appointment${cap === 1 ? '' : 's'}. Cancel one to book another.`,
          details: { limit: cap },
        });
      }
      // patientId comes from the token only; the staff path keeps the slot lock, SERIALIZABLE
      // transaction and exclusion constraint, and answers SLOT_CONFLICT with alternatives.
      created = await this.appointments.create(
        {
          patientId: p.patientId,
          doctorId: dto.doctorId,
          type: dto.type,
          startsAt: dto.startsAt,
          ...(dto.reason ? { reason: dto.reason } : {}),
        } as CreateAppointmentDto,
        { source: 'PORTAL' },
      );
    } finally {
      await this.redis.delStrict(lockKey).catch(() => undefined);
    }
    return (await this.toPortal([await this.own(p, created.id)], p.clinicId))[0]!;
  }

  async cancel(id: string, dto: PortalCancelDto): Promise<PortalAppointment> {
    const p = await this.scope();
    const row = await this.own(p, id);
    await this.assertChangeable(p, row);
    await this.appointments.cancel(id, dto.reason);
    await this.auditChange(p, id, { status: row.status }, { status: 'CANCELLED' });
    return (await this.toPortal([await this.own(p, id)], p.clinicId))[0]!;
  }

  async reschedule(id: string, dto: PortalRescheduleDto): Promise<PortalAppointment> {
    const p = await this.scope();
    const row = await this.own(p, id);
    await this.assertChangeable(p, row);
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose a time in the future',
        details: { field: 'startsAt' },
      });
    }
    await this.appointments.update(id, {
      startsAt: dto.startsAt,
      ...(dto.doctorId ? { doctorId: dto.doctorId } : {}),
    } as UpdateAppointmentDto);
    await this.auditChange(
      p,
      id,
      { startsAt: row.startsAt.toISOString(), doctorId: row.doctorId },
      { startsAt: dto.startsAt, doctorId: dto.doctorId ?? row.doctorId },
    );
    return (await this.toPortal([await this.own(p, id)], p.clinicId))[0]!;
  }

  // ------------------------------------------------------------------ summary

  async summary(): Promise<PortalSummary | null> {
    const p = this.patient.get();
    const row = await this.prisma.patientSummary.findFirst({
      where: {
        clinicId: p.clinicId,
        patientId: p.patientId,
        visibleToPatient: true,
        // Patients only ever see the plain-language text, never the clinician `content`.
        patientContent: { not: null },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row?.patientContent?.trim()) return null;
    const author = await this.prisma.user.findUnique({ where: { id: row.authorId } });
    return {
      id: row.id,
      content: row.patientContent,
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      authorName: author ? personName(author) : '',
    };
  }
}
