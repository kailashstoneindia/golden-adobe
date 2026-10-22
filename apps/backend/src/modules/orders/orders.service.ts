import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes } from 'sequelize';
import type { OrderDto, OrderVendorGroupDto, PaymentEventDto } from '@golden-abode/types';
import { Order, OrderStatus } from './models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from './models/order-vendor-group.model';
import { PaymentEvent } from './models/payment-event.model';
import { CustomersService } from '../customers/customers.service';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import { PAYMENT_PROVIDER, PaymentProviderService } from '../payments/payment-provider.interface';
import {
  ADMIN_ORDER_DISPLAY_INCLUDE,
  ORDER_GROUP_DISPLAY_INCLUDE,
  customerOrderInclude,
  vendorGroupInclude,
} from './order-display.include';
import { toOrderDto, toOrderVendorGroupDto, toPaymentEventDto } from './order-display.mapper';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderVendorGroup) private readonly groupModel: typeof OrderVendorGroup,
    @InjectModel(PaymentEvent) private readonly paymentEventModel: typeof PaymentEvent,
    private readonly sequelize: Sequelize,
    private readonly customersService: CustomersService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProviderService,
  ) {}

  async listForCustomer(userId: string): Promise<OrderDto[]> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const orders = await this.orderModel.findAll({
      where: { customerId: customer.id },
      include: customerOrderInclude(false),
      order: [['createdAt', 'DESC']],
    });
    return orders.map((order) => toOrderDto(order, false));
  }

  async getForCustomer(userId: string, orderId: string): Promise<OrderDto> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const order = await this.orderModel.findOne({
      where: { id: orderId, customerId: customer.id },
      include: customerOrderInclude(true),
    });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    return toOrderDto(order, true);
  }

  // Cancellation authorization (who, until when) is an explicit open
  // question in decision 0042 — this allocates the simplest rule that does
  // not foreclose a stricter one later: a customer may cancel their own
  // order only while it is still PENDING_PAYMENT (i.e. before the webhook
  // has confirmed payment). Once CONFIRMED, cancellation is not exposed to
  // the customer here — full post-confirmation cancellation semantics are
  // decision 0042's own named "likely next ADR," not settled here.
  async cancel(userId: string, orderId: string): Promise<OrderDto> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const order = await this.orderModel.findOne({
      where: { id: orderId, customerId: customer.id },
    });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    // This read is advisory only, for a fast 400 in the common case — the
    // real guard is the UPDATE ... WHERE status = 'pending_payment' inside
    // the transaction below. Final review finding #6: the old code read
    // order.status here, outside any lock, then wrote unconditionally —
    // this same order's status could change between this read and that
    // write (a webhook capturing it concurrently), and the old code would
    // still cancel a now-confirmed order.
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`order cannot be cancelled from status ${order.status}`);
    }

    const cancelled = await this.sequelize.transaction(async (t) => {
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
            orderId: order.id,
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
        { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
      );
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
      // WHERE also pins status: PENDING, defensively — the UPDATE ...
      // WHERE status = 'pending_payment' above already guarantees no
      // vendor could have advanced any group's status (updateVendorGroupStatus
      // excludes pending_payment orders entirely as of the final review's
      // finding #8 fix), but costs nothing to assert here too rather than
      // rely solely on a invariant enforced three files away.
      await this.groupModel.update(
        { status: OrderVendorGroupStatus.CANCELLED },
        {
          where: { orderId: order.id, status: OrderVendorGroupStatus.PENDING },
          transaction: t,
        },
      );
      return true;
    });

    if (!cancelled) {
      // Lost a race against a concurrent transition (e.g. the webhook
      // just confirmed it) between the advisory read above and the
      // transaction's own guarded UPDATE.
      throw new BadRequestException('order could not be cancelled — its status just changed');
    }

    order.status = OrderStatus.CANCELLED;
    await this.notifications.sendOrderStatusChanged(customer.id, order.id, OrderStatus.CANCELLED);
    return this.getForCustomer(userId, orderId);
  }

  // The read half of the vendor order surface. Without this, a vendor has
  // no way to discover an order_vendor_group's id at all — the webhook's
  // sendNewOrderToVendor call is a notification, best-effort (log-only
  // until Firebase exists, and never guaranteed delivery even then). This
  // list is the vendor's reliable source of truth, independent of whether
  // any notification arrived.
  //
  // Final review finding #8: this used to list every group regardless of
  // the PARENT order's status, so a vendor could see — and the sibling
  // method below let them act on — a group whose payment was never
  // confirmed. Scoped to confirmed-or-later orders only; an unpaid
  // checkout's groups are invisible to the vendor until the webhook
  // confirms payment, matching the "how does a vendor find out they have
  // an order" answer this surface exists for: that answer is "once it's a
  // real, paid order," not "the moment a customer's cart becomes a
  // reservation."
  async listForVendor(vendorId: string): Promise<OrderVendorGroupDto[]> {
    const groups = await this.groupModel.findAll({
      where: { vendorId },
      include: vendorGroupInclude({ status: { [Op.ne]: OrderStatus.PENDING_PAYMENT } }),
      order: [['createdAt', 'DESC']],
    });
    return groups.map(toOrderVendorGroupDto);
  }

  async getForVendor(vendorId: string, groupId: string): Promise<OrderVendorGroupDto> {
    const group = await this.groupModel.findOne({
      where: { id: groupId, vendorId },
      include: vendorGroupInclude({ status: { [Op.ne]: OrderStatus.PENDING_PAYMENT } }),
    });
    if (!group) {
      throw new NotFoundException('order group not found');
    }
    return toOrderVendorGroupDto(group);
  }

  async updateVendorGroupStatus(
    vendorId: string,
    groupId: string,
    status: OrderVendorGroupStatus,
  ): Promise<OrderVendorGroupDto> {
    const group = await this.groupModel.findOne({
      where: { id: groupId, vendorId },
      include: [
        {
          model: Order,
          attributes: ['status'],
          where: { status: { [Op.ne]: OrderStatus.PENDING_PAYMENT } },
        },
      ],
    });
    if (!group) {
      // Same 404 whether the group belongs to another vendor, doesn't
      // exist, or its order is still unpaid — a vendor gets no signal
      // that an order "exists but isn't theirs to act on yet" either way,
      // matching the ownership-check convention used everywhere else.
      throw new NotFoundException('order group not found');
    }
    // Final-review fix (post-implementation, finding #4): REFUNDED is a
    // status this plan introduced, and the Order join above only excludes
    // PENDING_PAYMENT — REFUNDED satisfies "!= pending_payment" too.
    // adminRefund never touches order_vendor_group rows, so a group can
    // sit at CONFIRMED or SHIPPED while its parent order is REFUNDED (or,
    // separately, CANCELLED by adminCancel after a refund). Without this
    // guard a vendor could still ship or deliver goods for an order that
    // was already refunded or cancelled.
    if (
      group.order.status === OrderStatus.REFUNDED ||
      group.order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'order has been refunded or cancelled and its groups can no longer be updated',
      );
    }
    // Valid forward transitions only — a vendor cannot jump PENDING
    // straight to DELIVERED, and cannot move a CANCELLED group anywhere.
    // PENDING itself is now unreachable here (the Order join above
    // excludes pending_payment orders, and confirmOrder sets every group
    // to CONFIRMED in the same transaction that confirms the order), but
    // the table keeps the entry for defensiveness rather than assuming
    // that invariant holds forever.
    const validNextStatuses: Record<OrderVendorGroupStatus, OrderVendorGroupStatus[]> = {
      [OrderVendorGroupStatus.PENDING]: [
        OrderVendorGroupStatus.CONFIRMED,
        OrderVendorGroupStatus.CANCELLED,
      ],
      [OrderVendorGroupStatus.CONFIRMED]: [
        OrderVendorGroupStatus.SHIPPED,
        OrderVendorGroupStatus.CANCELLED,
      ],
      [OrderVendorGroupStatus.SHIPPED]: [OrderVendorGroupStatus.DELIVERED],
      [OrderVendorGroupStatus.DELIVERED]: [],
      [OrderVendorGroupStatus.CANCELLED]: [],
    };
    if (!validNextStatuses[group.status].includes(status)) {
      throw new BadRequestException(
        `cannot transition order group from ${group.status} to ${status}`,
      );
    }
    group.status = status;
    await group.save();

    const order = await this.orderModel.findByPk(group.orderId);
    if (order) {
      await this.notifications.sendOrderStatusChanged(order.customerId, order.id, status);
    }
    return this.getForVendor(vendorId, groupId);
  }

  async listForAdmin(): Promise<OrderDto[]> {
    const orders = await this.orderModel.findAll({
      include: ADMIN_ORDER_DISPLAY_INCLUDE,
      order: [['createdAt', 'DESC']],
    });
    return orders.map((order) => toOrderDto(order, true));
  }

  async getForAdmin(orderId: string): Promise<OrderDto> {
    const order = await this.orderModel.findByPk(orderId, {
      include: ADMIN_ORDER_DISPLAY_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    return toOrderDto(order, true);
  }

  // Full refund only — partial per-line refunds are named as an open
  // question in decision 0034 and not built here. Only a CONFIRMED order
  // has a captured payment to refund; PENDING_PAYMENT was never charged,
  // CANCELLED/REFUNDED already resolved one way or the other. Guarding on
  // both status AND the presence of razorpayPaymentId catches an order
  // that reached CONFIRMED through some future code path that forgot to
  // persist the payment id — fail loudly rather than refund nothing while
  // reporting success.
  // Final-review fix (post-implementation, finding #3): the original
  // version checked status with a plain findByPk, called Razorpay, then
  // order.save() — none of it guarded, so two concurrent calls could both
  // pass the check and both call Razorpay, and a failure between the
  // Razorpay call succeeding and the save committing left the order stuck
  // CONFIRMED forever with the money already gone (retrying hits
  // Razorpay's "already refunded" error; adminCancel refuses CONFIRMED).
  //
  // Fixed with the same claim-before-call-out pattern CheckoutService uses
  // for its own Razorpay call (Phase 2): the status transition to REFUNDED
  // is claimed with a guarded UPDATE FIRST, inside the only statement that
  // can race, before any network call. If Razorpay's refund then fails,
  // the claim is reverted so the order is still refundable on retry rather
  // than stuck in a state no other code path can move it out of.
  async adminRefund(orderId: string): Promise<OrderDto> {
    const order = await this.orderModel.findByPk(orderId);
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (order.status !== OrderStatus.CONFIRMED || !order.razorpayPaymentId) {
      throw new BadRequestException('order has no captured payment to refund');
    }

    const [, claimedCount] = await this.sequelize.query(
      `UPDATE orders SET status = :refunded WHERE id = :orderId AND status = :confirmed AND razorpay_payment_id = :paymentId`,
      {
        replacements: {
          orderId: order.id,
          refunded: OrderStatus.REFUNDED,
          confirmed: OrderStatus.CONFIRMED,
          paymentId: order.razorpayPaymentId,
        },
        type: QueryTypes.UPDATE,
      },
    );
    if (claimedCount === 0) {
      throw new BadRequestException('order could not be refunded — its status just changed');
    }

    const amountPaise = Math.round(Number(order.grandTotal) * 100);
    try {
      await this.paymentProvider.refundPayment(order.razorpayPaymentId, amountPaise);
    } catch (err) {
      await this.sequelize.query(
        `UPDATE orders SET status = :confirmed WHERE id = :orderId AND status = :refunded`,
        {
          replacements: {
            orderId: order.id,
            confirmed: OrderStatus.CONFIRMED,
            refunded: OrderStatus.REFUNDED,
          },
          type: QueryTypes.UPDATE,
        },
      );
      throw err;
    }

    order.status = OrderStatus.REFUNDED;
    await this.notifications.sendOrderStatusChanged(
      order.customerId,
      order.id,
      OrderStatus.REFUNDED,
    );
    return this.getForAdmin(orderId);
  }

  // Admin may cancel from pending_payment (nothing was ever charged — same
  // as the customer-facing path) or from refunded (the money is already
  // back with the customer, so cancelling now is just bookkeeping). A
  // confirmed order must be refunded FIRST via adminRefund — cancelling a
  // captured payment without refunding it would release the customer's
  // reserved stock while keeping their money, which is strictly worse
  // than doing nothing.
  //
  // Final-review fix (post-implementation): the guarded UPDATE below must
  // name exactly {pending_payment, refunded} rather than "!= cancelled" —
  // the latter also matches 'confirmed', so a webhook confirming the order
  // between the advisory check above and this transaction's UPDATE used to
  // let a paid order be silently cancelled with no refund path back
  // (adminRefund only accepts CONFIRMED). Naming the exact source statuses
  // closes that race the same way the customer-facing cancel's
  // WHERE status = 'pending_payment' does (final review finding #6 on the
  // original branch).
  //
  // Inventory release only runs when the row's locked, current status is
  // pending_payment. A refunded order was CONFIRMED before the refund, and
  // confirmOrder (webhooks.controller.ts) already decremented BOTH
  // quantity_available and quantity_reserved at that point — the
  // reservation this order held no longer exists. Releasing it again here
  // would subtract from whatever OTHER order's reservation now occupies
  // that quantity on the same listing, enabling an oversell.
  //
  // SELECT ... FOR UPDATE locks the row and reads its real status inside
  // the transaction before anything else happens, closing the same race
  // finding #6 (original branch) and finding #2 (this fix pass) both
  // named: the advisory check above reads order.status with no lock at
  // all, so a concurrent webhook confirming the order between that read
  // and this transaction starting must still be caught — which only a
  // lock taken inside the transaction can do.
  async adminCancel(orderId: string): Promise<OrderDto> {
    const order = await this.orderModel.findByPk(orderId);
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (order.status === OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        'a confirmed order must be refunded before it can be cancelled',
      );
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('order is already cancelled');
    }

    const cancelled = await this.sequelize.transaction(async (t) => {
      const lockedRows = await this.sequelize.query<{ status: string }>(
        `SELECT status FROM orders WHERE id = :orderId FOR UPDATE`,
        { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
      );
      const lockedStatus = lockedRows[0]?.status;
      if (lockedStatus !== OrderStatus.PENDING_PAYMENT && lockedStatus !== OrderStatus.REFUNDED) {
        return false;
      }

      const [, updatedCount] = await this.sequelize.query(
        `UPDATE orders SET status = :cancelled WHERE id = :orderId`,
        {
          replacements: { orderId: order.id, cancelled: OrderStatus.CANCELLED },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );
      if (updatedCount === 0) {
        return false;
      }

      const wasPendingPayment = lockedStatus === OrderStatus.PENDING_PAYMENT;
      if (wasPendingPayment) {
        const items = await this.sequelize.query<{ vendor_listing_id: string; quantity: string }>(
          `
          SELECT oi.vendor_listing_id, oi.quantity
          FROM order_items oi
          JOIN order_vendor_group ovg ON ovg.id = oi.order_vendor_group_id
          WHERE ovg.order_id = :orderId
          `,
          { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
        );
        for (const item of items) {
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
      }

      await this.groupModel.update(
        { status: OrderVendorGroupStatus.CANCELLED },
        {
          where: {
            orderId: order.id,
            status: { [Op.ne]: OrderVendorGroupStatus.CANCELLED },
          },
          transaction: t,
        },
      );
      return true;
    });

    if (!cancelled) {
      throw new BadRequestException('order could not be cancelled — its status just changed');
    }

    order.status = OrderStatus.CANCELLED;
    await this.notifications.sendOrderStatusChanged(
      order.customerId,
      order.id,
      OrderStatus.CANCELLED,
    );
    return this.getForAdmin(orderId);
  }

  async getPaymentEvents(orderId: string): Promise<PaymentEventDto[]> {
    const order = await this.orderModel.findByPk(orderId);
    if (!order) {
      throw new NotFoundException('order not found');
    }
    const events = await this.paymentEventModel.findAll({
      where: { orderId },
      order: [['createdAt', 'ASC']],
    });
    return events.map(toPaymentEventDto);
  }

  // Deliberately bypasses the forward-only validNextStatuses table that
  // guards the vendor-facing updateVendorGroupStatus above — an admin
  // override exists specifically for the case where the normal transition
  // rule is blocking a legitimate correction (a vendor who went dark, a
  // status set in error). The bypass is never silent: reason is required
  // and logged, so there is always a human-readable trail for why a group
  // ended up somewhere the normal state machine would have refused.
  async adminOverrideVendorGroupStatus(
    groupId: string,
    status: OrderVendorGroupStatus,
    reason: string,
  ): Promise<OrderVendorGroupDto> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('a reason is required for an admin status override');
    }
    const group = await this.groupModel.findByPk(groupId);
    if (!group) {
      throw new NotFoundException('order group not found');
    }

    // Final-review fix (post-implementation, finding #5): the override
    // never checked the parent order's status at all, so it could bring a
    // group back to CONFIRMED/SHIPPED/DELIVERED under an order that was
    // already REFUNDED or CANCELLED — exactly the state the vendor-facing
    // guard above (finding #4's fix) now refuses. CANCELLED is the one
    // exception: setting a group to CANCELLED under a refunded/cancelled
    // order is cleanup in the safe direction, not a resurrection of a
    // dead order, so it is still allowed.
    const order = await this.orderModel.findByPk(group.orderId);
    const parentIsClosed =
      order?.status === OrderStatus.REFUNDED || order?.status === OrderStatus.CANCELLED;
    if (parentIsClosed && status !== OrderVendorGroupStatus.CANCELLED) {
      throw new BadRequestException(
        'cannot override a group whose parent order is refunded or cancelled',
      );
    }

    this.logger.warn(
      `admin override: order_vendor_group ${groupId} forced from ${group.status} to ${status} — reason: ${reason}`,
    );
    group.status = status;
    await group.save();

    if (order) {
      await this.notifications.sendOrderStatusChanged(order.customerId, order.id, status);
    }
    const reloaded = await this.groupModel.findByPk(groupId, {
      include: ORDER_GROUP_DISPLAY_INCLUDE,
    });
    return toOrderVendorGroupDto(reloaded!);
  }
}
