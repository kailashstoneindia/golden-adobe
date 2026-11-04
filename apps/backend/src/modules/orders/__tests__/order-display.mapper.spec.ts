import { Order } from '../models/order.model';
import { toArtisanOrderDto, toOrderDto } from '../order-display.mapper';

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
