import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { OrdersService } from '../orders.service';
import { Order, OrderStatus } from '../models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from '../models/order-vendor-group.model';
import { PaymentEvent } from '../models/payment-event.model';
import { CustomersService } from '../../customers/customers.service';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';
import { PAYMENT_PROVIDER } from '../../payments/payment-provider.interface';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModelMock: { findByPk: jest.Mock };
  let groupModelMock: { update: jest.Mock; findByPk: jest.Mock; findOne: jest.Mock };
  let paymentEventModelMock: { findAll: jest.Mock };
  let sequelizeMock: { transaction: jest.Mock; query: jest.Mock };
  let paymentProviderMock: { refundPayment: jest.Mock };
  let notificationsMock: { sendOrderStatusChanged: jest.Mock };
  const mockTransaction = {};

  beforeEach(async () => {
    orderModelMock = { findByPk: jest.fn() };
    groupModelMock = { update: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() };
    paymentEventModelMock = { findAll: jest.fn() };
    sequelizeMock = { transaction: jest.fn(), query: jest.fn() };
    paymentProviderMock = { refundPayment: jest.fn() };
    notificationsMock = { sendOrderStatusChanged: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order), useValue: orderModelMock },
        { provide: getModelToken(OrderVendorGroup), useValue: groupModelMock },
        { provide: getModelToken(PaymentEvent), useValue: paymentEventModelMock },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: CustomersService, useValue: {} },
        { provide: NOTIFICATION_SERVICE, useValue: notificationsMock },
        { provide: PAYMENT_PROVIDER, useValue: paymentProviderMock },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('adminRefund', () => {
    it('refunds a confirmed order and marks it refunded', async () => {
      const order = {
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        razorpayPaymentId: 'pay_abc',
        grandTotal: 1500,
        save: jest.fn(),
      };
      orderModelMock.findByPk.mockResolvedValue(order);
      // The claim-first UPDATE: 1 row updated means the claim succeeded.
      sequelizeMock.query.mockResolvedValueOnce([[], 1]);
      paymentProviderMock.refundPayment.mockResolvedValue({ refundId: 'rfnd_1' });

      const result = await service.adminRefund('order-1');

      expect(paymentProviderMock.refundPayment).toHaveBeenCalledWith('pay_abc', 150000);
      expect(result.status).toBe(OrderStatus.REFUNDED);
    });

    it('rejects refunding an order that was never captured', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
        razorpayPaymentId: null,
      });

      await expect(service.adminRefund('order-1')).rejects.toThrow(
        'order has no captured payment to refund',
      );
    });

    it('rejects refunding an order that was already refunded', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.REFUNDED,
        razorpayPaymentId: 'pay_abc',
      });

      await expect(service.adminRefund('order-1')).rejects.toThrow(
        'order has no captured payment to refund',
      );
    });

    it('rejects a concurrent double-refund: the claim UPDATE matches zero rows the second time (closes finding 3)', async () => {
      // Simulates two concurrent adminRefund calls on the same order: both
      // pass the advisory findByPk check, but only one claim UPDATE can
      // win (WHERE status = 'confirmed' — the other call already flipped
      // it to 'refunded'). Without the claim, both calls would call
      // Razorpay's refund API, and the second would either double-refund
      // or surface a raw, unhandled Razorpay error.
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        razorpayPaymentId: 'pay_abc',
        grandTotal: 1500,
        save: jest.fn(),
      });
      sequelizeMock.query.mockResolvedValueOnce([[], 0]);

      await expect(service.adminRefund('order-1')).rejects.toThrow(
        'order could not be refunded — its status just changed',
      );
      expect(paymentProviderMock.refundPayment).not.toHaveBeenCalled();
    });

    it('reverts the claimed status back to confirmed if the Razorpay call fails, so the order is refundable on retry', async () => {
      // Without the revert, a Razorpay failure (network error, Razorpay
      // outage) leaves the order stuck REFUNDED with no money actually
      // refunded yet — adminCancel refuses REFUNDED→anything-but-cancel
      // semantics aside, and nothing else can move a REFUNDED order that
      // was never actually paid back by Razorpay.
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        razorpayPaymentId: 'pay_abc',
        grandTotal: 1500,
        save: jest.fn(),
      });
      sequelizeMock.query
        .mockResolvedValueOnce([[], 1]) // claim succeeds
        .mockResolvedValueOnce([[], 1]); // revert succeeds
      paymentProviderMock.refundPayment.mockRejectedValue(new Error('razorpay unreachable'));

      await expect(service.adminRefund('order-1')).rejects.toThrow('razorpay unreachable');

      expect(sequelizeMock.query).toHaveBeenCalledTimes(2);
      const revertCall = sequelizeMock.query.mock.calls[1];
      expect(revertCall[0]).toContain('SET status = :confirmed');
    });
  });

  describe('adminCancel', () => {
    it('cancels a pending_payment order directly, releasing reservations', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
      });
      sequelizeMock.transaction.mockImplementation(async (cb: any) => cb(mockTransaction));
      sequelizeMock.query
        // 1: SELECT ... FOR UPDATE locks the row and reads its real status
        .mockResolvedValueOnce([{ status: OrderStatus.PENDING_PAYMENT }])
        // 2: UPDATE orders SET status = cancelled
        .mockResolvedValueOnce([[], 1])
        // 3: SELECT order_items for the inventory release (only runs because
        // the locked status was pending_payment)
        .mockResolvedValueOnce([{ vendor_listing_id: 'vl-1', quantity: '2' }]);

      const result = await service.adminCancel('order-1');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      // The 4th call is the per-item inventory UPDATE — confirms the
      // release loop actually ran for a pending_payment cancellation.
      expect(sequelizeMock.query).toHaveBeenCalledTimes(4);
    });

    it('rejects cancelling a confirmed order that has not been refunded', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
      });

      await expect(service.adminCancel('order-1')).rejects.toThrow(
        'a confirmed order must be refunded before it can be cancelled',
      );
    });

    it('cancels a refunded order WITHOUT releasing inventory (the reservation was already consumed at confirm time)', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.REFUNDED,
      });
      sequelizeMock.transaction.mockImplementation(async (cb: any) => cb(mockTransaction));
      // Only the lock-read and the status UPDATE should run — no SELECT of
      // order_items, no inventory UPDATE. If the fix regresses,
      // sequelizeMock.query gets a third call this test never configured a
      // resolution for, which surfaces as an unhandled rejection.
      sequelizeMock.query
        .mockResolvedValueOnce([{ status: OrderStatus.REFUNDED }])
        .mockResolvedValueOnce([[], 1]);

      const result = await service.adminCancel('order-1');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(sequelizeMock.query).toHaveBeenCalledTimes(2);
    });

    it('rejects cancelling an order whose status changed to confirmed between the advisory read and the row lock', async () => {
      // Simulates: advisory read above sees pending_payment, but a
      // concurrent webhook confirms the order before this transaction's
      // SELECT ... FOR UPDATE acquires the row's lock. The lock-read must
      // see the REAL current status and refuse — if it doesn't (the
      // pre-fix bug), a paid order gets silently cancelled with no refund
      // path back.
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
      });
      sequelizeMock.transaction.mockImplementation(async (cb: any) => cb(mockTransaction));
      // The lock-read itself returns the REAL status: confirmed by a
      // concurrent webhook after the advisory read above but before this
      // transaction started.
      sequelizeMock.query.mockResolvedValueOnce([{ status: OrderStatus.CONFIRMED }]);

      await expect(service.adminCancel('order-1')).rejects.toThrow(
        'order could not be cancelled — its status just changed',
      );
      // Only the lock-read should run — the UPDATE must never be reached.
      expect(sequelizeMock.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateVendorGroupStatus', () => {
    it('allows a valid forward transition when the parent order is confirmed', async () => {
      const group = {
        id: 'group-1',
        vendorId: 'vendor-1',
        status: OrderVendorGroupStatus.CONFIRMED,
        orderId: 'order-1',
        order: { status: OrderStatus.CONFIRMED },
        save: jest.fn(),
      };
      groupModelMock.findOne.mockResolvedValue(group);
      orderModelMock.findByPk.mockResolvedValue({ id: 'order-1', customerId: 'cust-1' });

      const result = await service.updateVendorGroupStatus(
        'vendor-1',
        'group-1',
        OrderVendorGroupStatus.SHIPPED,
      );

      expect(result.status).toBe(OrderVendorGroupStatus.SHIPPED);
    });

    it('refuses to advance a group whose parent order has been refunded (closes finding 4)', async () => {
      // adminRefund never touches order_vendor_group rows, so a group can
      // sit at CONFIRMED (or SHIPPED) while its parent order is REFUNDED.
      // The vendor-visibility filter (Op.ne PENDING_PAYMENT) still shows
      // it. Without this guard a vendor could ship/deliver goods for an
      // order that was already refunded.
      const group = {
        id: 'group-1',
        vendorId: 'vendor-1',
        status: OrderVendorGroupStatus.CONFIRMED,
        orderId: 'order-1',
        order: { status: OrderStatus.REFUNDED },
        save: jest.fn(),
      };
      groupModelMock.findOne.mockResolvedValue(group);

      await expect(
        service.updateVendorGroupStatus('vendor-1', 'group-1', OrderVendorGroupStatus.SHIPPED),
      ).rejects.toThrow('order has been refunded or cancelled and its groups can no longer be updated');
      expect(group.save).not.toHaveBeenCalled();
    });

    it('refuses to advance a group whose parent order has been cancelled', async () => {
      const group = {
        id: 'group-1',
        vendorId: 'vendor-1',
        status: OrderVendorGroupStatus.CONFIRMED,
        orderId: 'order-1',
        order: { status: OrderStatus.CANCELLED },
        save: jest.fn(),
      };
      groupModelMock.findOne.mockResolvedValue(group);

      await expect(
        service.updateVendorGroupStatus('vendor-1', 'group-1', OrderVendorGroupStatus.SHIPPED),
      ).rejects.toThrow('order has been refunded or cancelled and its groups can no longer be updated');
      expect(group.save).not.toHaveBeenCalled();
    });
  });

  describe('adminOverrideVendorGroupStatus — parent order guard', () => {
    it('refuses to override a group whose parent order has been refunded (closes finding 5)', async () => {
      const group = {
        id: 'group-1',
        status: OrderVendorGroupStatus.CONFIRMED,
        orderId: 'order-1',
        save: jest.fn(),
      };
      groupModelMock.findByPk.mockResolvedValue(group);
      orderModelMock.findByPk.mockResolvedValue({ id: 'order-1', status: OrderStatus.REFUNDED });

      await expect(
        service.adminOverrideVendorGroupStatus(
          'group-1',
          OrderVendorGroupStatus.SHIPPED,
          'trying to bring back a refunded order',
        ),
      ).rejects.toThrow('cannot override a group whose parent order is refunded or cancelled');
      expect(group.save).not.toHaveBeenCalled();
    });

    it('still allows cancelling a group under a refunded order (the one safe target)', async () => {
      const group = {
        id: 'group-1',
        status: OrderVendorGroupStatus.CONFIRMED,
        orderId: 'order-1',
        save: jest.fn(),
      };
      groupModelMock.findByPk.mockResolvedValue(group);
      orderModelMock.findByPk.mockResolvedValue({ id: 'order-1', customerId: 'cust-1', status: OrderStatus.REFUNDED });

      const result = await service.adminOverrideVendorGroupStatus(
        'group-1',
        OrderVendorGroupStatus.CANCELLED,
        'cleanup after refund',
      );

      expect(result.status).toBe(OrderVendorGroupStatus.CANCELLED);
    });
  });

  describe('getPaymentEvents', () => {
    it('returns events for an order in chronological order', async () => {
      orderModelMock.findByPk.mockResolvedValue({ id: 'order-1' });
      paymentEventModelMock.findAll.mockResolvedValue([{ eventType: 'payment.captured' }]);

      const result = await service.getPaymentEvents('order-1');

      expect(paymentEventModelMock.findAll).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        order: [['createdAt', 'ASC']],
      });
      expect(result).toHaveLength(1);
    });

    it('404s for an order that does not exist', async () => {
      orderModelMock.findByPk.mockResolvedValue(null);
      await expect(service.getPaymentEvents('missing')).rejects.toThrow('order not found');
    });
  });

  describe('adminOverrideVendorGroupStatus', () => {
    it('sets any status regardless of the current one, logging the reason', async () => {
      const group = {
        id: 'group-1',
        status: OrderVendorGroupStatus.PENDING,
        orderId: 'order-1',
        save: jest.fn(),
      };
      groupModelMock.findByPk.mockResolvedValue(group);
      orderModelMock.findByPk.mockResolvedValue({ id: 'order-1', customerId: 'cust-1' });

      const result = await service.adminOverrideVendorGroupStatus(
        'group-1',
        OrderVendorGroupStatus.CANCELLED,
        'vendor unresponsive for 5 days',
      );

      expect(result.status).toBe(OrderVendorGroupStatus.CANCELLED);
      expect(group.save).toHaveBeenCalled();
    });

    it('rejects an empty reason', async () => {
      await expect(
        service.adminOverrideVendorGroupStatus('group-1', OrderVendorGroupStatus.CANCELLED, ''),
      ).rejects.toThrow('a reason is required');
    });

    it('404s for a group that does not exist', async () => {
      groupModelMock.findByPk.mockResolvedValue(null);
      await expect(
        service.adminOverrideVendorGroupStatus('missing', OrderVendorGroupStatus.CANCELLED, 'reason'),
      ).rejects.toThrow('order group not found');
    });
  });
});
