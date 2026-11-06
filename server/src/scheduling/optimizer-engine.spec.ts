import { ServiceUnavailableException } from '@nestjs/common';
import { SchedulingService, type DayContext } from './scheduling.service';
import type { ServiceClient } from '../services/service-client';

const start = new Date('2026-11-09T08:00:00Z');
const end = new Date('2026-11-09T17:00:00Z');
const ctx = {
  clinicId: 'c1',
  date: '2026-11-09',
  settings: { slotMinutes: 15 },
  timeZone: 'Africa/Tunis',
  start,
  end,
  doctors: [
    {
      id: 'd1',
      name: 'Dr. A',
      initials: 'A',
      specialty: 'GP',
      roomId: null,
      userId: null,
      available: [{ start: start.getTime(), end: end.getTime() }],
      work: [],
      breaks: [],
    },
  ],
  appointments: [],
} as unknown as DayContext;

function service(scheduler?: Partial<ServiceClient>) {
  const none = {} as never;
  return new SchedulingService(
    none,
    none,
    none,
    none,
    none,
    none,
    scheduler as ServiceClient | undefined,
  );
}

describe('optimiser engine selection (ADR 0003)', () => {
  const now = new Date('2026-11-09T07:00:00Z');

  it('uses the TypeScript optimiser when the scheduler service is not configured', async () => {
    const outcome = await service(undefined).runOptimizerPreferred('c1', ctx, 'MIN_WAIT', now);
    expect(outcome.engine).toBe('typescript');
    expect(outcome.result.status).toBe('NO_IMPROVEMENT');
  });

  it('uses the Python service when it answers, with a system principal for the clinic', async () => {
    const local = await service(undefined).runOptimizerPreferred('c1', ctx, 'MIN_WAIT', now);
    const request = jest.fn(async () => local.result);
    const outcome = await service({ enabled: true, request } as never).runOptimizerPreferred(
      'c1',
      ctx,
      'MIN_WAIT',
      now,
    );
    expect(outcome.engine).toBe('python');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/optimize',
        principal: { clinicId: 'c1', userId: 'system', role: 'SYSTEM' },
        body: expect.objectContaining({ objective: 'MIN_WAIT', slotMinutes: 15 }),
      }),
    );
  });

  it('falls back to TypeScript when the service is unavailable', async () => {
    const request = jest.fn(async () => {
      throw new ServiceUnavailableException({ code: 'SERVICE_UNAVAILABLE' });
    });
    const outcome = await service({ enabled: true, request } as never).runOptimizerPreferred(
      'c1',
      ctx,
      'REDUCE_GAPS',
      now,
    );
    expect(outcome.engine).toBe('typescript');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
