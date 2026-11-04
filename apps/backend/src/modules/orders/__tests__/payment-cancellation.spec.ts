import { randomUUID } from 'crypto';
import request from 'supertest';
import { createPaymentsTestApp, PaymentsTestApp, SeededOrder } from './payments-test-app';
import { OrdersService } from '../orders.service';
import { OrderPaymentService } from '../order-payment.service';
import { ProviderPayment } from '../../payments/payment-provider.interface';

const IN_FLIGHT_COPY = 'A payment is in progress for this order. Try again in a few minutes.';
const UNREACHABLE_COPY = 'Could not verify payment status. Try again shortly.';

// Decision 0054 rule 3: nothing cancels a pending order without first asking
// Razorpay whether a payment exists. Real Postgres, real HTTP routes.
describe('ask Razorpay before cancelling (decision 0054 rule 3)', () => {
  let t: PaymentsTestApp;
  let orders: OrdersService;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
    orders = t.moduleRef.get(OrdersService);
  });

  afterAll(async () => {
    await t.close();
  });

  // The sweep looks at every stale pending order in the table, so orders aged
  // by an earlier test (and deliberately left pending) must not leak into the
  // next one's provider calls.
  beforeEach(async () => {
    await t.query(
      `UPDATE orders SET created_at = now()
       WHERE status = 'pending_payment' AND created_at < now() - interval '20 minutes'`,
    );
  });

  async function age(orderId: string) {
    await t.query(`UPDATE orders SET created_at = now() - interval '21 minutes' WHERE id = :id`, {
      id: orderId,
    });
  }

  function payment(
    o: SeededOrder,
    status: ProviderPayment['status'],
    overrides: Partial<ProviderPayment> = {},
  ): ProviderPayment {
    return {
      id: `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      orderId: o.razorpayOrderId,
      amountPaise: o.grandTotalPaise,
      currency: 'INR',
      status,
      ...overrides,
    };
  }

  async function orderRow(orderId: string) {
    const [row] = await t.query<{ status: string; razorpay_payment_id: string | null }>(
      `SELECT status, razorpay_payment_id FROM orders WHERE id = :orderId`,
      { orderId },
    );
    return row;
  }

  async function reserved(listingId: string) {
    const [row] = await t.query<{ quantity_reserved: number }>(
      `SELECT quantity_reserved FROM inventory WHERE vendor_listing_id = :listingId`,
      { listingId },
    );
    return Number(row.quantity_reserved);
  }

  function statusNotifications(orderId: string, status: string) {
    return t.notifications
      .callsTo('sendOrderStatusChanged')
      .filter((c) => c.args[1] === orderId && c.args[2] === status);
  }

  function customerCancel(orderId: string) {
    return request(t.app.getHttpServer())
      .patch(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${t.customerToken}`);
  }

  function adminCancel(orderId: string) {
    return request(t.app.getHttpServer())
      .patch(`/api/admin/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${t.adminToken}`);
  }

  describe('sweep', () => {
    it('confirms a stale order whose payment Razorpay captured (missed webhook)', async () => {
      const o = await t.seedPendingOrder();
      const captured = payment(o, 'captured');
      t.provider.setOrderPayments(o.razorpayOrderId, [captured]);
      await age(o.orderId);

      await orders.sweepStaleReservations();

      const row = await orderRow(o.orderId);
      expect(row.status).toBe('confirmed');
      expect(row.razorpay_payment_id).toBe(captured.id);
      expect(
        t.notifications.callsTo('sendOrderPlaced').filter((c) => c.args[1] === o.orderId),
      ).toHaveLength(1);
      expect(statusNotifications(o.orderId, 'cancelled')).toHaveLength(0);
    });

    it.each(['authorized', 'created'] as const)(
      'leaves an order pending while a payment is %s',
      async (status) => {
        const o = await t.seedPendingOrder();
        t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, status)]);
        await age(o.orderId);

        await orders.sweepStaleReservations();

        expect((await orderRow(o.orderId)).status).toBe('pending_payment');
        expect(await reserved(o.listingId)).toBe(o.quantity);
        expect(statusNotifications(o.orderId, 'cancelled')).toHaveLength(0);
      },
    );

    it('leaves an order pending when Razorpay is unreachable', async () => {
      const o = await t.seedPendingOrder();
      await age(o.orderId);
      t.provider.failFetchOnce('network');

      await orders.sweepStaleReservations();

      expect((await orderRow(o.orderId)).status).toBe('pending_payment');
      expect(await reserved(o.listingId)).toBe(o.quantity);
      expect(statusNotifications(o.orderId, 'cancelled')).toHaveLength(0);
    });

    it('cancels when every payment failed', async () => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'failed'), payment(o, 'failed')]);
      await age(o.orderId);

      await orders.sweepStaleReservations();

      expect((await orderRow(o.orderId)).status).toBe('cancelled');
      expect(await reserved(o.listingId)).toBe(0);
      expect(statusNotifications(o.orderId, 'cancelled')).toHaveLength(1);
    });

    it('cancels when the only payment was auto-refunded', async () => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'refunded')]);
      await age(o.orderId);

      await orders.sweepStaleReservations();

      expect((await orderRow(o.orderId)).status).toBe('cancelled');
      expect(await reserved(o.listingId)).toBe(0);
    });

    it('cancels an order that never got a Razorpay order id', async () => {
      const o = await t.seedPendingOrder();
      await t.query(`UPDATE orders SET razorpay_order_id = NULL WHERE id = :id`, {
        id: o.orderId,
      });
      await age(o.orderId);

      await orders.sweepStaleReservations();

      expect((await orderRow(o.orderId)).status).toBe('cancelled');
      expect(await reserved(o.listingId)).toBe(0);
    });

    it('two concurrent sweeps cancel once', async () => {
      const o = await t.seedPendingOrder();
      await age(o.orderId);

      await Promise.all([orders.sweepStaleReservations(), orders.sweepStaleReservations()]);

      expect((await orderRow(o.orderId)).status).toBe('cancelled');
      expect(await reserved(o.listingId)).toBe(0);
      expect(statusNotifications(o.orderId, 'cancelled')).toHaveLength(1);
    });
  });

  describe('customer cancel', () => {
    it('refuses while a payment is in progress', async () => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'authorized')]);

      const res = await customerCancel(o.orderId);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(IN_FLIGHT_COPY);
      expect((await orderRow(o.orderId)).status).toBe('pending_payment');
      expect(await reserved(o.listingId)).toBe(o.quantity);
    });

    it('returns 503 when Razorpay is unreachable', async () => {
      const o = await t.seedPendingOrder();
      t.provider.failFetchOnce('timeout');

      const res = await customerCancel(o.orderId);

      expect(res.status).toBe(503);
      expect(res.body.message).toBe(UNREACHABLE_COPY);
      expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    });

    it('returns an order Razorpay captured as confirmed instead of cancelling it', async () => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'captured')]);

      const res = await customerCancel(o.orderId);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
      expect((await orderRow(o.orderId)).status).toBe('confirmed');
      expect(statusNotifications(o.orderId, 'cancelled')).toHaveLength(0);
    });

    it('cancels when Razorpay has no payment for the order', async () => {
      const o = await t.seedPendingOrder();

      const res = await customerCancel(o.orderId);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(await reserved(o.listingId)).toBe(0);
    });

    it('a capture arriving right after a cancel lands in refund_required', async () => {
      const o = await t.seedPendingOrder();
      expect((await customerCancel(o.orderId)).status).toBe(200);
      expect((await orderRow(o.orderId)).status).toBe('cancelled');

      const paymentId = `pay_late${randomUUID().replace(/-/g, '').slice(0, 8)}`;
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'captured', { id: paymentId })]);
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: o.razorpayOrderId,
              amount: o.grandTotalPaise,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });
      const res = await request(t.app.getHttpServer())
        .post('/api/webhooks/razorpay')
        .set('content-type', 'application/json')
        .set('x-razorpay-signature', t.signWebhook(body))
        .send(body);

      expect(res.status).toBeLessThan(300);
      const row = await orderRow(o.orderId);
      expect(row.status).toBe('refund_required');
      expect(row.razorpay_payment_id).toBe(paymentId);
      expect(statusNotifications(o.orderId, 'refund_required')).toHaveLength(1);
    });
  });

  describe('admin cancel', () => {
    it('refuses while a payment is in progress', async () => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'created')]);

      const res = await adminCancel(o.orderId);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(IN_FLIGHT_COPY);
      expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    });

    it('returns 503 when Razorpay is unreachable', async () => {
      const o = await t.seedPendingOrder();
      t.provider.failFetchOnce('server');

      const res = await adminCancel(o.orderId);

      expect(res.status).toBe(503);
      expect(res.body.message).toBe(UNREACHABLE_COPY);
      expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    });

    it('confirms an order Razorpay captured and tells the admin to refund it', async () => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'captured')]);

      const res = await adminCancel(o.orderId);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('order was paid; refund it instead');
      expect((await orderRow(o.orderId)).status).toBe('confirmed');
    });

    it.each(['refund_required', 'refund_pending'])(
      'refuses to cancel a %s order',
      async (status) => {
        const o = await t.seedPendingOrder();
        await t.query(
          `UPDATE orders SET status = :status, razorpay_payment_id = :paymentId WHERE id = :id`,
          { status, id: o.orderId, paymentId: `pay_${randomUUID().replace(/-/g, '')}` },
        );

        const res = await adminCancel(o.orderId);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('refund this order before cancelling it');
        expect((await orderRow(o.orderId)).status).toBe(status);
      },
    );

    it('cancels a pending order with no payment and releases its stock', async () => {
      const o = await t.seedPendingOrder();

      const res = await adminCancel(o.orderId);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(await reserved(o.listingId)).toBe(0);
    });

    it('cancelling a refunded order does not release stock', async () => {
      const o = await t.seedPendingOrder();
      await t.query(`UPDATE orders SET status = 'refunded' WHERE id = :id`, { id: o.orderId });

      const res = await adminCancel(o.orderId);

      expect(res.status).toBe(200);
      expect(await reserved(o.listingId)).toBe(o.quantity);
    });
  });

  it('releaseAndCancel never drives quantity_reserved below zero', async () => {
    const o = await t.seedPendingOrder();
    await t.query(`UPDATE inventory SET quantity_reserved = 0 WHERE vendor_listing_id = :id`, {
      id: o.listingId,
    });

    expect(await t.moduleRef.get(OrderPaymentService).releaseAndCancel(o.orderId)).toBe(true);

    expect(await reserved(o.listingId)).toBe(0);
    expect((await orderRow(o.orderId)).status).toBe('cancelled');
  });
});
