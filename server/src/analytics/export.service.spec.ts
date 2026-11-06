import type { AnalyticsDto } from '@riaya/shared';
import { ExportService, PDF_RENDER_TIMEOUT_MS, pickReportLocale } from './export.service';

const scope = {
  userId: 'u1',
  clinicId: 'c1',
  organizationId: 'o1',
  role: 'CLINIC_ADMIN',
} as never;

const report: AnalyticsDto = {
  range: { from: '2026-10-01', to: '2026-10-31' },
  previous: { from: '2026-09-01', to: '2026-09-30' },
  scope: 'clinic',
  kpis: {
    volume: 120,
    volumeChangePct: 5,
    noShowRate: 7,
    noShowRateChange: -1,
    cancellationRate: 9,
    cancellationRateChange: 0.5,
    avgWaitMinutes: 14,
    avgWaitChange: -2,
    throughputPerDay: 4,
    throughputChangePct: 3,
    avgDurationMinutes: 25,
  },
  volumeByDay: [{ date: '2026-10-01', count: 4 }],
  waitByDay: [{ date: '2026-10-01', minutes: 14 }],
  bySpecialty: [{ specialty: 'Cardiology', count: 40 }],
  statusDistribution: [{ status: 'COMPLETED', count: 100 }],
  doctorUtilisation: [{ doctorId: 'd1', name: 'Dr. A', utilisation: 70 }],
  peakHours: [{ hour: 9, count: 12 }],
};

const PYTHON_PDF = Buffer.from('%PDF-1.7 from python');

function setup(options: { enabled?: boolean; defaultLanguage?: string } = {}) {
  const requestBuffer = jest.fn(async (_req: unknown) => ({
    buffer: PYTHON_PDF,
    contentType: 'application/pdf',
  }));
  const scheduler = { enabled: options.enabled ?? true, requestBuffer };
  const insights = { insights: jest.fn(async () => ({ totals: { appointments: 1 } })) };
  const settings = {
    get: jest.fn(async () => ({
      defaultLanguage: options.defaultLanguage ?? 'fr',
      clinic: { name: 'Clinic X', timezone: 'Africa/Tunis', currency: 'TND' },
    })),
  };
  const service = new ExportService(
    {} as never,
    settings as never,
    insights as never,
    scheduler as never,
  );
  return { service, requestBuffer, insights, settings };
}

describe('pickReportLocale', () => {
  it('uses the first supported tag, else the fallback', () => {
    expect(pickReportLocale('ar-EG,ar;q=0.9,en;q=0.8', 'en')).toBe('ar');
    expect(pickReportLocale('FR-fr', 'en')).toBe('fr');
    expect(pickReportLocale('de-DE,en;q=0.8', 'fr')).toBe('fr');
    expect(pickReportLocale(undefined, 'ar')).toBe('ar');
  });
});

describe('ExportService.renderPdf', () => {
  it('renders through the scheduler service with locale, clinic and insights', async () => {
    const { service, requestBuffer } = setup();
    const now = new Date('2026-11-06T10:00:00Z');
    const pdf = await service.renderPdf(scope, report, 'Clinic X', 'ar,en;q=0.5', now);
    expect(pdf).toBe(PYTHON_PDF);
    const call = requestBuffer.mock.calls[0][0] as {
      path: string;
      timeoutMs: number;
      principal: Record<string, string>;
      body: Record<string, unknown>;
    };
    expect(call.path).toBe('/v1/reports/analytics');
    expect(call.timeoutMs).toBe(PDF_RENDER_TIMEOUT_MS);
    expect(call.principal).toEqual({ clinicId: 'c1', userId: 'u1', role: 'CLINIC_ADMIN' });
    expect(call.body).toMatchObject({
      locale: 'ar',
      clinic: { name: 'Clinic X', timeZone: 'Africa/Tunis', currency: 'TND' },
      range: { from: '2026-10-01', to: '2026-10-31' },
      scope: 'clinic',
      generatedAt: '2026-11-06T10:00:00.000Z',
      analytics: report,
      insights: { totals: { appointments: 1 } },
    });
  });

  it('falls back to the clinic default language without Accept-Language', async () => {
    const { service, requestBuffer } = setup({ defaultLanguage: 'fr' });
    await service.renderPdf(scope, report, 'Clinic X');
    expect((requestBuffer.mock.calls[0][0] as { body: { locale: string } }).body.locale).toBe('fr');
  });

  it('sends insights null when the insights call fails', async () => {
    const { service, requestBuffer, insights } = setup();
    insights.insights.mockRejectedValueOnce(new Error('503'));
    const pdf = await service.renderPdf(scope, report, 'Clinic X', 'en');
    expect(pdf).toBe(PYTHON_PDF);
    expect(
      (requestBuffer.mock.calls[0][0] as { body: { insights: unknown } }).body.insights,
    ).toBeNull();
  });

  it('uses the built-in writer when the service is disabled', async () => {
    const { service, requestBuffer } = setup({ enabled: false });
    const pdf = await service.renderPdf(scope, report, 'Clinic X', 'en');
    expect(requestBuffer).not.toHaveBeenCalled();
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf).not.toBe(PYTHON_PDF);
  });

  it('falls back to the built-in writer when the service call fails', async () => {
    const { service, requestBuffer } = setup();
    requestBuffer.mockRejectedValueOnce(new Error('timeout'));
    const pdf = await service.renderPdf(scope, report, 'Clinic X', 'en');
    expect(requestBuffer).toHaveBeenCalledTimes(1);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.equals(PYTHON_PDF)).toBe(false);
  });

  it('falls back when the service answers something that is not a PDF', async () => {
    const { service, requestBuffer } = setup();
    requestBuffer.mockResolvedValueOnce({
      buffer: Buffer.from('<html>'),
      contentType: 'text/html',
    });
    const pdf = await service.renderPdf(scope, report, 'Clinic X', 'en');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).not.toContain('<html>');
  });
});
