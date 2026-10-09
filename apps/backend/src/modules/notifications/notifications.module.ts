import { Module } from '@nestjs/common';
import { NOTIFICATION_SERVICE } from './notification.interface';
import { LogNotificationService } from './log-notification.service';

@Module({
  providers: [
    LogNotificationService,
    { provide: NOTIFICATION_SERVICE, useExisting: LogNotificationService },
  ],
  exports: [NOTIFICATION_SERVICE],
})
export class NotificationsModule {}
