import { randomUUID } from 'crypto';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { Customer } from '../../customers/models/customer.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { User } from '../../users/models/user.model';
import { createPaymentsTestApp, PaymentsTestApp } from './payments-test-app';

jest.setTimeout(60_000);

// Decision 0058 Task 7: the user popup links to "this customer's orders".
describe('GET /api/admin/orders?customerId=', () => {
  let t: PaymentsTestApp;
  let otherUserId: string;
  let otherCustomerId: string;
  let otherOrderId: string;
  const list = (query = '') =>
    request(t.app.getHttpServer())
      .get(`/api/admin/orders${query}`)
      .set('Authorization', `Bearer ${t.adminToken}`);

  beforeAll(async () => {
    t = await createPaymentsTestApp();
    const otherUser = await User.create({
      name: 'Other orders customer',
      phone: `5${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0').slice(0, 10),
      role: Role.CUSTOMER,
      isActive: true,
    } as never);
    otherUserId = otherUser.id;
    const other = await Customer.create({ userId: otherUser.id, fullName: 'Other' } as never);
    otherCustomerId = other.id;
    const address = await CustomerAddress.create({
      customerId: other.id,
      label: 'Home',
      addressLine1: '2 Test Street',
      city: 'Delhi',
      pincode: '110001',
    } as never);
    otherOrderId = randomUUID();
    await t.query(
      `INSERT INTO orders (id, customer_id, delivery_address_id, grand_total, status, created_at, updated_at)
       VALUES (:id, :customerId, :addressId, 100, 'cancelled', now(), now())`,
      { id: otherOrderId, customerId: other.id, addressId: address.id },
    );
  });

  afterAll(async () => {
    await t.query(`DELETE FROM orders WHERE id = :id`, { id: otherOrderId });
    await t.query(`DELETE FROM customer_addresses WHERE customer_id = :id`, {
      id: otherCustomerId,
    });
    await t.query(`DELETE FROM customers WHERE id = :id`, { id: otherCustomerId });
    await t.query(`DELETE FROM users WHERE id = :id`, { id: otherUserId });
    await t.close();
  });

  it('lists only that customer’s orders', async () => {
    const { orderId } = await t.seedPendingOrder();

    const res = await list(`?customerId=${t.customerId}`);

    expect(res.status).toBe(200);
    const orders: { id: string; customerId: string }[] = res.body.data;
    expect(orders.map((o) => o.id)).toContain(orderId);
    expect(orders.map((o) => o.id)).not.toContain(otherOrderId);
    expect(new Set(orders.map((o) => o.customerId))).toEqual(new Set([t.customerId]));
  });

  it('lists everyone’s orders without the filter', async () => {
    const { orderId } = await t.seedPendingOrder();

    const ids = (await list()).body.data.map((o: { id: string }) => o.id);

    expect(ids).toEqual(expect.arrayContaining([orderId, otherOrderId]));
  });

  it('refuses a customer id that is not a UUID', async () => {
    expect((await list('?customerId=not-a-uuid')).status).toBe(400);
  });
});
