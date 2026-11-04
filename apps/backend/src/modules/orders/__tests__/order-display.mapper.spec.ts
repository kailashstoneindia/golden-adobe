import { Order } from '../models/order.model';
import { toArtisanOrderDto, toOrderDto, toPaymentEventDto } from '../order-display.mapper';

function orderRow(capturedPaise: number | null): Order {
  return {
    id: 'o1',
    customerId: 'c1',
    deliveryAddressId: 'a1',
    grandTotal: '300.00',
    capturedPaise,
    status: 'refund_required',
    razorpayOrderId: 'order_x',
    razorpayPaymentId: 'pay_x',
    bookingId: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    vendorGroups: [],
  } as unknown as Order;
}

describe('order display mapper', () => {
  it('exposes captured_paise to admins and customers, null when never recorded', () => {
    expect(toOrderDto(orderRow(25050), false).capturedPaise).toBe(25050);
    expect(toOrderDto(orderRow(null), false).capturedPaise).toBeNull();
  });

  it('keeps captured_paise out of the artisan view', () => {
    expect(toArtisanOrderDto(orderRow(25050))).not.toHaveProperty('capturedPaise');
  });
});

// Global Constraint (decision 0058): customers and vendors receive exactly the
// order shape they always did; admin-only fields live on AdminOrderDto only.
describe('non-admin order shape is pinned', () => {
  it('toOrderDto returns exactly these keys', () => {
    expect(Object.keys(toOrderDto(orderRow(100), true)).sort()).toEqual(
      [
        'bookingId',
        'capturedPaise',
        'createdAt',
        'customerId',
        'deliveryAddress',
        'deliveryAddressId',
        'grandTotal',
        'id',
        'razorpayOrderId',
        'razorpayPaymentId',
        'status',
        'updatedAt',
        'vendorGroups',
      ].sort(),
    );
  });

  it('carries the Razorpay event id on payment events', () => {
    const dto = toPaymentEventDto({
      id: 'e1',
      orderId: 'o1',
      eventType: 'payment.captured',
      eventId: 'evt_123',
      rawPayload: {},
      createdAt: new Date('2026-11-01T00:00:00Z'),
    } as never);
    expect(dto.eventId).toBe('evt_123');
  });
});
