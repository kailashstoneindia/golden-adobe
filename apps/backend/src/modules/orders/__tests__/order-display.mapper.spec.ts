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

describe('delivery address on the order view (decision 0060)', () => {
  const snapshot = {
    label: 'Site',
    addressLine1: '9 Paid-for Road',
    addressLine2: null,
    city: 'Jaipur',
    pincode: '302001',
    lat: 26.9,
    lng: 75.8,
    recipientName: 'Rina',
    recipientPhone: '9000000001',
  };
  // The customer edited the saved address after paying.
  const editedLiveRow = {
    id: 'a1',
    customerId: 'c1',
    label: 'Home',
    addressLine1: '1 Edited Street',
    addressLine2: null,
    city: 'Delhi',
    pincode: '110001',
    lat: null,
    lng: null,
    isDefault: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-11-05T00:00:00Z'),
  };

  it('shows the snapshot, not the edited live row', () => {
    const order = {
      ...orderRow(null),
      deliveryAddressSnapshot: snapshot,
      deliveryAddress: editedLiveRow,
    } as unknown as Order;
    const dto = toOrderDto(order, true);
    expect(dto.deliveryAddress?.addressLine1).toBe('9 Paid-for Road');
    expect(dto.deliveryAddress?.city).toBe('Jaipur');
    expect(dto.deliveryAddress?.id).toBe('a1');
    expect(toArtisanOrderDto(order).deliveryAddress?.addressLine1).toBe('9 Paid-for Road');
  });

  it('falls back to the live row when there is no snapshot (old orders)', () => {
    const order = {
      ...orderRow(null),
      deliveryAddressSnapshot: null,
      deliveryAddress: editedLiveRow,
    } as unknown as Order;
    expect(toOrderDto(order, true).deliveryAddress?.addressLine1).toBe('1 Edited Street');
  });

  it('hides the address when the caller is not entitled to it', () => {
    const order = {
      ...orderRow(null),
      deliveryAddressSnapshot: snapshot,
      deliveryAddress: editedLiveRow,
    } as unknown as Order;
    expect(toOrderDto(order, false).deliveryAddress).toBeNull();
  });
});
