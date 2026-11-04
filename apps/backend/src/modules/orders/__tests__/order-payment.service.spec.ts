import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { createPaymentsTestApp, PaymentsTestApp, SeededOrder } from './payments-test-app';
import { OrderPaymentService } from '../order-payment.service';
import { Order } from '../models/order.model';
import { ProviderPayment, ProviderPaymentStatus } from '../../payments/payment-provider.interface';

// Decision 0054 rules 2-4: the single capture path and its helpers, against
// real Postgres.
describe('OrderPaymentService (decision 0054)', () => {
  let t: PaymentsTestApp;
  let service: OrderPaymentService;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
    service = t.moduleRef.get(OrderPaymentService);
  });

  afterAll(async () => {
    await t.close();
  });

  function payment(o: SeededOrder, status: ProviderPaymentStatus): ProviderPayment {
    return {
      id: `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      orderId: o.razorpayOrderId,
      amountPaise: o.grandTotalPaise,
      currency: 'INR',
      status,
    };
  }

  async function load(o: SeededOrder): Promise<Order> {
    return (await Order.findByPk(o.orderId))!;
  }

  async function status(o: SeededOrder): Promise<string> {
    const [row] = await t.query<{ status: string }>(`SELECT status FROM orders WHERE id = :id`, {
      id: o.orderId,
    });
    return row.status;
  }

  describe('applyCapture', () => {
    it('confirms a matching capture, then reports already_confirmed for the same payment', async () => {
      const o = await t.seedPendingOrder();
      const p = payment(o, 'captured');

      expect(await service.applyCapture(await load(o), p)).toBe('confirmed');
      expect(await service.applyCapture(await load(o), p)).toBe('already_confirmed');
      expect(await status(o)).toBe('confirmed');
      // Decision 0054: what Razorpay captured is stored for refunds to use.
      const [row] = await t.query<{ captured_paise: string }>(
        `SELECT captured_paise FROM orders WHERE id = :id`,
        { id: o.orderId },
      );
      expect(Number(row.captured_paise)).toBe(o.grandTotalPaise);
    });

    it('ignores a second, different payment on an already confirmed order', async () => {
      const o = await t.seedPendingOrder();
      await service.applyCapture(await load(o), payment(o, 'captured'));
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const second = payment(o, 'captured');

      try {
        expect(await service.applyCapture(await load(o), second)).toBe('ignored');
        expect(await status(o)).toBe('confirmed');
        // Decision 0054 Consequences: a second captured payment is logged at
        // error level, with the payment and order ids, so it gets noticed.
        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(second.id));
        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(o.orderId));
        expect(warnLog).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
        warnLog.mockRestore();
      }
    });

    it('releases the reservation of a pending order whose payment does not match', async () => {
      const o = await t.seedPendingOrder();
      const bad = { ...payment(o, 'captured'), amountPaise: o.grandTotalPaise - 1 };

      expect(await service.applyCapture(await load(o), bad)).toBe('refund_required');

      const [inv] = await t.query<{ quantity_reserved: number }>(
        `SELECT quantity_reserved FROM inventory WHERE vendor_listing_id = :id`,
        { id: o.listingId },
      );
      expect(Number(inv.quantity_reserved)).toBe(0);
      const [row] = await t.query<{ razorpay_payment_id: string }>(
        `SELECT razorpay_payment_id FROM orders WHERE id = :id`,
        { id: o.orderId },
      );
      expect(row.razorpay_payment_id).toBe(bad.id);
    });

    it('lands a mismatched capture on a pending order on refund_required in one step', async () => {
      const o = await t.seedPendingOrder();
      const bad = { ...payment(o, 'captured'), amountPaise: o.grandTotalPaise + 1 };
      // The separate cancelled -> refund_required step is what a crash could
      // strand; the pending path must not use it at all.
      const separateMark = jest.spyOn(service, 'markRefundRequired');

      try {
        expect(await service.applyCapture(await load(o), bad)).toBe('refund_required');
        expect(separateMark).not.toHaveBeenCalled();
      } finally {
        separateMark.mockRestore();
      }

      const [row] = await t.query<{ status: string; razorpay_payment_id: string }>(
        `SELECT status, razorpay_payment_id FROM orders WHERE id = :id`,
        { id: o.orderId },
      );
      expect(row).toEqual({ status: 'refund_required', razorpay_payment_id: bad.id });
      const [inv] = await t.query<{ quantity_available: number; quantity_reserved: number }>(
        `SELECT quantity_available, quantity_reserved FROM inventory WHERE vendor_listing_id = :id`,
        { id: o.listingId },
      );
      expect([Number(inv.quantity_available), Number(inv.quantity_reserved)]).toEqual([10, 0]);
      const groups = await t.query<{ status: string }>(
        `SELECT status FROM order_vendor_group WHERE order_id = :id`,
        { id: o.orderId },
      );
      expect(groups.map((g) => g.status)).toEqual(['cancelled']);
    });

    it('is idempotent for a replayed refund_required capture: same outcome, one notification, no error', async () => {
      const mismatched = await t.seedPendingOrder();
      const bad = {
        ...payment(mismatched, 'captured'),
        amountPaise: mismatched.grandTotalPaise + 1,
      };
      const late = await t.seedPendingOrder();
      await service.releaseAndCancel(late.orderId);
      const latePayment = payment(late, 'captured');
      const sent = () =>
        t.notifications
          .callsTo('sendOrderStatusChanged')
          .filter((c) => c.args[1] === mismatched.orderId || c.args[1] === late.orderId).length;
      const before = sent();
      const errors = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      try {
        expect(await service.applyCapture(await load(mismatched), bad)).toBe('refund_required');
        expect(await service.applyCapture(await load(late), latePayment)).toBe('refund_required');
        errors.mockClear();
        // Replays: the order is already refund_required for this very payment.
        expect(await service.applyCapture(await load(mismatched), bad)).toBe('refund_required');
        expect(await service.applyCapture(await load(late), latePayment)).toBe('refund_required');
        // The mismatch itself is still reported on every delivery, but a
        // replay must not be mistaken for an unrecordable payment.
        expect(
          errors.mock.calls.filter(([msg]) => String(msg).includes('reconcile manually')),
        ).toHaveLength(0);
      } finally {
        errors.mockRestore();
      }
      expect(sent() - before).toBe(2);
    });

    it('handles concurrent duplicate deliveries of a mismatched capture without a false error', async () => {
      const o = await t.seedPendingOrder();
      const bad = { ...payment(o, 'captured'), amountPaise: o.grandTotalPaise + 1 };
      const notified = () =>
        t.notifications.callsTo('sendOrderStatusChanged').filter((c) => c.args[1] === o.orderId)
          .length;
      const before = notified();
      const errors = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
      const stale = await load(o);

      try {
        const outcomes = await Promise.all([
          service.applyCapture(stale, bad),
          service.applyCapture(stale, bad),
        ]);
        expect(outcomes).toEqual(['refund_required', 'refund_required']);
        expect(
          errors.mock.calls.filter(([msg]) => String(msg).includes('reconcile manually')),
        ).toHaveLength(0);
      } finally {
        errors.mockRestore();
      }
      expect(notified() - before).toBe(1);
    });

    it('resolves a capture racing a cancellation to exactly one consistent outcome', async () => {
      for (let i = 0; i < 5; i++) {
        const o = await t.seedPendingOrder();
        const p = payment(o, 'captured');
        const pending = await load(o);

        const [outcome] = await Promise.all([
          service.applyCapture(pending, p),
          service.releaseAndCancel(o.orderId),
        ]);

        const [row] = await t.query<{ status: string; razorpay_payment_id: string | null }>(
          `SELECT status, razorpay_payment_id FROM orders WHERE id = :id`,
          { id: o.orderId },
        );
        const [inv] = await t.query<{ quantity_available: number; quantity_reserved: number }>(
          `SELECT quantity_available, quantity_reserved FROM inventory WHERE vendor_listing_id = :id`,
          { id: o.listingId },
        );
        const stock = [Number(inv.quantity_available), Number(inv.quantity_reserved)];
        expect(['confirmed', 'refund_required']).toContain(row.status);
        expect(row.razorpay_payment_id).toBe(p.id);
        expect(outcome).toBe(row.status);
        // Confirmed consumed the unit; refund_required released it untouched.
        expect(stock).toEqual(row.status === 'confirmed' ? [10 - o.quantity, 0] : [10, 0]);
      }
    });

    it('tells the customer when a late capture needs a refund', async () => {
      const o = await t.seedPendingOrder();
      await service.releaseAndCancel(o.orderId);
      const before = t.notifications.callsTo('sendOrderStatusChanged').length;

      await service.applyCapture(await load(o), payment(o, 'captured'));

      const calls = t.notifications.callsTo('sendOrderStatusChanged');
      expect(calls).toHaveLength(before + 1);
      expect(calls[calls.length - 1].args.slice(1)).toEqual([o.orderId, 'refund_required']);
    });
  });

  describe('checkProviderPayments', () => {
    it('returns none for an order with no Razorpay order id', async () => {
      const o = await t.seedPendingOrder();
      await t.query(`UPDATE orders SET razorpay_order_id = NULL WHERE id = :id`, { id: o.orderId });

      expect(await service.checkProviderPayments(await load(o))).toEqual({ kind: 'none' });
    });

    it('returns none when Razorpay has no payments or only failed ones', async () => {
      const o = await t.seedPendingOrder();
      expect(await service.checkProviderPayments(await load(o))).toEqual({ kind: 'none' });

      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'failed')]);
      expect(await service.checkProviderPayments(await load(o))).toEqual({ kind: 'none' });
    });

    it.each(['created', 'authorized'] as const)('returns in_flight for a %s payment', async (s) => {
      const o = await t.seedPendingOrder();
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'failed'), payment(o, s)]);

      expect(await service.checkProviderPayments(await load(o))).toEqual({ kind: 'in_flight' });
    });

    it('prefers a captured payment over an in-flight one', async () => {
      const o = await t.seedPendingOrder();
      const captured = payment(o, 'captured');
      t.provider.setOrderPayments(o.razorpayOrderId, [payment(o, 'authorized'), captured]);

      expect(await service.checkProviderPayments(await load(o))).toEqual({
        kind: 'captured',
        payment: captured,
      });
    });

    it('returns unavailable when Razorpay cannot be reached', async () => {
      const o = await t.seedPendingOrder();
      t.provider.failFetchOnce('timeout');

      expect(await service.checkProviderPayments(await load(o))).toEqual({ kind: 'unavailable' });
    });
  });

  describe('releaseAndCancel', () => {
    it('never drives quantity_reserved below zero', async () => {
      const o = await t.seedPendingOrder();
      await t.query(`UPDATE inventory SET quantity_reserved = 0 WHERE vendor_listing_id = :id`, {
        id: o.listingId,
      });

      expect(await service.releaseAndCancel(o.orderId)).toBe(true);

      const [inv] = await t.query<{ quantity_reserved: number }>(
        `SELECT quantity_reserved FROM inventory WHERE vendor_listing_id = :id`,
        { id: o.listingId },
      );
      expect(Number(inv.quantity_reserved)).toBe(0);
    });

    it('returns false for an order that is no longer pending_payment', async () => {
      const o = await t.seedPendingOrder();
      await service.applyCapture(await load(o), payment(o, 'captured'));

      expect(await service.releaseAndCancel(o.orderId)).toBe(false);
      expect(await status(o)).toBe('confirmed');
    });
  });

  describe('markRefundRequired', () => {
    it('only applies to a cancelled order that has no payment id yet', async () => {
      const o = await t.seedPendingOrder();
      expect(await service.markRefundRequired(o.orderId, 'pay_x', 1000)).toBe(false);

      await service.releaseAndCancel(o.orderId);
      const paymentId = `pay_${randomUUID().slice(0, 10)}`;
      expect(await service.markRefundRequired(o.orderId, paymentId, 1000)).toBe(true);
      expect(await service.markRefundRequired(o.orderId, 'pay_other', 1000)).toBe(false);
      expect(await status(o)).toBe('refund_required');
    });
  });
});
