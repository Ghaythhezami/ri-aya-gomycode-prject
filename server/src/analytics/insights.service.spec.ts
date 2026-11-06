import { BadRequestException } from '@nestjs/common';
import type { SchedulingInsights } from '@riaya/shared';
import { InsightsService } from './insights.service';
import type { ServiceClient } from '../services/service-client';

const scope = {
  userId: 'u1',
  clinicId: 'c1',
  organizationId: 'o1',
  role: 'CLINIC_ADMIN',
} as never;

function insights(): SchedulingInsights {
  return {
    range: { from: '2026-05-10', to: '2026-11-06', timeZone: 'Africa/Tunis' },
    totals: { appointments: 10, completed: 8, noShows: 1, cancelled: 1, noShowRate: 0.11 },
    demand: { matrix: Array.from({ length: 7 }, () => Array(24).fill(0)), peak: [] },
    noShow: { byWeekday: [], byHour: [], byType: [], byLeadTime: [] },
    doctors: [
      {
        doctorId: 'd1',
        appointments: 10,
        bookedMinutes: 300,
        noShowRate: 0.1,
        avgDurationMinutes: 30,
      },
    ],
    forecast: [],
    recommendations: [
      {
        kind: 'UNDERUSED_DOCTOR',
        params: { doctorId: 'd1', bookedMinutes: 300, medianMinutes: 900 },
      },
    ],
    meta: { rowsScanned: 10, chunks: 1, durationMs: 3, engine: 'numpy' },
  };
}

function setup() {
  const request = jest.fn(async () => insights());
  const scheduler = { enabled: true, request } as unknown as ServiceClient;
  const prisma = {
    doctor: {
      findMany: jest.fn(async () => [{ id: 'd1', firstName: 'Amel', lastName: 'Ben Ali' }]),
    },
  };
  const settings = { get: jest.fn(async () => ({ clinic: { timezone: 'Africa/Tunis' } })) };
  const service = new InsightsService(prisma as never, settings as never, scheduler);
  return { service, request, prisma };
}

describe('InsightsService', () => {
  it('defaults to the last 180 days in the clinic time zone and signs for the caller', async () => {
    const { service, request } = setup();
    await service.insights(scope, {}, new Date('2026-11-06T10:00:00Z'));
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/insights',
        principal: { clinicId: 'c1', userId: 'u1', role: 'CLINIC_ADMIN' },
        body: { from: '2026-05-10', to: '2026-11-06', timeZone: 'Africa/Tunis' },
      }),
    );
  });

  it('adds doctor names from the clinic only', async () => {
    const { service, prisma } = setup();
    const result = await service.insights(scope, { from: '2026-01-01', to: '2026-02-01' });
    expect(result.doctors[0].doctorName).toBe('Dr. Amel Ben Ali');
    expect(result.recommendations[0]).toMatchObject({
      kind: 'UNDERUSED_DOCTOR',
      params: { doctorName: 'Dr. Amel Ben Ali' },
    });
    expect(prisma.doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['d1'] }, clinicId: 'c1' } }),
    );
  });

  it('rejects an inverted or too long range before calling the service', async () => {
    const { service, request } = setup();
    await expect(
      service.insights(scope, { from: '2026-02-01', to: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.insights(scope, { from: '2023-01-01', to: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(request).not.toHaveBeenCalled();
  });
});
