import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { Order, OrderStatus } from './models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from './models/order-vendor-group.model';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import {
  PAYMENT_PROVIDER,
  PaymentProviderService,
  ProviderPayment,
} from '../payments/payment-provider.interface';
import { toPaise } from '../payments/money';

export type CaptureOutcome = 'confirmed' | 'already_confirmed' | 'refund_required' | 'ignored';

export type ProviderCheck =
  | { kind: 'none' }
  | { kind: 'in_flight' }
  | { kind: 'captured'; payment: ProviderPayment }
  | { kind: 'unavailable' };

// Decision 0054 rules 2-4. Every path that learns of a captured payment (the
// webhook now; the sweep and both cancel paths via checkProviderPayments)
// confirms the order only through applyCapture, and a capture that cannot
// confirm its order always ends in refund_required rather than a log line.
@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderVendorGroup) private readonly groupModel: typeof OrderVendorGroup,
    private readonly sequelize: Sequelize,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProviderService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  async applyCapture(order: Order, payment: ProviderPayment): Promise<CaptureOutcome> {
    const matches =
      payment.status === 'captured' &&
      payment.orderId === order.razorpayOrderId &&
      payment.currency === 'INR' &&
      payment.amountPaise === toPaise(order.grandTotal);

    if (!matches) {
      this.logger.error(
        `order ${order.id}: payment ${payment.id} (${payment.status}, order ${payment.orderId}, ${payment.amountPaise} ${payment.currency}) does not match order (${order.razorpayOrderId}, ${toPaise(order.grandTotal)} INR) — refund required`,
      );
      if (order.status === OrderStatus.PENDING_PAYMENT) {
        // The money is not for this order's price, so the stock hold must go
        // too; markRefundRequired only applies to a cancelled order.
        await this.releaseAndCancel(order.id);
      }
      return this.refundRequired(order, payment.id);
    }

    const confirmedGroups = await this.confirmOrder(order.id, payment.id);
    if (confirmedGroups) {
      await this.notifyConfirmed(order, confirmedGroups);
      return 'confirmed';
    }

    // The guarded UPDATE did not apply, so look at where the order is now.
    const current = await this.orderModel.findByPk(order.id);
    if (current?.status === OrderStatus.CANCELLED) {
      return this.refundRequired(current, payment.id);
    }
    if (current?.status === OrderStatus.CONFIRMED && current.razorpayPaymentId === payment.id) {
      return 'already_confirmed';
    }
    this.logger.warn(
      `order ${order.id}: capture ${payment.id} did not apply (order is ${current?.status ?? 'missing'}, payment ${current?.razorpayPaymentId ?? 'none'})`,
    );
    return 'ignored';
  }

  // Decision 0054 rule 3: the question every cancel path asks Razorpay before
  // cancelling a pending order.
  async checkProviderPayments(order: Order): Promise<ProviderCheck> {
    if (!order.razorpayOrderId) {
      return { kind: 'none' };
    }
    let payments;
    try {
      payments = await this.paymentProvider.fetchOrderPayments(order.razorpayOrderId);
    } catch (err) {
      this.logger.warn(
        `order ${order.id}: could not fetch payments from Razorpay: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { kind: 'unavailable' };
    }
    const captured = payments.find((p) => p.status === 'captured');
    if (captured) {
      return { kind: 'captured', payment: captured };
    }
    if (payments.some((p) => p.status === 'created' || p.status === 'authorized')) {
      return { kind: 'in_flight' };
    }
    return { kind: 'none' };
  }

  // Decision 0049. Extracted from cancel()'s own transaction body —
  // guarded status UPDATE, inventory reservation release, vendor-group
  // cancellation — so the stale-reservation sweep reuses the exact same
  // release logic rather than a second, possibly-drifting copy. Returns
  // false if the order was not actually PENDING_PAYMENT at the moment of
  // the guarded UPDATE (lost a race, or was already cancelled/confirmed).
  async releaseAndCancel(orderId: string): Promise<boolean> {
    return this.sequelize.transaction(async (t) => {
      // Sequelize's QueryTypes.UPDATE return shape for Postgres is
      // [results, affectedRowCount] — results is always an empty array,
      // the count is the SECOND element. Verified empirically (not
      // assumed): a prior version of this destructured [updatedCount]
      // (the first element, always []), so `updatedCount === 0` was
      // always false and this guard never actually fired — found while
      // verifying the fix-pass's own fixes, not by reading docs.
      const [, updatedCount] = await this.sequelize.query(
        `UPDATE orders SET status = :cancelled WHERE id = :orderId AND status = :pending`,
        {
          replacements: {
            orderId,
            cancelled: OrderStatus.CANCELLED,
            pending: OrderStatus.PENDING_PAYMENT,
          },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );
      if (updatedCount === 0) {
        return false;
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
      for (const item of items) {
        // Floored at 0 (decision 0054): confirm already clamps, so a
        // reservation can be smaller than the order's quantity, and a
        // negative quantity_reserved would trip the table's CHECK and roll
        // the whole cancellation back.
        await this.sequelize.query(
          `
          UPDATE inventory
          SET quantity_reserved = GREATEST(quantity_reserved - :qty, 0)
          WHERE vendor_listing_id = :listingId AND warehouse_id IS NULL
          `,
          {
            replacements: { listingId: item.vendor_listing_id, qty: item.quantity },
            type: QueryTypes.UPDATE,
            transaction: t,
          },
        );
      }
      // WHERE also pins status: PENDING, defensively — the UPDATE ...
      // WHERE status = 'pending_payment' above already guarantees no
      // vendor could have advanced any group's status (updateVendorGroupStatus
      // excludes pending_payment orders entirely as of the final review's
      // finding #8 fix), but costs nothing to assert here too rather than
      // rely solely on a invariant enforced three files away.
      await this.groupModel.update(
        { status: OrderVendorGroupStatus.CANCELLED },
        {
          where: { orderId, status: OrderVendorGroupStatus.PENDING },
          transaction: t,
        },
      );
      return true;
    });
  }

  // Decision 0054 rule 4. Guarded on status and an empty payment id: a
  // cancelled order that already carries a payment id has had its money
  // accounted for, and must not be overwritten by a different payment's id.
  async markRefundRequired(orderId: string, paymentId: string): Promise<boolean> {
    const [, updatedCount] = await this.sequelize.query(
      `UPDATE orders SET status = :refundRequired, razorpay_payment_id = :paymentId
       WHERE id = :orderId AND status = :cancelled AND razorpay_payment_id IS NULL`,
      {
        replacements: {
          orderId,
          paymentId,
          refundRequired: OrderStatus.REFUND_REQUIRED,
          cancelled: OrderStatus.CANCELLED,
        },
        type: QueryTypes.UPDATE,
      },
    );
    return updatedCount > 0;
  }

  private async refundRequired(order: Order, paymentId: string): Promise<CaptureOutcome> {
    const marked = await this.markRefundRequired(order.id, paymentId);
    if (!marked) {
      // Not cancelled, or it already records another payment: nothing here
      // can safely attach this payment to the order, so someone must look.
      this.logger.error(
        `order ${order.id}: payment ${paymentId} needs a refund but the order could not be marked refund_required — reconcile manually`,
      );
      return 'ignored';
    }
    try {
      await this.notifications.sendOrderStatusChanged(
        order.customerId,
        order.id,
        OrderStatus.REFUND_REQUIRED,
      );
    } catch (err) {
      this.logger.error(
        `order ${order.id}: refund_required notification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return 'refund_required';
  }

  // Fired AFTER the confirming transaction commits, not inside it: a slow or
  // failing notification must never roll back a payment confirmation that has
  // already happened (decision 0054 rule 7). Each send is isolated so one
  // failure doesn't stop the rest.
  private async notifyConfirmed(order: Order, groups: OrderVendorGroup[]): Promise<void> {
    const attempt = async (what: string, send: () => Promise<void>) => {
      try {
        await send();
      } catch (err) {
        this.logger.error(
          `order ${order.id}: ${what} notification failed after confirmation: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    };
    await attempt('order placed', () =>
      this.notifications.sendOrderPlaced(order.customerId, order.id),
    );
    // One notification per vendor group, to that group's vendor only —
    // this is how each vendor in a multi-vendor checkout finds out they
    // have an order.
    for (const group of groups) {
      await attempt(`vendor group ${group.id}`, () =>
        this.notifications.sendNewOrderToVendor(group.vendorId, group.id),
      );
    }
  }

  // Returns the confirmed groups, or null if the transition did not apply
  // (order was not pending_payment when the UPDATE ran). The WHERE clause
  // on the UPDATE is the only guard — no separate read-then-check, so two
  // concurrent calls cannot both pass a check that is stale by the time
  // either writes (final review finding #6).
  private async confirmOrder(
    orderId: string,
    providerPaymentId: string,
  ): Promise<OrderVendorGroup[] | null> {
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
        `UPDATE orders SET status = :confirmed, razorpay_payment_id = :paymentId WHERE id = :orderId AND status = :pending`,
        {
          replacements: {
            orderId,
            confirmed: OrderStatus.CONFIRMED,
            pending: OrderStatus.PENDING_PAYMENT,
            paymentId: providerPaymentId,
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
      // signal, never the client SDK (decision 0041 rule 3).
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
