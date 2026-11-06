import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { SchedulingInsights } from '@riaya/shared';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { addDays, todayIn } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import { doctorName } from '../common/mappers';
import { ServiceClient } from '../services/service-client';
import { SCHEDULER_CLIENT } from '../services/service-tokens';
import type { TenantScope } from '../tenancy/tenant-context';

/** Default look-back of the insights screen. */
export const INSIGHTS_DEFAULT_DAYS = 180;
/** Longest range the scheduler service accepts (ADR 0003). */
export const INSIGHTS_MAX_DAYS = 730;

const DAY_MS = 86_400_000;

/**
 * Large-history insights (demand heatmap, no-show risk, forecast, recommendations). The numpy
 * aggregation runs in the Python scheduler service; the API adds the tenant, the clinic time
 * zone and doctor names. No fallback: without the service the endpoint answers 503.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
    @Inject(SCHEDULER_CLIENT) private readonly scheduler: ServiceClient,
  ) {}

  async insights(
    scope: TenantScope,
    query: { from?: string; to?: string },
    now = new Date(),
  ): Promise<SchedulingInsights> {
    const timezone = (await this.settings.get(scope.clinicId)).clinic.timezone;
    const to = query.to ?? todayIn(timezone, now);
    const from = query.from ?? addDays(to, -INSIGHTS_DEFAULT_DAYS);
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
    if (span < 0 || span > INSIGHTS_MAX_DAYS) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `from must be before to and the range at most ${INSIGHTS_MAX_DAYS} days`,
      });
    }

    const result = await this.scheduler.request<SchedulingInsights>({
      path: '/v1/insights',
      principal: { clinicId: scope.clinicId, userId: scope.userId, role: scope.role },
      body: { from, to, timeZone: timezone },
      timeoutMs: 15_000,
    });

    const ids = [
      ...new Set([
        ...result.doctors.map((d) => d.doctorId),
        ...result.recommendations.flatMap((r) =>
          r.kind === 'UNDERUSED_DOCTOR' ? [r.params.doctorId] : [],
        ),
      ]),
    ];
    const doctors = ids.length
      ? await this.prisma.doctor.findMany({
          where: { id: { in: ids }, clinicId: scope.clinicId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(doctors.map((d) => [d.id, doctorName(d)]));
    return {
      ...result,
      doctors: result.doctors.map((d) => ({ ...d, doctorName: names.get(d.doctorId) ?? '' })),
      recommendations: result.recommendations.map((r) =>
        r.kind === 'UNDERUSED_DOCTOR'
          ? { ...r, params: { ...r.params, doctorName: names.get(r.params.doctorId) ?? '' } }
          : r,
      ),
    };
  }
}
