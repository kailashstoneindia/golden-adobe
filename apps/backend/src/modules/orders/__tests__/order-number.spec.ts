import request from 'supertest';
import { createPaymentsTestApp, PaymentsTestApp } from './payments-test-app';

jest.setTimeout(60_000);

// Decision 0061: every order carries a short number people can read out loud.
describe('order_number (decision 0061)', () => {
  let t: PaymentsTestApp;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const numberOf = async (orderId: string) =>
    (
      await t.query<{ order_number: string }>(`SELECT order_number FROM orders WHERE id = :id`, {
        id: orderId,
      })
    )[0].order_number;

  it('a new order gets a GA- number with at least five digits', async () => {
    const a = await t.seedPendingOrder();
    expect(await numberOf(a.orderId)).toMatch(/^GA-\d{5,}$/);
  });

  it('numbers are unique and rise with each order', async () => {
    const a = await t.seedPendingOrder();
    const b = await t.seedPendingOrder();
    const na = Number((await numberOf(a.orderId)).slice(3));
    const nb = Number((await numberOf(b.orderId)).slice(3));
    expect(nb).toBeGreaterThan(na);
  });

  it('the database refuses a duplicate number', async () => {
    const a = await t.seedPendingOrder();
    const b = await t.seedPendingOrder();
    await expect(
      t.query(`UPDATE orders SET order_number = :n WHERE id = :id`, {
        n: await numberOf(a.orderId),
        id: b.orderId,
      }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('the customer order, the customer list and the admin order all return it', async () => {
    const a = await t.seedPendingOrder();
    const expected = await numberOf(a.orderId);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const one = await request(t.app.getHttpServer())
      .get(`/api/orders/${a.orderId}`)
      .set(auth(t.customerToken));
    expect(one.body.data.orderNumber).toBe(expected);

    const list = await request(t.app.getHttpServer()).get('/api/orders').set(auth(t.customerToken));
    const row = (list.body.data as { id: string; orderNumber: string }[]).find(
      (o) => o.id === a.orderId,
    );
    expect(row?.orderNumber).toBe(expected);

    const admin = await request(t.app.getHttpServer())
      .get(`/api/admin/orders/${a.orderId}`)
      .set(auth(t.adminToken));
    expect(admin.body.data.orderNumber).toBe(expected);
  });
});
