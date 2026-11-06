import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SUPPORTED_LOCALES,
  type AnalyticsDto,
  type Locale,
  type SchedulingInsights,
} from '@riaya/shared';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { localParts, localToUtc, addDays } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import { doctorName } from '../common/mappers';
import { ServiceClient } from '../services/service-client';
import { SCHEDULER_CLIENT } from '../services/service-tokens';
import type { TenantScope } from '../tenancy/tenant-context';
import { CSV_BOM, csvRow } from './csv';
import { InsightsService } from './insights.service';
import { PdfBuilder } from './pdf-writer';

export const CSV_HEADER = [
  'code',
  'date',
  'time',
  'patient_code',
  'doctor',
  'specialty',
  'type',
  'status',
  'duration_minutes',
];

const CHUNK = 500;
/** The Python renderer shapes Arabic and draws charts; give it more time than a JSON call. */
export const PDF_RENDER_TIMEOUT_MS = 20_000;

/** First `Accept-Language` tag when it is a supported locale, otherwise `fallback`. */
export function pickReportLocale(header: string | undefined, fallback: Locale): Locale {
  const first = header?.split(',')[0]?.split(';')[0]?.trim().toLowerCase().split('-')[0];
  return SUPPORTED_LOCALES.find((l) => l === first) ?? fallback;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
    private readonly insights: InsightsService,
    @Inject(SCHEDULER_CLIENT) private readonly scheduler: ServiceClient,
  ) {}

  /**
   * The analytics PDF. With the scheduler service enabled it is rendered there (charts, Arabic
   * shaping, optional insights); on any failure, or when the service is off, the in-process
   * writer produces the plain report so the export never breaks.
   */
  async renderPdf(
    scope: TenantScope,
    report: AnalyticsDto,
    clinicName: string,
    acceptLanguage?: string,
    now = new Date(),
  ): Promise<Buffer> {
    if (!this.scheduler.enabled) return this.buildPdf(report, clinicName);
    try {
      const [clinicSettings, insights] = await Promise.all([
        this.settings.get(scope.clinicId),
        this.insights
          .insights(scope, { from: report.range.from, to: report.range.to })
          .catch((): SchedulingInsights | null => null),
      ]);
      const { buffer, contentType } = await this.scheduler.requestBuffer({
        path: '/v1/reports/analytics',
        principal: { clinicId: scope.clinicId, userId: scope.userId, role: scope.role },
        body: {
          locale: pickReportLocale(acceptLanguage, clinicSettings.defaultLanguage ?? 'en'),
          clinic: {
            name: clinicName || clinicSettings.clinic.name,
            timeZone: clinicSettings.clinic.timezone,
            currency: clinicSettings.clinic.currency,
          },
          range: { from: report.range.from, to: report.range.to },
          scope: report.scope,
          generatedAt: now.toISOString(),
          analytics: report,
          insights,
        },
        timeoutMs: PDF_RENDER_TIMEOUT_MS,
      });
      if (
        !contentType.startsWith('application/pdf') ||
        buffer.subarray(0, 4).toString() !== '%PDF'
      ) {
        throw new Error(`unexpected report response (${contentType})`);
      }
      return buffer;
    } catch (error) {
      this.logger.warn(
        `scheduler PDF failed, using the built-in writer: ${(error as Error).message}`,
      );
      return this.buildPdf(report, clinicName);
    }
  }

  /** Calls `write` with the BOM + header, then with each chunk of rows. */
  async streamCsv(
    clinics: { id: string; timeZone: string }[],
    from: string,
    to: string,
    write: (chunk: string) => void,
  ): Promise<void> {
    write(CSV_BOM + csvRow(CSV_HEADER));
    for (const clinic of clinics) {
      const start = localToUtc(from, 0, clinic.timeZone);
      const end = localToUtc(addDays(to, 1), 0, clinic.timeZone);
      let cursor: string | undefined;
      for (;;) {
        const rows = await this.prisma.appointment.findMany({
          where: { clinicId: clinic.id, startsAt: { gte: start, lt: end } },
          include: {
            patient: { select: { code: true } },
            doctor: { select: { firstName: true, lastName: true, specialty: true } },
          },
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          take: CHUNK,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!rows.length) break;
        write(
          rows
            .map((a) => {
              const p = localParts(a.startsAt, clinic.timeZone);
              const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
              const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
              return csvRow([
                a.code,
                date,
                time,
                a.patient.code,
                doctorName(a.doctor),
                a.doctor.specialty,
                a.type,
                a.status,
                Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000),
              ]);
            })
            .join(''),
        );
        cursor = rows[rows.length - 1]!.id;
        if (rows.length < CHUNK) break;
      }
    }
  }

  buildPdf(report: AnalyticsDto, clinicName: string): Buffer {
    const pdf = new PdfBuilder({
      title: "RI'AYA analytics report",
      author: 'Mohamed Reda',
      creator: "RI'AYA",
      producer: "RI'AYA",
    });
    const left = 40;
    let y = pdf.height - 50;
    const line = (text: string, size = 10, bold = false, gap = 16) => {
      if (y < 60) {
        pdf.addPage();
        y = pdf.height - 50;
      }
      pdf.text(left, y, text, size, bold);
      y -= gap;
    };

    line("RI'AYA analytics report", 20, true, 26);
    line(
      `${clinicName}  |  ${report.range.from} to ${report.range.to}  |  scope: ${report.scope}`,
      10,
      false,
      24,
    );

    // KPI band
    const k = report.kpis;
    const cards: [string, string][] = [
      ['Appointments', String(k.volume)],
      ['No-show rate', `${k.noShowRate}%`],
      ['Cancellation', `${k.cancellationRate}%`],
      ['Avg wait (min)', String(k.avgWaitMinutes)],
      ['Per day', String(k.throughputPerDay)],
    ];
    const cardWidth = (pdf.width - left * 2 - 4 * 8) / cards.length;
    cards.forEach(([label, value], i) => {
      const x = left + i * (cardWidth + 8);
      pdf.rect(x, y - 44, cardWidth, 50, [0.9, 0.95, 0.94]);
      pdf.rect(x, y - 44, 4, 50, [0.05, 0.45, 0.4]);
      pdf.text(x + 10, y - 14, value, 16, true);
      pdf.text(x + 10, y - 32, label, 8);
    });
    y -= 70;

    // Volume by day bar chart (last 31 days of the range)
    line('Appointments by day', 12, true, 18);
    const days = report.volumeByDay.slice(-31);
    const max = Math.max(1, ...days.map((d) => d.count));
    const maxWidth = pdf.width - left * 2 - 90;
    for (const d of days) {
      if (y < 60) {
        pdf.addPage();
        y = pdf.height - 50;
      }
      pdf.text(left, y, d.date, 7);
      const width = (d.count / max) * maxWidth;
      if (width > 0) pdf.rect(left + 55, y - 2, width, 8, [0.05, 0.45, 0.4]);
      pdf.text(left + 60 + width, y, String(d.count), 7);
      y -= 11;
    }
    y -= 14;

    line('By specialty', 12, true, 18);
    for (const s of report.bySpecialty) line(`${s.specialty}: ${s.count}`, 10, false, 14);
    y -= 8;
    line('Status distribution', 12, true, 18);
    for (const s of report.statusDistribution) line(`${s.status}: ${s.count}`, 10, false, 14);
    y -= 8;
    line('Doctor utilisation', 12, true, 18);
    for (const d of report.doctorUtilisation) line(`${d.name}: ${d.utilisation}%`, 10, false, 14);
    y -= 8;
    line('Peak hours', 12, true, 18);
    for (const h of report.peakHours.filter((p) => p.count > 0)) {
      line(`${String(h.hour).padStart(2, '0')}:00  ${h.count}`, 10, false, 14);
    }
    return pdf.build();
  }
}
