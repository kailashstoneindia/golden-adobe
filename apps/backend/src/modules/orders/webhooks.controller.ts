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

    if (eventType === 'payment.captured') {
      const confirmedGroups = await this.confirmOrder(order.id);
      if (confirmedGroups === null) {
        // Final review finding #6: the old code read order.status here,
        // outside any lock, then wrote unconditionally — two concurrent
        // webhook deliveries for the same event (Razorpay documents
        // duplicate delivery as possible) could both pass that check and
        // both decrement stock. confirmOrder's own UPDATE ... WHERE
        // status = 'pending_payment' is now the only gate, and a null
        // result means it did not apply — either already confirmed (a
        // genuine replay, safe to ignore) or already cancelled (see the
        // comment on confirmOrder for why a capture can still legitimately
        // arrive there).
        this.logger.log(`order ${order.id}: capture webhook did not apply (not pending_payment)`);
        return { received: true };
      }
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
      // Final review finding #1: this used to call releaseOrder, which
      // CANCELLED the order outright. Razorpay's own documented behaviour
      // is that an order stays open and payable after a failed attempt —
      // UPI retries after a wrong PIN or an insufficient-balance failure
      // are the expected, common case, not an edge case. Cancelling here
      // meant a customer's successful retry on the SAME razorpay_order_id
      // then arrived as a "capture on a non-pending order" and was
      // silently dropped as a replay: money captured, order cancelled,
      // stock released and resold to someone else, nobody told.
      //
      // The correct behaviour is to do nothing to the order or the
      // reservation on a failed attempt — leave it pending-payment, able
      // to accept a retry's eventual capture. This reintroduces decision
      // 0032's own open question ("how long a reservation may be held
      // before it is swept") as now REACHABLE rather than hypothetical;
      // recorded as such in decision 0032 rather than silently left as a
      // TODO (see docs/decisions/0032-cart-owner-reservation-and-real-instock.md).
      this.logger.log(
        `order ${order.id}: payment.failed received — leaving pending_payment for a possible retry, no reservation change`,
      );
    }

    return { received: true };
  }

  // Returns the confirmed groups, or null if the transition did not apply
  // (order was not pending_payment when the UPDATE ran). The WHERE clause
  // on the UPDATE is the only guard — no separate read-then-check, so two
  // concurrent calls cannot both pass a check that is stale by the time
  // either writes (final review finding #6).
  private async confirmOrder(orderId: string): Promise<OrderVendorGroup[] | null> {
    return this.sequelize.transaction(async (t) => {
      // Sequelize's QueryTypes.UPDATE return shape for Postgres is
      // [results, affectedRowCount] — results is always an empty array,
      // the count is the SECOND element. Verified empirically (not
      // assumed): the first version of this destructured [updatedCount]
      // (the first element, always []), so `updatedCount === 0` never
      // fired and payment.captured decremented stock on EVERY call, not
      // just the first — caught by re-sending the same webhook sequence
      // twice during the fix pass's own verification and seeing inventory
      // drop a second time.
      const [, updatedCount] = await this.sequelize.query(
        `UPDATE orders SET status = :confirmed WHERE id = :orderId AND status = :pending`,
        {
          replacements: {
            orderId,
            confirmed: OrderStatus.CONFIRMED,
            pending: OrderStatus.PENDING_PAYMENT,
          },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );
      if (updatedCount === 0) {
        return null;
      }

      const items = await this.sequelize.query<{ vendor_listing_id: string; quantity: string }>(
        `
        SELECT oi.vendor_listing_id, oi.quantity
        FROM order_items oi
        JOIN order_vendor_group ovg ON ovg.id = oi.order_vendor_group_id
        WHERE ovg.order_id = :orderId
        `,
        { replacements: { orderId }, type: QueryTypes.SELECT, transaction: t },
      );

      // Converts reservation to a real decrement — the server-to-server
      // signal, never the client SDK (decision 0032 rule 3).
      //
      // Final review finding #2: StockService.setStock/bulkSetStock (the
      // vendor's own stock-write path, outside this plan's scope — a
      // different file than any of this plan's 8 tasks touched) can set
      // quantity_available below what is already reserved; nothing in
      // that service validates against outstanding reservations. Without
      // the clamp below, a vendor shelf-counting stock downward after a
      // checkout reserved against the old number would make this
      // decrement go negative, trip `CHECK (quantity_available >= 0)`,
      // and roll back the whole transaction — permanently, since this
      // same code re-runs on every Razorpay retry and fails the same way
      // every time, leaving a CAPTURED payment stuck on a pending_payment
      // order forever.
      //
      // GREATEST(..., 0) clamps the floor so the payment confirmation
      // always succeeds — correctly recording the real, if negative-going,
      // demand against stock rather than crashing on it — and the
      // mismatch is logged loudly for someone to reconcile, rather than
      // silently absorbed. The proper fix is still StockService itself
      // rejecting or clamping a write that would undercut a live
      // reservation; this is the payment-side half of that, since a
      // captured payment must never be left unconfirmable regardless of
      // what the catalog side allowed.
      for (const item of items) {
        const updatedRows = await this.sequelize.query<{ quantity_available: string }>(
          `
          UPDATE inventory
          SET quantity_available = GREATEST(quantity_available - :qty, 0),
              quantity_reserved = GREATEST(quantity_reserved - :qty, 0)
          WHERE vendor_listing_id = :listingId AND warehouse_id IS NULL
          RETURNING quantity_available
          `,
          {
            replacements: { listingId: item.vendor_listing_id, qty: item.quantity },
            type: QueryTypes.SELECT,
            transaction: t,
          },
        );
        const row = updatedRows[0];
        if (row && Number(row.quantity_available) === 0) {
          // Not proof of a shortfall by itself (legitimately selling the
          // last unit also lands here), but worth a loud log either way —
          // cheap, and the alternative (silence) is how #2 went
          // unnoticed in the first place.
          this.logger.warn(
            `order ${orderId}: inventory for listing ${item.vendor_listing_id} clamped to 0 on confirm — verify this wasn't a reservation/stock-write conflict (final review finding #2)`,
          );
        }
      }

      // WHERE also pins status: PENDING, defensively — see the matching
      // comment in OrdersService.cancel for why this invariant already
      // holds, and why it's asserted here anyway rather than relied on
      // solely from this file.
      await this.groupModel.update(
        { status: OrderVendorGroupStatus.CONFIRMED },
        { where: { orderId, status: OrderVendorGroupStatus.PENDING }, transaction: t },
      );

      // Returned so the caller can notify each group's vendor OUTSIDE this
      // transaction.
      return this.groupModel.findAll({ where: { orderId }, transaction: t });
    });
  }
}
