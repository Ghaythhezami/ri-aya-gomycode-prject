import { Module } from '@nestjs/common';
import { NotificationsController, RemindersCronController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationConsumers } from './notification.consumers';
import { ReminderProcessor } from './reminder.processor';
import { MockReminderProvider, REMINDER_PROVIDER } from './reminder.provider';

@Module({
  controllers: [NotificationsController, RemindersCronController],
  providers: [
    NotificationsService,
    NotificationConsumers,
    ReminderProcessor,
    { provide: REMINDER_PROVIDER, useClass: MockReminderProvider },
  ],
  exports: [NotificationsService, ReminderProcessor],
})
export class NotificationsModule {}
