import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { HireRequestsService } from '../hire-requests.service';
import { Artisan } from '../models/artisan.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../models/artisan-completion-estimate.model';
import { Order } from '../../orders/models/order.model';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';

// Unit-level coverage for listAttributedOrders only (decision 0045 item
// 7), mirroring checkout.service.spec.ts's own reasoning: a mocked
// Order.findAll is enough to prove this one query and its mapping, and
// adding Order (plus its own Customer/CustomerAddress/OrderVendorGroup
// associations) to the real-Postgres artisans test-db fixture would be a
// much bigger, out-of-scope lift for one simple read method.
describe('HireRequestsService.listAttributedOrders', () => {
  let service: HireRequestsService;
  let orderModelMock: { findAll: jest.Mock };

  beforeEach(async () => {
    orderModelMock = { findAll: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        HireRequestsService,
        { provide: getModelToken(Artisan), useValue: {} },
        { provide: getModelToken(ArtisanHireRequest), useValue: {} },
        { provide: getModelToken(ArtisanCompletionEstimate), useValue: {} },
        { provide: getModelToken(Order), useValue: orderModelMock },
        { provide: NOTIFICATION_SERVICE, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(HireRequestsService);
  });

  it('queries orders by bookingId, newest first', async () => {
    orderModelMock.findAll.mockResolvedValue([]);

    await service.listAttributedOrders('request-1');

    expect(orderModelMock.findAll).toHaveBeenCalledWith({
      where: { bookingId: 'request-1' },
      order: [['createdAt', 'DESC']],
    });
  });

  it('maps found orders through toOrderDto without the delivery address', async () => {
    orderModelMock.findAll.mockResolvedValue([
      {
        id: 'order-1',
        customerId: 'customer-1',
        deliveryAddressId: 'addr-1',
        grandTotal: 500,
        status: 'confirmed',
        razorpayOrderId: null,
        razorpayPaymentId: null,
        bookingId: 'request-1',
        createdAt: new Date('2026-10-30T00:00:00.000Z'),
        updatedAt: new Date('2026-10-30T00:00:00.000Z'),
        deliveryAddress: null,
        vendorGroups: [],
      },
    ]);

    const result = await service.listAttributedOrders('request-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'order-1', bookingId: 'request-1' });
    expect(result[0].deliveryAddress).toBeNull();
  });
});
