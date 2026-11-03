import { randomUUID } from 'crypto';
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
    });

    it('ignores a second, different payment on an already confirmed order', async () => {
      const o = await t.seedPendingOrder();
      await service.applyCapture(await load(o), payment(o, 'captured'));

      expect(await service.applyCapture(await load(o), payment(o, 'captured'))).toBe('ignored');
      expect(await status(o)).toBe('confirmed');
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
      expect(await service.markRefundRequired(o.orderId, 'pay_x')).toBe(false);

      await service.releaseAndCancel(o.orderId);
      const paymentId = `pay_${randomUUID().slice(0, 10)}`;
      expect(await service.markRefundRequired(o.orderId, paymentId)).toBe(true);
      expect(await service.markRefundRequired(o.orderId, 'pay_other')).toBe(false);
      expect(await status(o)).toBe('refund_required');
    });
  });
});
