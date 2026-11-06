import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ExportService } from './export.service';

@Module({
  imports: [SchedulingModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ExportService],
})
export class AnalyticsModule {}
