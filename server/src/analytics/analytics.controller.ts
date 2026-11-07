import { Controller, Get, Headers, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import type { Response } from 'express';
import { type AnalyticsScope } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { AnalyticsService } from './analytics.service';
import { ExportService } from './export.service';
import { InsightsService } from './insights.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class InsightsQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class AnalyticsQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(['clinic', 'organization'])
  scope?: AnalyticsScope;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly exports: ExportService,
    private readonly tenant: TenantContext,
    private readonly insightsService: InsightsService,
  ) {}

  /** Large-history scheduling insights from the Python scheduler service (ADR 0003). */
  @Get('analytics/insights')
  @RequireCapability('viewAnalytics')
  @ApiOperation({
    summary: 'Get scheduling insights',
    description:
      'Large-history scheduling insights computed by the Python scheduler service (ADR 0003). Requires the viewAnalytics capability.',
  })
  @ApiOkResponse({ description: 'SchedulingInsights' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  insights(@Query() query: InsightsQueryDto) {
    return this.insightsService.insights(this.tenant.get(), query);
  }

  @Get('dashboard')
  @RequireCapability('viewOverview')
  @ApiOperation({
    summary: 'Get the dashboard overview',
    description: 'Today at a glance for the current clinic. Requires the viewOverview capability.',
  })
  @ApiOkResponse({ description: 'DashboardDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  dashboard() {
    return this.analytics.dashboard(this.tenant.get().clinicId);
  }

  @Get('analytics')
  @RequireCapability('viewAnalytics')
  @ApiOperation({
    summary: 'Get the analytics report',
    description:
      'KPIs and charts for a date range, for one clinic or the whole organisation (scope). Requires the viewAnalytics capability.',
  })
  @ApiOkResponse({ description: 'AnalyticsDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  report(@Query() query: AnalyticsQueryDto) {
    return this.analytics.analytics(this.tenant.get(), query);
  }

  @Get('analytics/export.csv')
  @RequireCapability('manageSettings')
  @ApiOperation({
    summary: 'Export appointments as CSV',
    description:
      'Streams the appointments of the range as a CSV attachment. Requires the manageSettings capability.',
  })
  @ApiOkResponse({ description: 'text/csv attachment' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  async exportCsv(@Query() query: AnalyticsQueryDto, @Res() res: Response) {
    const { from, to, clinics } = await this.analytics.resolve(this.tenant.get(), query);
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="riaya-appointments-${from}-${to}.csv"`,
    );
    try {
      await this.exports.streamCsv(clinics, from, to, (chunk) => {
        res.write(chunk);
      });
    } finally {
      res.end();
    }
  }

  @Get('analytics/export.pdf')
  @RequireCapability('manageSettings')
  @ApiOperation({
    summary: 'Export the analytics report as PDF',
    description:
      'Renders the analytics report as a PDF attachment, localised from Accept-Language. Requires the manageSettings capability.',
  })
  @ApiOkResponse({ description: 'application/pdf attachment' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  async exportPdf(
    @Query() query: AnalyticsQueryDto,
    @Res() res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const scope = this.tenant.get();
    const report = await this.analytics.analytics(scope, query);
    const { clinics } = await this.analytics.resolve(scope, query);
    const name = report.scope === 'organization' ? 'All clinics' : (clinics[0]?.name ?? '');
    // Python report renderer (charts, Arabic shaping) when the scheduler is configured,
    // the built-in writer otherwise or on failure (ADR 0003).
    const buffer = await this.exports.renderPdf(scope, report, name, acceptLanguage);
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="riaya-analytics-${report.range.from}-${report.range.to}.pdf"`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
