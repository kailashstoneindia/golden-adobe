import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Role } from '@golden-abode/types';
import { OrdersService } from '../orders.service';
import { OrderPaymentService } from '../order-payment.service';
import { Order, OrderStatus } from '../models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from '../models/order-vendor-group.model';
import { PaymentEvent } from '../models/payment-event.model';
import { CustomersService } from '../../customers/customers.service';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';
import { Artisan } from '../../artisans/models/artisan.model';
import { ArtisanHireRequest } from '../../artisans/models/artisan-hire-request.model';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModelMock: { findByPk: jest.Mock; findOne: jest.Mock; findAll: jest.Mock };
  let groupModelMock: { update: jest.Mock; findByPk: jest.Mock; findOne: jest.Mock };
  let paymentEventModelMock: { findAll: jest.Mock };
  let sequelizeMock: { transaction: jest.Mock; query: jest.Mock };
  let notificationsMock: { sendOrderStatusChanged: jest.Mock };
  let customersServiceMock: { resolveCustomerByUserId: jest.Mock };
  let artisanModelMock: { findOne: jest.Mock };
  let hireRequestModelMock: { findByPk: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let orderPaymentMock: {
    releaseAndCancel: jest.Mock;
    checkProviderPayments: jest.Mock;
    applyCapture: jest.Mock;
  };
  const mockTransaction = {};

  beforeEach(async () => {
    orderModelMock = { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn() };
    groupModelMock = { update: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() };
    paymentEventModelMock = { findAll: jest.fn() };
    sequelizeMock = { transaction: jest.fn(), query: jest.fn() };
    notificationsMock = { sendOrderStatusChanged: jest.fn() };
    customersServiceMock = { resolveCustomerByUserId: jest.fn() };
    artisanModelMock = { findOne: jest.fn() };
    hireRequestModelMock = { findByPk: jest.fn() };
    configServiceMock = { get: jest.fn().mockReturnValue('all') };
    orderPaymentMock = {
      releaseAndCancel: jest.fn(),
      checkProviderPayments: jest.fn().mockResolvedValue({ kind: 'none' }),
      applyCapture: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order), useValue: orderModelMock },
        { provide: getModelToken(OrderVendorGroup), useValue: groupModelMock },
        { provide: getModelToken(PaymentEvent), useValue: paymentEventModelMock },
        { provide: getModelToken(Artisan), useValue: artisanModelMock },
        { provide: getModelToken(ArtisanHireRequest), useValue: hireRequestModelMock },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: CustomersService, useValue: customersServiceMock },
        { provide: NOTIFICATION_SERVICE, useValue: notificationsMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OrderPaymentService, useValue: orderPaymentMock },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('getForOwner', () => {
    it('returns the order for the owning customer', async () => {
      customersServiceMock.resolveCustomerByUserId.mockResolvedValue({ id: 'customer-1' });
      orderModelMock.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'customer-1',
        deliveryAddressId: 'addr-1',
        grandTotal: 500,
        status: OrderStatus.CONFIRMED,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        bookingId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveryAddress: null,
        vendorGroups: [],
      });

      const result = await service.getForOwner('user-1', Role.CUSTOMER, 'order-1');

      expect(result.id).toBe('order-1');
      expect(orderModelMock.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1', customerId: 'customer-1' } }),
      );
    });

    it('404s when the order does not belong to the calling customer', async () => {
      customersServiceMock.resolveCustomerByUserId.mockResolvedValue({ id: 'customer-1' });
      orderModelMock.findOne.mockResolvedValue(null);

      await expect(service.getForOwner('user-1', Role.CUSTOMER, 'order-1')).rejects.toThrow(
        'order not found',
      );
    });

    it('returns the order for the artisan who owns the attributed hire request', async () => {
      artisanModelMock.findOne.mockResolvedValue({ id: 'artisan-1' });
      orderModelMock.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'customer-1',
        deliveryAddressId: 'addr-1',
        grandTotal: 500,
        status: OrderStatus.CONFIRMED,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        bookingId: 'hire-request-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveryAddress: null,
        vendorGroups: [],
      });
      hireRequestModelMock.findByPk.mockResolvedValue({
        id: 'hire-request-1',
        artisanId: 'artisan-1',
      });

      const result = await service.getForOwner('artisan-user-1', Role.ARTISAN, 'order-1');

      expect(result.id).toBe('order-1');
    });

    it('never leaks customerId, razorpay fields, or precise delivery GPS to the owning artisan', async () => {
      artisanModelMock.findOne.mockResolvedValue({ id: 'artisan-1' });
      orderModelMock.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'customer-1',
        deliveryAddressId: 'addr-1',
        grandTotal: 500,
        status: OrderStatus.CONFIRMED,
        razorpayOrderId: 'razorpay_order_abc',
        razorpayPaymentId: 'razorpay_pay_xyz',
        bookingId: 'hire-request-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveryAddress: {
          label: 'Home',
          addressLine1: '42 Test Lane',
          addressLine2: null,
          city: 'Bengaluru',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
        vendorGroups: [],
      });
      hireRequestModelMock.findByPk.mockResolvedValue({
        id: 'hire-request-1',
        artisanId: 'artisan-1',
      });

      const result = await service.getForOwner('artisan-user-1', Role.ARTISAN, 'order-1');

      expect(result).not.toHaveProperty('customerId');
      expect(result).not.toHaveProperty('razorpayOrderId');
      expect(result).not.toHaveProperty('razorpayPaymentId');
      expect(result).not.toHaveProperty('deliveryAddressId');
      expect((result as { deliveryAddress: { lat?: number } }).deliveryAddress).not.toHaveProperty(
        'lat',
      );
      expect((result as { deliveryAddress: { lng?: number } }).deliveryAddress).not.toHaveProperty(
        'lng',
      );
      expect(
        (result as { deliveryAddress: { customerId?: string } }).deliveryAddress,
      ).not.toHaveProperty('customerId');
      // The address TEXT the artisan does legitimately need is still there.
      expect((result as { deliveryAddress: { addressLine1: string } }).deliveryAddress).toEqual(
        expect.objectContaining({
          addressLine1: '42 Test Lane',
          city: 'Bengaluru',
          pincode: '560001',
        }),
      );
    });

    it('404s for an artisan when the order has no bookingId at all', async () => {
      artisanModelMock.findOne.mockResolvedValue({ id: 'artisan-1' });
      orderModelMock.findOne.mockResolvedValue({
        id: 'order-1',
        bookingId: null,
      });

      await expect(service.getForOwner('artisan-user-1', Role.ARTISAN, 'order-1')).rejects.toThrow(
        'order not found',
      );
    });

    it('404s for an artisan when the attributed hire request belongs to someone else', async () => {
      artisanModelMock.findOne.mockResolvedValue({ id: 'artisan-1' });
      orderModelMock.findOne.mockResolvedValue({
        id: 'order-1',
        bookingId: 'hire-request-1',
      });
      hireRequestModelMock.findByPk.mockResolvedValue({
        id: 'hire-request-1',
        artisanId: 'someone-elses-artisan-id',
      });

      await expect(service.getForOwner('artisan-user-1', Role.ARTISAN, 'order-1')).rejects.toThrow(
        'order not found',
      );
    });

    it('404s when the caller has no artisan profile at all', async () => {
      artisanModelMock.findOne.mockResolvedValue(null);

      await expect(
        service.getForOwner('artisan-user-1', Role.ARTISAN, 'order-1'),
      ).rejects.toThrow();
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

  describe('sweepStaleReservations', () => {
    it('releases and cancels each stale pending_payment order, then notifies its customer', async () => {
      orderModelMock.findAll.mockResolvedValue([
        { id: 'order-1', customerId: 'cust-1' },
        { id: 'order-2', customerId: 'cust-2' },
      ]);
      orderPaymentMock.releaseAndCancel.mockResolvedValue(true);

      await service.sweepStaleReservations();

      expect(orderModelMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: OrderStatus.PENDING_PAYMENT }),
        }),
      );
      expect(orderPaymentMock.releaseAndCancel).toHaveBeenNthCalledWith(1, 'order-1');
      expect(orderPaymentMock.releaseAndCancel).toHaveBeenNthCalledWith(2, 'order-2');
      expect(notificationsMock.sendOrderStatusChanged).toHaveBeenCalledTimes(2);
      expect(notificationsMock.sendOrderStatusChanged).toHaveBeenNthCalledWith(
        1,
        'cust-1',
        'order-1',
        OrderStatus.CANCELLED,
      );
      expect(notificationsMock.sendOrderStatusChanged).toHaveBeenNthCalledWith(
        2,
        'cust-2',
        'order-2',
        OrderStatus.CANCELLED,
      );
    });

    it('does not notify for an order that lost the race (already confirmed by a webhook)', async () => {
      orderModelMock.findAll.mockResolvedValue([{ id: 'order-1', customerId: 'cust-1' }]);
      // The guarded UPDATE affects 0 rows — a webhook confirmed this order
      // between the sweep's findAll and its own transaction.
      orderPaymentMock.releaseAndCancel.mockResolvedValue(false);

      await service.sweepStaleReservations();

      expect(notificationsMock.sendOrderStatusChanged).not.toHaveBeenCalled();
    });

    it('applies a capture Razorpay reports instead of cancelling', async () => {
      const order = { id: 'order-1', customerId: 'cust-1' };
      const payment = { id: 'pay_1' };
      orderModelMock.findAll.mockResolvedValue([order]);
      orderPaymentMock.checkProviderPayments.mockResolvedValue({ kind: 'captured', payment });

      await service.sweepStaleReservations();

      expect(orderPaymentMock.applyCapture).toHaveBeenCalledWith(order, payment);
      expect(orderPaymentMock.releaseAndCancel).not.toHaveBeenCalled();
      expect(notificationsMock.sendOrderStatusChanged).not.toHaveBeenCalled();
    });

    it.each(['in_flight', 'unavailable'])(
      'skips an order whose payment check is %s',
      async (kind) => {
        orderModelMock.findAll.mockResolvedValue([{ id: 'order-1', customerId: 'cust-1' }]);
        orderPaymentMock.checkProviderPayments.mockResolvedValue({ kind });

        await service.sweepStaleReservations();

        expect(orderPaymentMock.releaseAndCancel).not.toHaveBeenCalled();
        expect(orderPaymentMock.applyCapture).not.toHaveBeenCalled();
      },
    );

    it('keeps sweeping the remaining orders when one fails', async () => {
      orderModelMock.findAll.mockResolvedValue([
        { id: 'order-1', customerId: 'cust-1' },
        { id: 'order-2', customerId: 'cust-2' },
      ]);
      orderPaymentMock.releaseAndCancel
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(true);

      await service.sweepStaleReservations();

      expect(orderPaymentMock.releaseAndCancel).toHaveBeenCalledTimes(2);
      expect(notificationsMock.sendOrderStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('does nothing when WORKER_MODE is api — some other process owns scheduled work', async () => {
      configServiceMock.get.mockReturnValue('api');

      await service.sweepStaleReservations();

      expect(orderModelMock.findAll).not.toHaveBeenCalled();
      expect(orderPaymentMock.releaseAndCancel).not.toHaveBeenCalled();
      expect(notificationsMock.sendOrderStatusChanged).not.toHaveBeenCalled();
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
      // refunds never touch order_vendor_group rows, so a group can
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
      ).rejects.toThrow(
        'order is refunded, being refunded or cancelled, and its groups can no longer be updated',
      );
      expect(group.save).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.REFUND_REQUIRED, OrderStatus.REFUND_PENDING])(
      'refuses to advance a group whose parent order is %s (decision 0054)',
      async (orderStatus) => {
        const group = {
          id: 'group-1',
          vendorId: 'vendor-1',
          status: OrderVendorGroupStatus.CONFIRMED,
          orderId: 'order-1',
          order: { status: orderStatus },
          save: jest.fn(),
        };
        groupModelMock.findOne.mockResolvedValue(group);

        await expect(
          service.updateVendorGroupStatus('vendor-1', 'group-1', OrderVendorGroupStatus.SHIPPED),
        ).rejects.toThrow(BadRequestException);
        expect(group.save).not.toHaveBeenCalled();
      },
    );

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
      ).rejects.toThrow(
        'order is refunded, being refunded or cancelled, and its groups can no longer be updated',
      );
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
      ).rejects.toThrow(
        'cannot override a group whose parent order is refunded, being refunded or cancelled',
      );
      expect(group.save).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.REFUND_REQUIRED, OrderStatus.REFUND_PENDING])(
      'refuses to override a group whose parent order is %s (decision 0054)',
      async (orderStatus) => {
        const group = {
          id: 'group-1',
          status: OrderVendorGroupStatus.CONFIRMED,
          orderId: 'order-1',
          save: jest.fn(),
        };
        groupModelMock.findByPk.mockResolvedValue(group);
        orderModelMock.findByPk.mockResolvedValue({ id: 'order-1', status: orderStatus });

        await expect(
          service.adminOverrideVendorGroupStatus(
            'group-1',
            OrderVendorGroupStatus.SHIPPED,
            'trying to ship an order being refunded',
          ),
        ).rejects.toThrow(
          'cannot override a group whose parent order is refunded, being refunded or cancelled',
        );
        expect(group.save).not.toHaveBeenCalled();
      },
    );

    it('still allows cancelling a group under a refunded order (the one safe target)', async () => {
      const group = {
        id: 'group-1',
        status: OrderVendorGroupStatus.CONFIRMED,
        orderId: 'order-1',
        save: jest.fn(),
      };
      groupModelMock.findByPk.mockResolvedValue(group);
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.REFUNDED,
      });

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
        service.adminOverrideVendorGroupStatus(
          'missing',
          OrderVendorGroupStatus.CANCELLED,
          'reason',
        ),
      ).rejects.toThrow('order group not found');
    });
  });
});
