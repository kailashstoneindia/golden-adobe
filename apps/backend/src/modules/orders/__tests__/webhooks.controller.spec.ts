import { randomUUID } from 'crypto';
import request from 'supertest';
import { createPaymentsTestApp, PaymentsTestApp, SeededOrder } from './payments-test-app';
import { OrderPaymentService } from '../order-payment.service';
import { Order } from '../models/order.model';

// Decision 0054 rules 2, 4 and 7, through the real HTTP path and Postgres.
describe('POST /webhooks/razorpay (decision 0054)', () => {
  let t: PaymentsTestApp;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function capturedBody(
    o: SeededOrder,
    overrides: Partial<{
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      event: string;
    }> = {},
  ): string {
    return JSON.stringify({
      event: overrides.event ?? 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: overrides.id ?? `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
            order_id: overrides.order_id ?? o.razorpayOrderId,
            amount: overrides.amount ?? o.grandTotalPaise,
            currency: overrides.currency ?? 'INR',
            status: 'captured',
          },
        },
      },
    });
  }

  function post(body: string, opts: { eventId?: string; signature?: string } = {}) {
    const req = request(t.app.getHttpServer())
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', opts.signature ?? t.signWebhook(body));
    if (opts.eventId) {
      req.set('x-razorpay-event-id', opts.eventId);
    }
    return req.send(body);
  }

  async function orderRow(orderId: string) {
    const [row] = await t.query<{ status: string; razorpay_payment_id: string | null }>(
      `SELECT status, razorpay_payment_id FROM orders WHERE id = :orderId`,
      { orderId },
    );
    return row;
  }

  async function groupStatuses(orderId: string) {
    const rows = await t.query<{ status: string }>(
      `SELECT status FROM order_vendor_group WHERE order_id = :orderId`,
      { orderId },
    );
    return rows.map((r) => r.status);
  }

  async function inventory(listingId: string) {
    const [row] = await t.query<{ quantity_available: number; quantity_reserved: number }>(
      `SELECT quantity_available, quantity_reserved FROM inventory WHERE vendor_listing_id = :listingId`,
      { listingId },
    );
    return { available: Number(row.quantity_available), reserved: Number(row.quantity_reserved) };
  }

  it('confirms the order once when payment.captured is delivered three times', async () => {
    const o = await t.seedPendingOrder();
    const body = capturedBody(o, { id: 'pay_triple' + randomUUID().slice(0, 6) });
    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;

    for (let i = 0; i < 3; i++) {
      const res = await post(body, { eventId });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    }

    expect((await orderRow(o.orderId)).status).toBe('confirmed');
    expect(await groupStatuses(o.orderId)).toEqual(['confirmed']);
    expect(await inventory(o.listingId)).toEqual({ available: 10 - o.quantity, reserved: 0 });
    const events = await t.query(`SELECT 1 FROM payment_events WHERE event_id = :eventId`, {
      eventId,
    });
    expect(events).toHaveLength(1);
    expect(
      t.notifications.callsTo('sendOrderPlaced').filter((c) => c.args[1] === o.orderId),
    ).toHaveLength(1);
  });

  it('moves a cancelled order to refund_required on a late capture', async () => {
    const o = await t.seedPendingOrder();
    const orderPayment = t.moduleRef.get(OrderPaymentService);
    expect(await orderPayment.releaseAndCancel(o.orderId)).toBe(true);
    const before = await inventory(o.listingId);

    const res = await post(capturedBody(o, { id: 'pay_late' + randomUUID().slice(0, 6) }));

    expect(res.status).toBeLessThan(300);
    const row = await orderRow(o.orderId);
    expect(row.status).toBe('refund_required');
    expect(row.razorpay_payment_id).toMatch(/^pay_late/);
    expect(await inventory(o.listingId)).toEqual(before);
  });

  it('never confirms when the amount does not match', async () => {
    const o = await t.seedPendingOrder();

    const res = await post(capturedBody(o, { amount: o.grandTotalPaise + 1 }));

    expect(res.status).toBeLessThan(300);
    expect((await orderRow(o.orderId)).status).toBe('refund_required');
    expect((await orderRow(o.orderId)).razorpay_payment_id).not.toBeNull();
    expect(await groupStatuses(o.orderId)).toEqual(['cancelled']);
    expect(await inventory(o.listingId)).toEqual({ available: 10, reserved: 0 });
  });

  it('never confirms when the currency is not INR', async () => {
    const o = await t.seedPendingOrder();

    await post(capturedBody(o, { currency: 'USD' }));

    expect((await orderRow(o.orderId)).status).toBe('refund_required');
  });

  it('never confirms when the payment belongs to another Razorpay order', async () => {
    const o = await t.seedPendingOrder();
    const other = await t.seedPendingOrder();
    // The webhook finds the order by the payload's order_id, so a payment
    // pointing at `other` can only mismatch through applyCapture directly.
    const orderPayment = t.moduleRef.get(OrderPaymentService);
    const order = (await Order.findByPk(o.orderId))!;

    const outcome = await orderPayment.applyCapture(order, {
      id: 'pay_wrong_order' + randomUUID().slice(0, 6),
      orderId: other.razorpayOrderId,
      amountPaise: o.grandTotalPaise,
      currency: 'INR',
      status: 'captured',
    });

    expect(outcome).toBe('refund_required');
    expect((await orderRow(o.orderId)).status).toBe('refund_required');
    expect((await orderRow(other.orderId)).status).toBe('pending_payment');
  });

  it('returns 2xx and stays confirmed when a notification throws', async () => {
    const o = await t.seedPendingOrder();
    t.notifications.failNext('sendOrderPlaced');

    const res = await post(capturedBody(o));

    expect(res.status).toBeLessThan(300);
    expect((await orderRow(o.orderId)).status).toBe('confirmed');
  });

  it('still notifies the vendor when the customer notification throws', async () => {
    const o = await t.seedPendingOrder();
    t.notifications.failNext('sendOrderPlaced');

    await post(capturedBody(o));

    expect(
      t.notifications.callsTo('sendNewOrderToVendor').filter((c) => c.args[1] === o.groupId),
    ).toHaveLength(1);
  });

  it('processes a webhook without an event id header', async () => {
    const o = await t.seedPendingOrder();

    const res = await post(capturedBody(o));

    expect(res.status).toBeLessThan(300);
    expect((await orderRow(o.orderId)).status).toBe('confirmed');
    const events = await t.query<{ event_id: string | null }>(
      `SELECT event_id FROM payment_events WHERE order_id = :orderId`,
      { orderId: o.orderId },
    );
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBeNull();
  });

  it('rejects a body re-serialised after signing', async () => {
    const o = await t.seedPendingOrder();
    const pretty = JSON.stringify(JSON.parse(capturedBody(o)), null, 2);
    const signature = t.signWebhook(pretty);

    const res = await post(JSON.stringify(JSON.parse(pretty)), { signature });

    expect(res.status).toBe(400);
    expect((await orderRow(o.orderId)).status).toBe('pending_payment');
  });

  it('rejects a tampered amount', async () => {
    const o = await t.seedPendingOrder();
    const original = capturedBody(o);
    const tampered = capturedBody(o, { amount: 1 });

    const res = await post(tampered, { signature: t.signWebhook(original) });

    expect(res.status).toBe(400);
    expect((await orderRow(o.orderId)).status).toBe('pending_payment');
  });

  it('acks an unknown Razorpay order id without changing anything', async () => {
    const o = await t.seedPendingOrder();

    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;

    const res = await post(capturedBody(o, { order_id: 'order_does_not_exist' }), { eventId });

    expect(res.status).toBeLessThan(300);
    expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    expect(
      await t.query(`SELECT 1 FROM payment_events WHERE event_id = :eventId`, { eventId }),
    ).toHaveLength(0);
  });

  it('leaves the order pending on payment.failed', async () => {
    const o = await t.seedPendingOrder();

    const res = await post(capturedBody(o, { event: 'payment.failed' }));

    expect(res.status).toBeLessThan(300);
    expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    expect(await inventory(o.listingId)).toEqual({ available: 10, reserved: o.quantity });
  });
});
