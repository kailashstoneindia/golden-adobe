import { Role } from '@golden-abode/types';

import { Order } from '../models/order.model';
import { toAdminOrderDto } from '../admin-order.mapper';

const user = (id: string, name: string, role: Role) => ({
  id,
  name,
  phone: '9876543210',
  email: `${id}@example.com`,
  role,
  isActive: true,
  isApproved: true,
  lastLoginAt: null,
});

function orderRow(over: Record<string, unknown> = {}): Order {
  return {
    id: 'o1',
    customerId: 'c1',
    deliveryAddressId: 'a1',
    grandTotal: '1200.00',
    capturedPaise: 120000,
    status: 'confirmed',
    razorpayOrderId: 'order_x',
    razorpayPaymentId: 'pay_x',
    bookingId: 'hire-1',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    customer: { id: 'c1', fullName: 'Asha Rao', user: user('u-cust', 'Asha', Role.CUSTOMER) },
    vendorGroups: [
      {
        id: 'g1',
        orderId: 'o1',
        vendorId: 'v1',
        subtotal: '1000.00',
        loadingUnloadingFee: '0',
        status: 'confirmed',
        vendor: { id: 'v1', shopName: 'Stone Mart', user: user('u-vend', 'Vikram', Role.VENDOR) },
        createdAt: new Date('2026-11-01T01:00:00Z'),
        updatedAt: new Date('2026-11-02T09:30:00Z'),
        items: [{ id: 'i1' }, { id: 'i2' }],
      },
      {
        id: 'g2',
        orderId: 'o1',
        vendorId: 'v2',
        subtotal: '200.00',
        loadingUnloadingFee: '0',
        status: 'pending',
        vendor: { id: 'v2', shopName: 'Tile Hub', user: null },
        items: [{ id: 'i3' }],
      },
    ],
    ...over,
  } as unknown as Order;
}

// Decision 0058 Task 4d: the admin sees who is involved in an order.
describe('toAdminOrderDto', () => {
  it('carries the customer contact and full name', () => {
    const dto = toAdminOrderDto(orderRow());
    expect(dto.customer).toMatchObject({
      userId: 'u-cust',
      phone: '9876543210',
      role: Role.CUSTOMER,
    });
    expect(dto.customerFullName).toBe('Asha Rao');
  });

  it('carries each vendor group’s vendor contact, null when missing', () => {
    const dto = toAdminOrderDto(orderRow());
    expect(dto.vendorGroups[0].vendor).toMatchObject({ userId: 'u-vend', name: 'Vikram' });
    expect(dto.vendorGroups[0].shopName).toBe('Stone Mart');
    expect(dto.vendorGroups[1].vendor).toBeNull();
  });

  it('counts the line items and links the hire request', () => {
    const dto = toAdminOrderDto(orderRow());
    expect(dto.itemCount).toBe(3);
    expect(dto.hireRequestId).toBe('hire-1');
  });

  it('keeps the existing order fields, including the delivery address slot', () => {
    const dto = toAdminOrderDto(orderRow());
    expect(dto).toMatchObject({
      id: 'o1',
      grandTotal: 1200,
      capturedPaise: 120000,
      status: 'confirmed',
    });
    expect(dto).toHaveProperty('deliveryAddress');
  });

  it('copes with an order whose customer row is gone', () => {
    const dto = toAdminOrderDto(orderRow({ customer: null }));
    expect(dto.customer).toBeNull();
    expect(dto.customerFullName).toBeNull();
  });
});

describe('toAdminOrderDto vendor group times', () => {
  it('says when each vendor group was created and last changed', () => {
    const [group] = toAdminOrderDto(orderRow()).vendorGroups;
    expect(group.createdAt).toBe('2026-11-01T01:00:00.000Z');
    expect(group.updatedAt).toBe('2026-11-02T09:30:00.000Z');
  });
});
