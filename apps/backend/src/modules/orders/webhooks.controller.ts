import { BadRequestException, Controller, Headers, Inject, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { Order, OrderStatus } from './models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from './models/order-vendor-group.model';
import { PAYMENT_PROVIDER, PaymentProviderService } from '../payments/payment-provider.interface';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';

// Not behind JwtAuthGuard — Razorpay calls this directly, server to server.
// Signature verification (decision 0032 rule 3) IS the authentication.
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderVendorGroup) private readonly groupModel: typeof OrderVendorGroup,
    private readonly sequelize: Sequelize,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProviderService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  @Post('razorpay')
  async handleRazorpayWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    if (!this.paymentProvider.verifyWebhookSignature(rawBody, signature ?? '')) {
      throw new BadRequestException('invalid webhook signature');
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const providerOrderId = payload.payload?.payment?.entity?.order_id;

    if (!providerOrderId) {
      this.logger.warn(`webhook event ${eventType} had no order_id in payload — ignoring`);
      return { received: true };
    }

    const order = await this.orderModel.findOne({ where: { razorpayOrderId: providerOrderId } });
    if (!order) {
      this.logger.warn(`webhook referenced unknown razorpay_order_id ${providerOrderId}`);
      return { received: true };
    }

    // Idempotency: a replayed or duplicate webhook for an already-confirmed
    // or already-cancelled order must not double-decrement stock or
    // double-notify. Only a PENDING_PAYMENT order is actionable.
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      this.logger.log(`order ${order.id} already in status ${order.status} — ignoring replay`);
      return { received: true };
    }

    if (eventType === 'payment.captured') {
      const confirmedGroups = await this.confirmOrder(order);
      await this.notifications.sendOrderPlaced(order.customerId, order.id);
      // One notification per vendor group, to that group's vendor only —
      // this is how each vendor in a multi-vendor checkout finds out they
      // have an order. Fired AFTER the confirming transaction commits, not
      // inside it: a slow or failing notification must never roll back a
      // payment confirmation that has already happened.
      for (const group of confirmedGroups) {
        await this.notifications.sendNewOrderToVendor(group.vendorId, group.id);
      }
    } else if (eventType === 'payment.failed') {
      await this.releaseOrder(order);
    }

    return { received: true };
  }

  private async confirmOrder(order: Order): Promise<OrderVendorGroup[]> {
    return this.sequelize.transaction(async (t) => {
      const items = await this.sequelize.query<{ vendor_listing_id: string; quantity: string }>(
        `
        SELECT oi.vendor_listing_id, oi.quantity
        FROM order_items oi
        JOIN order_vendor_group ovg ON ovg.id = oi.order_vendor_group_id
        WHERE ovg.order_id = :orderId
        `,
        { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
      );

      // Converts reservation to a real decrement — the server-to-server
      // signal, never the client SDK (decision 0032 rule 3).
      for (const item of items) {
        await this.sequelize.query(
          `
          UPDATE inventory
          SET quantity_available = quantity_available - :qty,
              quantity_reserved = quantity_reserved - :qty
          WHERE vendor_listing_id = :listingId AND warehouse_id IS NULL
          `,
          {
            replacements: { listingId: item.vendor_listing_id, qty: item.quantity },
            type: QueryTypes.UPDATE,
            transaction: t,
          },
        );
      }

      order.status = OrderStatus.CONFIRMED;
      await order.save({ transaction: t });

      await this.groupModel.update(
        { status: OrderVendorGroupStatus.CONFIRMED },
        { where: { orderId: order.id }, transaction: t },
      );

      // Returned so the caller can notify each group's vendor OUTSIDE this
      // transaction.
      return this.groupModel.findAll({ where: { orderId: order.id }, transaction: t });
    });
  }

  private async releaseOrder(order: Order): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      const items = await this.sequelize.query<{ vendor_listing_id: string; quantity: string }>(
        `
        SELECT oi.vendor_listing_id, oi.quantity
        FROM order_items oi
        JOIN order_vendor_group ovg ON ovg.id = oi.order_vendor_group_id
        WHERE ovg.order_id = :orderId
        `,
        { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
      );

      // Release only — quantity_available is untouched, since the stock
      // was never actually sold.
      for (const item of items) {
        await this.sequelize.query(
          `
          UPDATE inventory
          SET quantity_reserved = quantity_reserved - :qty
          WHERE vendor_listing_id = :listingId AND warehouse_id IS NULL
          `,
          {
            replacements: { listingId: item.vendor_listing_id, qty: item.quantity },
            type: QueryTypes.UPDATE,
            transaction: t,
          },
        );
      }

      order.status = OrderStatus.CANCELLED;
      await order.save({ transaction: t });

      await this.groupModel.update(
        { status: OrderVendorGroupStatus.CANCELLED },
        { where: { orderId: order.id }, transaction: t },
      );
    });
  }
}
