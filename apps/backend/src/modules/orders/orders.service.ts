import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes } from 'sequelize';
import type {
  AdminOrderDto,
  ArtisanOrderDto,
  OrderDto,
  OrderVendorGroupDto,
  PaymentEventDto,
} from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { Order, OrderStatus } from './models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from './models/order-vendor-group.model';
import { PaymentEvent } from './models/payment-event.model';
import { CustomersService } from '../customers/customers.service';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import { OrderPaymentService } from './order-payment.service';
import { LOCKED_PARENT_ORDER_STATUSES } from './refund-status';
import {
  PAYMENT_CAPTURE_WINDOW_MINUTES,
  ProviderPayment,
} from '../payments/payment-provider.interface';
import { Artisan } from '../artisans/models/artisan.model';
import { ArtisanHireRequest } from '../artisans/models/artisan-hire-request.model';
import {
  ADMIN_ORDER_DISPLAY_INCLUDE,
  ORDER_GROUP_DISPLAY_INCLUDE,
  customerOrderInclude,
  vendorGroupInclude,
} from './order-display.include';
import {
  toArtisanOrderDto,
  toOrderDto,
  toOrderVendorGroupDto,
  toPaymentEventDto,
} from './order-display.mapper';
import { toAdminOrderDto } from './admin-order.mapper';

// Decision 0049. Slightly above the typical 5-15 minute industry range
// for a checkout hold, since payment.failed's own handling already
// treats a UPI-retry-after-wrong-PIN as the expected case for this
// checkout, not an edge case — a customer retrying needs more headroom
// than a single-swipe card checkout does. Decision 0054: the same constant
// is Razorpay's capture window, so a payment authorised after the sweep has
// given up is auto-refunded by Razorpay instead of captured.
const STALE_RESERVATION_TIMEOUT_MS = PAYMENT_CAPTURE_WINDOW_MINUTES * 60_000;

const GROUP_LOCKED_MESSAGE =
  'order is refunded, being refunded or cancelled, and its groups can no longer be updated';
const IN_FLIGHT_PAYMENT_MESSAGE =
  'A payment is in progress for this order. Try again in a few minutes.';
const PAYMENT_STATUS_UNVERIFIED_MESSAGE = 'Could not verify payment status. Try again shortly.';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderVendorGroup) private readonly groupModel: typeof OrderVendorGroup,
    @InjectModel(PaymentEvent) private readonly paymentEventModel: typeof PaymentEvent,
    @InjectModel(Artisan) private readonly artisanModel: typeof Artisan,
    @InjectModel(ArtisanHireRequest) private readonly hireRequestModel: typeof ArtisanHireRequest,
    private readonly sequelize: Sequelize,
    private readonly customersService: CustomersService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
    private readonly configService: ConfigService,
    private readonly orderPayment: OrderPaymentService,
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

  // Closes the "artisan can't open a linked order" gap: an artisan sees
  // an order's id via listAttributedOrders (hire-requests.service.ts),
  // but had no detail endpoint that would let them in — getForCustomer is
  // unconditionally scoped to a Customer row, which an artisan caller has
  // none of. Role branches here rather than splitting into two methods:
  // both paths converge on the identical "find one order, 404 if not
  // owned, map to DTO" shape, just with a different ownership test, and
  // callers (the controller) only know "the caller's own role", not which
  // branch to pick themselves.
  async getForOwner(
    userId: string,
    role: string,
    orderId: string,
  ): Promise<OrderDto | ArtisanOrderDto> {
    if (role === Role.ARTISAN) {
      return this.getForArtisan(userId, orderId);
    }
    return this.getForCustomer(userId, orderId);
  }

  // An artisan may view an order only if it is attributed (via
  // Order.bookingId, decision 0045) to one of their own hire requests —
  // never by customerId, which an artisan has none of. 404, not 403, for
  // every failure mode (no artisan profile, order not found, order not
  // attributed to any hire request, or attributed to someone else's) —
  // same "don't distinguish doesn't-exist from not-yours" reasoning
  // ArtisansService.getPublicProfile and HireRequestsService.cancel's
  // own ownership checks already use elsewhere in this codebase.
  //
  // Returns ArtisanOrderDto, not OrderDto — deliberately a different,
  // narrower shape (decision 0052 addendum, after code review flagged the
  // original implementation leaking the customer's customerId, precise
  // delivery GPS, and razorpay payment fields to the artisan by reusing
  // toOrderDto unmodified). An artisan doing the job needs to know what
  // was ordered and where to deliver it — not the customer's internal id,
  // exact coordinates, or payment internals.
  private async getForArtisan(userId: string, orderId: string): Promise<ArtisanOrderDto> {
    const artisan = await this.artisanModel.findOne({ where: { userId } });
    if (!artisan) {
      throw new NotFoundException('order not found');
    }

    const order = await this.orderModel.findOne({
      where: { id: orderId },
      include: customerOrderInclude(true),
    });
    if (!order || !order.bookingId) {
      throw new NotFoundException('order not found');
    }

    const hireRequest = await this.hireRequestModel.findByPk(order.bookingId);
    if (!hireRequest || hireRequest.artisanId !== artisan.id) {
      throw new NotFoundException('order not found');
    }

    return toArtisanOrderDto(order);
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

    const capturedPayment = await this.askProviderBeforeCancel(order);
    if (capturedPayment) {
      // Razorpay already has the money: confirm instead of cancelling.
      await this.orderPayment.applyCapture(order, capturedPayment);
      return this.getForCustomer(userId, orderId);
    }

    const cancelled = await this.orderPayment.releaseAndCancel(order.id);

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

  // Decision 0049. A customer who reaches the Razorpay payment sheet and
  // abandons it (closes the tab, loses signal, never completes or
  // explicitly fails) leaves no webhook for this codebase to react to —
  // payment.failed is NOT this case (see webhooks.controller.ts's own
  // comment: a failed attempt stays PENDING_PAYMENT for a UPI-style
  // retry, by design). Without this sweep, that order's quantity_reserved
  // hold is never released. 20 minutes is slightly above the typical
  // 5-15 minute industry range specifically because a UPI retry needs
  // more headroom than a single card swipe.
  //
  // Gated the same way IndexingProcessor.onModuleInit gates the
  // search-outbox drain: WORKER_MODE=api means this process serves HTTP
  // only, and some other process owns scheduled work. No lock is needed
  // for correctness (unlike the outbox drain) — releaseAndCancel's own
  // guarded UPDATE already makes two concurrent sweeps of the same order
  // a no-op on the second one, not a hazard.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepStaleReservations(): Promise<void> {
    if (this.configService.get<string>('search.workerMode', 'all') === 'api') {
      return;
    }

    const cutoff = new Date(Date.now() - STALE_RESERVATION_TIMEOUT_MS);
    const stale = await this.orderModel.findAll({
      where: { status: OrderStatus.PENDING_PAYMENT, createdAt: { [Op.lt]: cutoff } },
    });

    for (const order of stale) {
      try {
        await this.sweepOne(order);
      } catch (err) {
        // One order's failure must not stop the rest of the sweep.
        this.logger.error(
          `order ${order.id}: sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Decision 0054 rule 3. No row lock is held across the Razorpay call (so no
  // SKIP LOCKED either): concurrent sweeps are safe because only one guarded
  // UPDATE can win, as decision 0049 established.
  private async sweepOne(order: Order): Promise<void> {
    const check = await this.orderPayment.checkProviderPayments(order);
    switch (check.kind) {
      case 'captured':
        // A webhook we never received (or one that failed): Razorpay is the
        // source of truth.
        await this.orderPayment.applyCapture(order, check.payment);
        this.logger.log(`order ${order.id}: swept — Razorpay reports a captured payment`);
        return;
      case 'in_flight':
      case 'unavailable':
        this.logger.log(`order ${order.id}: sweep skipped — payment ${check.kind}, will retry`);
        return;
      case 'none': {
        const released = await this.orderPayment.releaseAndCancel(order.id);
        if (!released) {
          return;
        }
        this.logger.log(`order ${order.id}: swept — stale reservation released, order cancelled`);
        await this.notifications.sendOrderStatusChanged(
          order.customerId,
          order.id,
          OrderStatus.CANCELLED,
        );
      }
    }
  }

  // Shared by both cancel paths. Returns the captured payment to confirm, or
  // null when it is safe to go on cancelling. Throws when a payment is in
  // progress (400) or Razorpay cannot be asked (503) — never cancels blind.
  private async askProviderBeforeCancel(order: Order): Promise<ProviderPayment | null> {
    const check = await this.orderPayment.checkProviderPayments(order);
    switch (check.kind) {
      case 'captured':
        return check.payment;
      case 'in_flight':
        throw new BadRequestException(IN_FLIGHT_PAYMENT_MESSAGE);
      case 'unavailable':
        throw new ServiceUnavailableException(PAYMENT_STATUS_UNVERIFIED_MESSAGE);
      case 'none':
        return null;
    }
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
    // Refunds never touch order_vendor_group rows, so a group can
    // sit at CONFIRMED or SHIPPED while its parent order is REFUNDED (or,
    // separately, CANCELLED by adminCancel after a refund). Without this
    // guard a vendor could still ship or deliver goods for an order that
    // was already refunded or cancelled.
    // Decision 0054: captured money being returned (refund_required,
    // refund_pending) stops fulfilment the same way.
    if (LOCKED_PARENT_ORDER_STATUSES.includes(group.order.status)) {
      throw new BadRequestException(GROUP_LOCKED_MESSAGE);
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

  async listForAdmin(customerId?: string): Promise<AdminOrderDto[]> {
    const orders = await this.orderModel.findAll({
      where: customerId ? { customerId } : {},
      include: ADMIN_ORDER_DISPLAY_INCLUDE,
      order: [['createdAt', 'DESC']],
    });
    return orders.map(toAdminOrderDto);
  }

  async getForAdmin(orderId: string): Promise<AdminOrderDto> {
    const order = await this.orderModel.findByPk(orderId, {
      include: ADMIN_ORDER_DISPLAY_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    return toAdminOrderDto(order);
  }

  // Admin may cancel from pending_payment (nothing was ever charged — same
  // as the customer-facing path) or from refunded (the money is already
  // back with the customer, so cancelling now is just bookkeeping). A
  // confirmed order must be refunded FIRST via RefundsService — cancelling a
  // captured payment without refunding it would release the customer's
  // reserved stock while keeping their money, which is strictly worse
  // than doing nothing.
  //
  // Final-review fix (post-implementation): the cancel must be guarded on the
  // exact source status rather than "!= cancelled" — the latter also matches
  // 'confirmed', so a webhook confirming the order between the advisory check
  // below and the write used to let a paid order be silently cancelled with no
  // refund path back (refunds only apply to captured orders). pending_payment
  // goes through OrderPaymentService.releaseAndCancel (guarded UPDATE ... WHERE
  // status = 'pending_payment', the same release the customer cancel and the
  // sweep use); refunded takes the locked transaction below.
  //
  // Inventory is released only for pending_payment. A refunded order was
  // CONFIRMED before the refund, and confirmOrder (webhooks.controller.ts)
  // already decremented BOTH quantity_available and quantity_reserved at that
  // point — the reservation this order held no longer exists. Releasing it
  // again here would subtract from whatever OTHER order's reservation now
  // occupies that quantity on the same listing, enabling an oversell.
  async adminCancel(orderId: string): Promise<AdminOrderDto> {
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
    // Captured money with no confirmed order: cancelling would orphan it.
    if (
      order.status === OrderStatus.REFUND_REQUIRED ||
      order.status === OrderStatus.REFUND_PENDING
    ) {
      throw new BadRequestException('refund this order before cancelling it');
    }

    let cancelled: boolean;
    if (order.status === OrderStatus.PENDING_PAYMENT) {
      // Decision 0054 rule 3. Asked before cancelling, so no row lock is held
      // across the Razorpay call.
      const capturedPayment = await this.askProviderBeforeCancel(order);
      if (capturedPayment) {
        await this.orderPayment.applyCapture(order, capturedPayment);
        throw new BadRequestException('order was paid; refund it instead');
      }
      // The same release the customer cancel and the sweep use: a guarded
      // UPDATE on pending_payment, so a webhook that confirmed the order since
      // the advisory read above makes this return false.
      cancelled = await this.orderPayment.releaseAndCancel(order.id);
    } else {
      // Refunded: bookkeeping only, no stock release (see above). The row lock
      // read inside the transaction is what catches a status change since the
      // advisory read.
      cancelled = await this.sequelize.transaction(async (t) => {
        const lockedRows = await this.sequelize.query<{ status: string }>(
          `SELECT status FROM orders WHERE id = :orderId FOR UPDATE`,
          { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
        );
        if (lockedRows[0]?.status !== OrderStatus.REFUNDED) {
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
    }

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
    const parentIsClosed = !!order && LOCKED_PARENT_ORDER_STATUSES.includes(order.status);
    if (parentIsClosed && status !== OrderVendorGroupStatus.CANCELLED) {
      throw new BadRequestException(
        'cannot override a group whose parent order is refunded, being refunded or cancelled',
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
