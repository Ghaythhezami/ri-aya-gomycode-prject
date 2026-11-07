import { Module } from '@nestjs/common';
import { NotificationsController, RemindersCronController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationConsumers } from './notification.consumers';
import { ReminderProcessor } from './reminder.processor';
import { AppointmentMailer } from './appointment-mailer.service';
import { MailReminderProvider, REMINDER_PROVIDER } from './reminder.provider';

@Module({
  controllers: [NotificationsController, RemindersCronController],
  providers: [
    NotificationsService,
    NotificationConsumers,
    ReminderProcessor,
    AppointmentMailer,
    { provide: REMINDER_PROVIDER, useClass: MailReminderProvider },
  ],
  exports: [NotificationsService, ReminderProcessor],
})
export class NotificationsModule {}
