import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { OrdersService } from '../orders.service';
import { Order, OrderStatus } from '../models/order.model';
import { OrderVendorGroup } from '../models/order-vendor-group.model';
import { CustomersService } from '../../customers/customers.service';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';
import { PAYMENT_PROVIDER } from '../../payments/payment-provider.interface';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModelMock: { findByPk: jest.Mock };
  let groupModelMock: { update: jest.Mock };
  let sequelizeMock: { transaction: jest.Mock; query: jest.Mock };
  let paymentProviderMock: { refundPayment: jest.Mock };
  let notificationsMock: { sendOrderStatusChanged: jest.Mock };
  const mockTransaction = {};

  beforeEach(async () => {
    orderModelMock = { findByPk: jest.fn() };
    groupModelMock = { update: jest.fn() };
    sequelizeMock = { transaction: jest.fn(), query: jest.fn() };
    paymentProviderMock = { refundPayment: jest.fn() };
    notificationsMock = { sendOrderStatusChanged: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order), useValue: orderModelMock },
        { provide: getModelToken(OrderVendorGroup), useValue: groupModelMock },
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
  });

  describe('adminCancel', () => {
    it('cancels a pending_payment order directly, releasing reservations', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
      });
      sequelizeMock.transaction.mockImplementation(async (cb: any) => cb(mockTransaction));
      sequelizeMock.query.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([
        { vendor_listing_id: 'vl-1', quantity: '2' },
      ]);

      const result = await service.adminCancel('order-1');

      expect(result.status).toBe(OrderStatus.CANCELLED);
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

    it('cancels a refunded order', async () => {
      orderModelMock.findByPk.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.REFUNDED,
      });
      sequelizeMock.transaction.mockImplementation(async (cb: any) => cb(mockTransaction));
      sequelizeMock.query.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([]);

      const result = await service.adminCancel('order-1');

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });
  });
});
