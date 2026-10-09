import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
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
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`order cannot be cancelled from status ${order.status}`);
    }

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

    await this.notifications.sendOrderStatusChanged(customer.id, order.id, OrderStatus.CANCELLED);
    return order;
  }

  // The read half of the vendor order surface. Without this, a vendor has
  // no way to discover an order_vendor_group's id at all — the webhook's
  // sendNewOrderToVendor call is a notification, best-effort (log-only
  // until Firebase exists, and never guaranteed delivery even then). This
  // list is the vendor's reliable source of truth, independent of whether
  // any notification arrived.
  async listForVendor(vendorId: string): Promise<OrderVendorGroup[]> {
    return this.groupModel.findAll({
      where: { vendorId },
      include: [OrderItem],
      order: [['createdAt', 'DESC']],
    });
  }

  async getForVendor(vendorId: string, groupId: string): Promise<OrderVendorGroup> {
    const group = await this.groupModel.findOne({
      where: { id: groupId, vendorId },
      include: [OrderItem],
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
    const group = await this.groupModel.findOne({ where: { id: groupId, vendorId } });
    if (!group) {
      throw new NotFoundException('order group not found');
    }
    // Valid forward transitions only — a vendor cannot jump PENDING
    // straight to DELIVERED, and cannot move a CANCELLED group anywhere.
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
