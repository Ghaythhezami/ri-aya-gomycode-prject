import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PublicModule } from './public/public.module';
import { QueueModule } from './queue/queue.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SettingsModule } from './settings/settings.module';

/**
 * Clinic operations: queue, smart scheduling, dashboard/analytics,
 * notifications and reminders, settings, audit browsing and chat.
 */
@Module({
  imports: [
    NotificationsModule,
    QueueModule,
    PublicModule,
    SchedulingModule,
    AnalyticsModule,
    SettingsModule,
    ChatModule,
  ],
})
export class OperationsModule {}
