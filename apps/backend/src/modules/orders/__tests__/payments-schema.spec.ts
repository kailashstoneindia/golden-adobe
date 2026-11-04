import { randomUUID } from 'crypto';
import { createPaymentsTestApp, PaymentsTestApp } from './payments-test-app';

// Decision 0054 — the constraints that make the payment flow safe are
// enforced by Postgres, not by application code, so they are tested against
// the real schema.
describe('payments schema (decision 0054)', () => {
  let t: PaymentsTestApp;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function insertRefund(
    orderId: string,
    overrides: Partial<{
      rail: string;
      paymentId: string | null;
      idempotencyKey: string;
      receipt: string;
    }> = {},
  ) {
    return t.query(
      `INSERT INTO refunds
         (order_id, rail, razorpay_payment_id, amount_paise, idempotency_key,
          receipt, status, reason, created_by)
       VALUES (:orderId, :rail, :paymentId, 100, :idempotencyKey, :receipt,
          'requested', 'test', :createdBy)`,
      {
        orderId,
        rail: overrides.rail ?? 'razorpay',
        paymentId: overrides.paymentId === undefined ? 'pay_x' : overrides.paymentId,
        idempotencyKey: overrides.idempotencyKey ?? randomUUID().replace(/-/g, ''),
        receipt: overrides.receipt ?? `rf_${randomUUID().replace(/-/g, '').slice(0, 30)}`,
        createdBy: t.adminUserId,
      },
    );
  }

  it('rejects an order status outside the six allowed values', async () => {
    const o = await t.seedPendingOrder();
    await expect(
      t.query(`UPDATE orders SET status = 'paid' WHERE id = :id`, { id: o.orderId }),
    ).rejects.toThrow(/orders_status_check/);
  });

  it('rejects the same razorpay_payment_id on two orders', async () => {
    const a = await t.seedPendingOrder();
    const b = await t.seedPendingOrder();
    const paymentId = `pay_dup_${randomUUID().slice(0, 8)}`;
    await t.query(`UPDATE orders SET razorpay_payment_id = :p WHERE id = :id`, {
      p: paymentId,
      id: a.orderId,
    });
    await expect(
      t.query(`UPDATE orders SET razorpay_payment_id = :p WHERE id = :id`, {
        p: paymentId,
        id: b.orderId,
      }),
    ).rejects.toThrow(/orders_razorpay_payment_id_unique/);
  });

  it('rejects the same razorpay_order_id on two orders', async () => {
    const a = await t.seedPendingOrder();
    const b = await t.seedPendingOrder();
    await expect(
      t.query(`UPDATE orders SET razorpay_order_id = :r WHERE id = :id`, {
        r: a.razorpayOrderId,
        id: b.orderId,
      }),
    ).rejects.toThrow(/orders_razorpay_order_id_unique/);
  });

  it('rejects a razorpay-rail refund without a payment id', async () => {
    const o = await t.seedPendingOrder();
    await expect(insertRefund(o.orderId, { rail: 'razorpay', paymentId: null })).rejects.toThrow(
      /refunds_razorpay_payment_check/,
    );
  });

  it('accepts a manual_payout refund without a payment id', async () => {
    const o = await t.seedPendingOrder();
    await expect(
      insertRefund(o.orderId, { rail: 'manual_payout', paymentId: null }),
    ).resolves.toBeDefined();
  });

  it('rejects a duplicate refund idempotency_key', async () => {
    const o = await t.seedPendingOrder();
    const key = randomUUID().replace(/-/g, '');
    await insertRefund(o.orderId, { idempotencyKey: key });
    await expect(insertRefund(o.orderId, { idempotencyKey: key })).rejects.toThrow(
      /refunds_idempotency_key_key|unique/,
    );
  });

  it('rejects a duplicate payment_events.event_id', async () => {
    const o = await t.seedPendingOrder();
    const eventId = `evt_${randomUUID().slice(0, 8)}`;
    const insert = () =>
      t.query(
        `INSERT INTO payment_events (order_id, event_type, raw_payload, event_id)
         VALUES (:orderId, 'payment.captured', '{}', :eventId)`,
        { orderId: o.orderId, eventId },
      );
    await insert();
    await expect(insert()).rejects.toThrow(/payment_events_event_id_unique/);
  });
});
