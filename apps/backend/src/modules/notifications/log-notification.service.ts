import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.interface';

// Default implementation. No Firebase project exists in this project as of
// 2026-10-09 (decision 0033, rule 9) — this ships now so order placement
// and status transitions are correct and observable immediately, and swaps
// for a Firebase Admin SDK implementation later as a provider change only.
@Injectable()
export class LogNotificationService implements NotificationService {
  private readonly logger = new Logger(LogNotificationService.name);

  async sendOrderPlaced(customerId: string, orderId: string): Promise<void> {
    this.logger.log(`[notify] order placed: customer=${customerId} order=${orderId}`);
  }

  async sendOrderStatusChanged(
    customerId: string,
    orderId: string,
    status: string,
  ): Promise<void> {
    this.logger.log(
      `[notify] order status changed: customer=${customerId} order=${orderId} status=${status}`,
    );
  }

  async sendNewOrderToVendor(vendorId: string, orderVendorGroupId: string): Promise<void> {
    this.logger.log(
      `[notify] new order for vendor: vendor=${vendorId} orderVendorGroup=${orderVendorGroupId}`,
    );
  }
}
