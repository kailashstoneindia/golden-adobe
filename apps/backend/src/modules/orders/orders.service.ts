import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes } from 'sequelize';
import { Order, OrderStatus } from './models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CustomersService } from '../customers/customers.service';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderVendorGroup) private readonly groupModel: typeof OrderVendorGroup,
    private readonly sequelize: Sequelize,
    private readonly customersService: CustomersService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  async listForCustomer(userId: string): Promise<Order[]> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    return this.orderModel.findAll({
      where: { customerId: customer.id },
      include: [{ model: OrderVendorGroup, include: [OrderItem] }],
      order: [['createdAt', 'DESC']],
    });
  }

  async getForCustomer(userId: string, orderId: string): Promise<Order> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const order = await this.orderModel.findOne({
      where: { id: orderId, customerId: customer.id },
      include: [{ model: OrderVendorGroup, include: [OrderItem] }],
    });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    return order;
  }

  // Cancellation authorization (who, until when) is an explicit open
  // question in decision 0033 — this allocates the simplest rule that does
  // not foreclose a stricter one later: a customer may cancel their own
  // order only while it is still PENDING_PAYMENT (i.e. before the webhook
  // has confirmed payment). Once CONFIRMED, cancellation is not exposed to
  // the customer here — full post-confirmation cancellation semantics are
  // decision 0033's own named "likely next ADR," not settled here.
  async cancel(userId: string, orderId: string): Promise<Order> {
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
    return order;
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
  async listForVendor(vendorId: string): Promise<OrderVendorGroup[]> {
    return this.groupModel.findAll({
      where: { vendorId },
      include: [
        OrderItem,
        { model: Order, attributes: [], where: { status: { [Op.ne]: OrderStatus.PENDING_PAYMENT } } },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async getForVendor(vendorId: string, groupId: string): Promise<OrderVendorGroup> {
    const group = await this.groupModel.findOne({
      where: { id: groupId, vendorId },
      include: [
        OrderItem,
        { model: Order, attributes: [], where: { status: { [Op.ne]: OrderStatus.PENDING_PAYMENT } } },
      ],
    });
    if (!group) {
      throw new NotFoundException('order group not found');
    }
    return group;
  }

  async updateVendorGroupStatus(
    vendorId: string,
    groupId: string,
    status: OrderVendorGroupStatus,
  ): Promise<OrderVendorGroup> {
    const group = await this.groupModel.findOne({
      where: { id: groupId, vendorId },
      include: [
        { model: Order, attributes: ['status'], where: { status: { [Op.ne]: OrderStatus.PENDING_PAYMENT } } },
      ],
    });
    if (!group) {
      // Same 404 whether the group belongs to another vendor, doesn't
      // exist, or its order is still unpaid — a vendor gets no signal
      // that an order "exists but isn't theirs to act on yet" either way,
      // matching the ownership-check convention used everywhere else.
      throw new NotFoundException('order group not found');
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
      throw new BadRequestException(`cannot transition order group from ${group.status} to ${status}`);
    }
    group.status = status;
    await group.save();

    const order = await this.orderModel.findByPk(group.orderId);
    if (order) {
      await this.notifications.sendOrderStatusChanged(order.customerId, order.id, status);
    }
    return group;
  }

  async listForAdmin(): Promise<Order[]> {
    return this.orderModel.findAll({
      include: [{ model: OrderVendorGroup, include: [OrderItem] }],
      order: [['createdAt', 'DESC']],
    });
  }

  async getForAdmin(orderId: string): Promise<Order> {
    const order = await this.orderModel.findByPk(orderId, {
      include: [{ model: OrderVendorGroup, include: [OrderItem] }],
    });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    return order;
  }
}
