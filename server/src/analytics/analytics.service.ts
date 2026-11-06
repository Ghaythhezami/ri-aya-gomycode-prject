import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnalyticsDto, AnalyticsScope, AppointmentStatus, DashboardDto } from '@riaya/shared';
import { RedisCacheService } from '../cache/redis-cache.service';
import { availableIntervals, totalMinutes } from '../core/availability';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { addDays, localToUtc, todayIn, weekdayOf } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import type { DomainEventType } from '../events/domain-events';
import { DomainEventsService } from '../events/domain-events.service';
import { APPOINTMENT_LIST_INCLUDE, doctorName, toAppointmentListItem } from '../common/mappers';
import { SchedulingService } from '../scheduling/scheduling.service';
import { dateRange, pctChange, previousRange, round1 } from './stats';

interface ClinicInfo {
  id: string;
  name: string;
  timeZone: string;
}

interface Aggregates {
  /** date -> status -> { count, minutes } */
  byDay: Map<string, Map<string, { count: number; minutes: number }>>;
  bySpecialty: Map<string, number>;
  peakHours: Map<number, number>;
  /** date -> { n, sum } of actual waits in minutes */
  waits: Map<string, { n: number; sum: number }>;
  doctorBooked: Map<string, number>;
}

const BOOKED = Prisma.sql`('CANCELLED', 'NO_SHOW')`;
const localTs = (column: string) => Prisma.raw(`("${column}" AT TIME ZONE 'UTC')`);

/** Report cache lifetime. Events invalidate earlier; the TTL bounds staleness across instances. */
const REPORT_TTL_SECONDS = 60;
const REPORT_INDEX_TTL_SECONDS = 3600;
const REPORT_INDEX_MAX = 200;

/** Everything that can change a number on the analytics page. */
const REPORT_INVALIDATING_EVENTS: DomainEventType[] = [
  'appointment.created',
  'appointment.updated',
  'appointment.rescheduled',
  'appointment.cancelled',
  'appointment.status_changed',
  'queue.updated',
  'schedule.optimized',
  'doctor.availability_changed',
  'settings.updated',
];

@Injectable()
export class AnalyticsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
    private readonly cache: RedisCacheService,
    private readonly scheduling: SchedulingService,
    private readonly events: DomainEventsService,
  ) {}

  onModuleInit(): void {
    for (const type of REPORT_INVALIDATING_EVENTS) {
      this.events.on(type, (e) => this.invalidateReports(e.clinicId));
    }
  }

  private static indexKey(clinicId: string) {
    return `analytics:idx:${clinicId}`;
  }

  /** Remember which report keys mention this clinic so an event can drop them. */
  private async indexReport(clinicIds: string[], key: string): Promise<void> {
    await Promise.all(
      clinicIds.map(async (id) => {
        const idx = AnalyticsService.indexKey(id);
        const keys = ((await this.cache.get<string[]>(idx)) ?? []).filter((k) => k !== key);
        keys.push(key);
        await this.cache.set(idx, keys.slice(-REPORT_INDEX_MAX), REPORT_INDEX_TTL_SECONDS);
      }),
    );
  }

  private async invalidateReports(clinicId: string): Promise<void> {
    const idx = AnalyticsService.indexKey(clinicId);
    const keys = (await this.cache.get<string[]>(idx)) ?? [];
    await Promise.all([...keys.map((k) => this.cache.del(k)), this.cache.del(idx)]);
  }

  // ================================================================ dashboard

  async dashboard(clinicId: string, now = new Date()): Promise<DashboardDto> {
    const key = `dashboard:${clinicId}`;
    const cached = await this.cache.get<DashboardDto>(key);
    if (cached) return cached;

    const settings = await this.settings.get(clinicId);
    const tz = settings.clinic.timezone;
    const today = todayIn(tz, now);
    const yesterday = addDays(today, -1);
    const lastWeek = addDays(today, -7);
    const from = addDays(today, -7);
    const rangeStart = localToUtc(from, 0, tz);
    const rangeEnd = localToUtc(addDays(today, 1), 0, tz);
    const todayStart = localToUtc(today, 0, tz);

    const [volumeRows, waitRows, schedule, statusRows, queueToday, ctx, metrics] =
      await Promise.all([
        this.prisma.$queryRaw<{ d: string; c: number }[]>(Prisma.sql`
        SELECT to_char(${localTs('startsAt')} AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
        FROM appointments
        WHERE "clinicId" = ${clinicId} AND "startsAt" >= ${rangeStart} AND "startsAt" < ${rangeEnd}
          AND status <> 'CANCELLED'
        GROUP BY 1`),
        this.prisma.$queryRaw<{ d: string; c: number; avg: number }[]>(Prisma.sql`
        SELECT to_char(${localTs('checkedInAt')} AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d, COUNT(*)::int AS c,
               AVG(EXTRACT(EPOCH FROM (COALESCE("calledAt", "startedAt") - "checkedInAt")) / 60)::float AS avg
        FROM queue_entries
        WHERE "clinicId" = ${clinicId} AND "checkedInAt" >= ${rangeStart} AND "checkedInAt" < ${rangeEnd}
          AND COALESCE("calledAt", "startedAt") IS NOT NULL
        GROUP BY 1`),
        this.prisma.appointment.findMany({
          where: { clinicId, startsAt: { gte: todayStart, lt: rangeEnd } },
          include: APPOINTMENT_LIST_INCLUDE,
          orderBy: [{ startsAt: 'asc' }, { code: 'asc' }],
        }),
        this.prisma.appointment.groupBy({
          by: ['status'],
          where: { clinicId, startsAt: { gte: todayStart, lt: rangeEnd } },
          _count: { _all: true },
        }),
        this.prisma.queueEntry.findMany({
          where: { clinicId, checkedInAt: { gte: todayStart, lt: rangeEnd } },
          select: { status: true, checkedInAt: true, calledAt: true, startedAt: true },
        }),
        this.scheduling.loadContext(clinicId, today),
        this.scheduling.metrics(clinicId, today),
      ]);

    const volume = new Map(volumeRows.map((r) => [r.d, r.c]));
    const actualWait = new Map(waitRows.map((r) => [r.d, r]));
    const todayCount = volume.get(today) ?? 0;

    const target = settings.targetWaitMinutes;
    const waiting = queueToday.filter((q) => q.status === 'WAITING');
    const waitingOver = waiting.filter(
      (q) => (now.getTime() - q.checkedInAt.getTime()) / 60_000 > target,
    ).length;

    const estimated = async (date: string) =>
      date === today
        ? metrics.totals.estimatedWaitMinutes
        : (await this.scheduling.metrics(clinicId, date)).totals.estimatedWaitMinutes;
    const waitFor = async (date: string, minEntries: number) => {
      const actual = actualWait.get(date);
      return actual && actual.c >= minEntries ? round1(actual.avg) : round1(await estimated(date));
    };
    const weekDates = dateRange(addDays(today, -6), today);
    // Independent day lookups: run them together instead of one after another.
    const [avgWait, avgWaitLastWeek, waitTrend] = await Promise.all([
      waitFor(today, 1),
      waitFor(lastWeek, 1),
      Promise.all(weekDates.map(async (date) => ({ date, minutes: await waitFor(date, 3) }))),
    ]);

    const [cancelled, newPatients, reminders, checkIns] = await Promise.all([
      this.prisma.appointment.aggregate({
        where: { clinicId, status: 'CANCELLED', updatedAt: { gte: todayStart, lt: rangeEnd } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.patient.aggregate({
        where: { clinicId, createdAt: { gte: todayStart, lt: rangeEnd } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.reminderDelivery.aggregate({
        where: {
          status: 'SENT',
          sentAt: { gte: todayStart, lt: rangeEnd },
          appointment: { clinicId },
        },
        _count: { _all: true },
        _max: { sentAt: true },
      }),
      this.prisma.queueEntry.aggregate({
        where: { clinicId, checkedInAt: { gte: todayStart, lt: rangeEnd } },
        _count: { _all: true },
        _max: { checkedInAt: true },
      }),
    ]);

    const optimizer = this.scheduling.runOptimizer(ctx, 'MIN_WAIT', now);
    const saved = Math.round(
      optimizer.before.estimatedWaitMinutes - optimizer.after.estimatedWaitMinutes,
    );

    const names = new Map(ctx.doctors.map((d) => [d.id, d.name]));
    const dto: DashboardDto = {
      kpis: {
        todayAppointments: todayCount,
        todayChangePct: pctChange(todayCount, volume.get(yesterday) ?? 0),
        patientsWaiting: waiting.length,
        waitingOverTarget: waitingOver,
        availableDoctors: ctx.doctors.filter((d) => d.available.length > 0).length,
        totalDoctors: ctx.doctors.length,
        utilisation: metrics.totals.utilisation,
        avgWaitMinutes: avgWait,
        avgWaitChangePct: pctChange(avgWait, avgWaitLastWeek),
      },
      schedule: schedule.map(toAppointmentListItem),
      activity: [
        {
          kind: 'CHECK_IN',
          count: checkIns._count._all,
          at: checkIns._max.checkedInAt?.toISOString() ?? null,
        },
        {
          kind: 'CANCELLATION',
          count: cancelled._count._all,
          at: cancelled._max.updatedAt?.toISOString() ?? null,
        },
        {
          kind: 'NEW_PATIENT',
          count: newPatients._count._all,
          at: newPatients._max.createdAt?.toISOString() ?? null,
        },
        {
          kind: 'REMINDER',
          count: reminders._count._all,
          at: reminders._max.sentAt?.toISOString() ?? null,
        },
      ],
      insight: saved > 0 ? { kind: 'OPTIMIZE', minutesSaved: saved } : null,
      weeklyVolume: weekDates.map((date) => ({ date, count: volume.get(date) ?? 0 })),
      statusDistribution: statusRows.map((r) => ({
        status: r.status as AppointmentStatus,
        count: r._count._all,
      })),
      doctorUtilisation: metrics.perDoctor.map((d) => ({
        doctorId: d.doctorId,
        name: names.get(d.doctorId) ?? '',
        utilisation: d.utilisation,
      })),
      waitTrend,
    };
    await this.cache.set(key, dto, 60);
    return dto;
  }

  // ================================================================ analytics

  /** Validate the query and resolve the clinics in scope. */
  async resolve(
    scopeCtx: { clinicId: string; organizationId: string; role: string },
    query: { from?: string; to?: string; scope?: AnalyticsScope },
    now = new Date(),
  ) {
    const scope: AnalyticsScope = query.scope ?? 'clinic';
    if (scope === 'organization' && scopeCtx.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Organization scope is for super admins',
      });
    }
    const clinics = await this.prisma.clinic.findMany({
      where:
        scope === 'organization'
          ? { organizationId: scopeCtx.organizationId }
          : { id: scopeCtx.clinicId, organizationId: scopeCtx.organizationId },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
    });
    const own = clinics.find((c) => c.id === scopeCtx.clinicId) ?? clinics[0];
    const ownTz = own?.timezone ?? 'UTC';
    const to = query.to ?? todayIn(ownTz, now);
    const from = query.from ?? addDays(to, -29);
    if (from > to) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'from must not be after to',
      });
    }
    if (dateRange(from, to).length > 366) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Range is limited to 366 days',
      });
    }
    const infos: ClinicInfo[] = clinics.map((c) => ({
      id: c.id,
      name: c.name,
      timeZone: c.timezone,
    }));
    return { scope, from, to, clinics: infos };
  }

  /**
   * One round of 5 parallel queries per clinic. The day and wait queries span the
   * previous AND the current range (rows carry a `cur` flag) so the comparison
   * period costs no extra round trip.
   */
  private async aggregate(
    clinic: ClinicInfo,
    range: { from: string; to: string; prevFrom: string },
    into: { current: Aggregates; before: Aggregates },
  ) {
    const tz = clinic.timeZone;
    const prevStart = localToUtc(range.prevFrom, 0, tz);
    const start = localToUtc(range.from, 0, tz);
    const end = localToUtc(addDays(range.to, 1), 0, tz);
    const id = clinic.id;
    const [days, specialties, hours, waits, doctors] = await Promise.all([
      this.prisma.$queryRaw<
        { d: string; s: string; cur: boolean; c: number; m: number }[]
      >(Prisma.sql`
        SELECT to_char(${localTs('startsAt')} AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d, status::text AS s,
               ("startsAt" >= ${start}) AS cur,
               COUNT(*)::int AS c,
               COALESCE(SUM(EXTRACT(EPOCH FROM ("endsAt" - "startsAt")) / 60), 0)::float AS m
        FROM appointments
        WHERE "clinicId" = ${id} AND "startsAt" >= ${prevStart} AND "startsAt" < ${end}
        GROUP BY 1, 2, 3`),
      this.prisma.$queryRaw<{ s: string; c: number }[]>(Prisma.sql`
        SELECT d.specialty AS s, COUNT(*)::int AS c
        FROM appointments a JOIN doctors d ON d.id = a."doctorId"
        WHERE a."clinicId" = ${id} AND a."startsAt" >= ${start} AND a."startsAt" < ${end}
          AND a.status <> 'CANCELLED'
        GROUP BY 1`),
      this.prisma.$queryRaw<{ h: number; c: number }[]>(Prisma.sql`
        SELECT EXTRACT(HOUR FROM ${localTs('startsAt')} AT TIME ZONE ${tz})::int AS h, COUNT(*)::int AS c
        FROM appointments
        WHERE "clinicId" = ${id} AND "startsAt" >= ${start} AND "startsAt" < ${end}
          AND status <> 'CANCELLED'
        GROUP BY 1`),
      this.prisma.$queryRaw<{ d: string; cur: boolean; c: number; sum: number }[]>(Prisma.sql`
        SELECT to_char(${localTs('checkedInAt')} AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d,
               ("checkedInAt" >= ${start}) AS cur, COUNT(*)::int AS c,
               SUM(EXTRACT(EPOCH FROM (COALESCE("calledAt", "startedAt") - "checkedInAt")) / 60)::float AS sum
        FROM queue_entries
        WHERE "clinicId" = ${id} AND "checkedInAt" >= ${prevStart} AND "checkedInAt" < ${end}
          AND COALESCE("calledAt", "startedAt") IS NOT NULL
        GROUP BY 1, 2`),
      this.prisma.$queryRaw<{ id: string; m: number }[]>(Prisma.sql`
        SELECT "doctorId" AS id, COALESCE(SUM(EXTRACT(EPOCH FROM ("endsAt" - "startsAt")) / 60), 0)::float AS m
        FROM appointments
        WHERE "clinicId" = ${id} AND "startsAt" >= ${start} AND "startsAt" < ${end}
          AND status NOT IN ${BOOKED}
        GROUP BY 1`),
    ]);
    for (const r of days) {
      const target = r.cur ? into.current : into.before;
      const day = target.byDay.get(r.d) ?? new Map();
      const cell = day.get(r.s) ?? { count: 0, minutes: 0 };
      cell.count += r.c;
      cell.minutes += r.m;
      day.set(r.s, cell);
      target.byDay.set(r.d, day);
    }
    const cur = into.current;
    for (const r of specialties) cur.bySpecialty.set(r.s, (cur.bySpecialty.get(r.s) ?? 0) + r.c);
    for (const r of hours) cur.peakHours.set(r.h, (cur.peakHours.get(r.h) ?? 0) + r.c);
    for (const r of waits) {
      const target = r.cur ? into.current : into.before;
      const cell = target.waits.get(r.d) ?? { n: 0, sum: 0 };
      cell.n += r.c;
      cell.sum += r.sum;
      target.waits.set(r.d, cell);
    }
    for (const r of doctors) cur.doctorBooked.set(r.id, (cur.doctorBooked.get(r.id) ?? 0) + r.m);
  }

  private async gather(
    clinics: ClinicInfo[],
    range: { from: string; to: string; prevFrom: string },
  ): Promise<{ current: Aggregates; before: Aggregates }> {
    const empty = (): Aggregates => ({
      byDay: new Map(),
      bySpecialty: new Map(),
      peakHours: new Map(),
      waits: new Map(),
      doctorBooked: new Map(),
    });
    const into = { current: empty(), before: empty() };
    await Promise.all(clinics.map((clinic) => this.aggregate(clinic, range, into)));
    return into;
  }

  private kpis(a: Aggregates, days: number) {
    let total = 0;
    let cancelled = 0;
    let noShow = 0;
    let completed = 0;
    let booked = 0;
    let bookedMinutes = 0;
    for (const day of a.byDay.values()) {
      for (const [status, cell] of day) {
        total += cell.count;
        if (status === 'CANCELLED') cancelled += cell.count;
        else {
          booked += cell.count;
          bookedMinutes += cell.minutes;
        }
        if (status === 'NO_SHOW') noShow += cell.count;
        if (status === 'COMPLETED') completed += cell.count;
      }
    }
    let waitN = 0;
    let waitSum = 0;
    for (const w of a.waits.values()) {
      waitN += w.n;
      waitSum += w.sum;
    }
    return {
      volume: booked,
      noShowRate: total ? round1((noShow / total) * 100) : 0,
      cancellationRate: total ? round1((cancelled / total) * 100) : 0,
      avgWaitMinutes: waitN ? round1(waitSum / waitN) : 0,
      throughputPerDay: days ? round1(completed / days) : 0,
      avgDurationMinutes: booked ? round1(bookedMinutes / booked) : 0,
    };
  }

  async analytics(
    scopeCtx: { clinicId: string; organizationId: string; role: string },
    query: { from?: string; to?: string; scope?: AnalyticsScope },
    now = new Date(),
  ): Promise<AnalyticsDto> {
    // Authorisation first: a cached organization report must never reach a non-super-admin.
    if ((query.scope ?? 'clinic') === 'organization' && scopeCtx.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Organization scope is for super admins',
      });
    }
    const key = [
      'analytics',
      query.scope === 'organization' ? `org:${scopeCtx.organizationId}` : scopeCtx.clinicId,
      query.from ?? '-',
      query.to ?? '-',
    ].join(':');
    const cached = await this.cache.get<AnalyticsDto>(key);
    if (cached) return cached;

    const dto = await this.buildReport(scopeCtx, query, now);
    await this.cache.set(key, dto, REPORT_TTL_SECONDS);
    await this.indexReport(
      query.scope === 'organization'
        ? await this.clinicIdsOfOrganization(scopeCtx.organizationId)
        : [scopeCtx.clinicId],
      key,
    );
    return dto;
  }

  private async clinicIdsOfOrganization(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.clinic.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return rows.map((c) => c.id);
  }

  private async buildReport(
    scopeCtx: { clinicId: string; organizationId: string; role: string },
    query: { from?: string; to?: string; scope?: AnalyticsScope },
    now: Date,
  ): Promise<AnalyticsDto> {
    const { scope, from, to, clinics } = await this.resolve(scopeCtx, query, now);
    const previous = previousRange(from, to);
    const dates = dateRange(from, to);
    // Doctor rows load in parallel with the aggregates; only the booked minutes join later.
    const doctorsPromise = this.loadDoctors(clinics, dates);
    const { current, before } = await this.gather(clinics, {
      from,
      to,
      prevFrom: previous.from,
    });
    const k = this.kpis(current, dates.length);
    const p = this.kpis(before, dates.length);

    const statusTotals = new Map<string, number>();
    for (const day of current.byDay.values()) {
      for (const [status, cell] of day)
        statusTotals.set(status, (statusTotals.get(status) ?? 0) + cell.count);
    }
    const volumeOf = (date: string) => {
      let n = 0;
      for (const [status, cell] of current.byDay.get(date) ?? [])
        if (status !== 'CANCELLED') n += cell.count;
      return n;
    };

    return {
      range: { from, to },
      previous,
      scope,
      kpis: {
        volume: k.volume,
        volumeChangePct: pctChange(k.volume, p.volume),
        noShowRate: k.noShowRate,
        noShowRateChange: round1(k.noShowRate - p.noShowRate),
        cancellationRate: k.cancellationRate,
        cancellationRateChange: round1(k.cancellationRate - p.cancellationRate),
        avgWaitMinutes: k.avgWaitMinutes,
        avgWaitChange: round1(k.avgWaitMinutes - p.avgWaitMinutes),
        throughputPerDay: k.throughputPerDay,
        throughputChangePct: pctChange(k.throughputPerDay, p.throughputPerDay),
        avgDurationMinutes: k.avgDurationMinutes,
      },
      volumeByDay: dates.map((date) => ({ date, count: volumeOf(date) })),
      waitByDay: dates.map((date) => {
        const w = current.waits.get(date);
        return { date, minutes: w && w.n ? round1(w.sum / w.n) : 0 };
      }),
      bySpecialty: [...current.bySpecialty]
        .map(([specialty, count]) => ({ specialty, count }))
        .sort((a, b) => b.count - a.count || a.specialty.localeCompare(b.specialty)),
      statusDistribution: [...statusTotals].map(([status, count]) => ({
        status: status as AppointmentStatus,
        count,
      })),
      doctorUtilisation: this.doctorUtilisation(await doctorsPromise, dates, current.doctorBooked),
      peakHours: Array.from({ length: 14 }, (_, i) => ({
        hour: 7 + i,
        count: current.peakHours.get(7 + i) ?? 0,
      })),
    };
  }

  private async loadDoctors(clinics: ClinicInfo[], dates: string[]) {
    if (!dates.length) return [];
    return Promise.all(
      clinics.map(async (clinic) => {
        const start = localToUtc(dates[0]!, 0, clinic.timeZone);
        const end = localToUtc(addDays(dates[dates.length - 1]!, 1), 0, clinic.timeZone);
        const doctors = await this.prisma.doctor.findMany({
          where: { clinicId: clinic.id, isActive: true },
          include: {
            workingHours: true,
            leaves: { where: { startsAt: { lt: end }, endsAt: { gt: start } } },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
        return { clinic, doctors };
      }),
    );
  }

  /** booked minutes / available minutes over the range, from working hours and leave. */
  private doctorUtilisation(
    loaded: Awaited<ReturnType<AnalyticsService['loadDoctors']>>,
    dates: string[],
    booked: Map<string, number>,
  ): AnalyticsDto['doctorUtilisation'] {
    const out: AnalyticsDto['doctorUtilisation'] = [];
    for (const { clinic, doctors } of loaded) {
      for (const d of doctors) {
        const leaves = d.leaves.map((l) => ({ startsAt: l.startsAt, endsAt: l.endsAt }));
        let available = 0;
        for (const date of dates) {
          if (!d.workingHours.some((w) => w.weekday === weekdayOf(date))) continue;
          available += totalMinutes(
            availableIntervals(date, clinic.timeZone, d.workingHours, leaves),
          );
        }
        out.push({
          doctorId: d.id,
          name: doctorName(d),
          utilisation:
            available > 0
              ? Math.min(100, Math.round(((booked.get(d.id) ?? 0) / available) * 100))
              : 0,
        });
      }
    }
    return out;
  }
}
