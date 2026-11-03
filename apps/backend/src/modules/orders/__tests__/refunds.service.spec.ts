import { randomUUID } from 'crypto';
import request from 'supertest';
import { Logger } from '@nestjs/common';
import { createPaymentsTestApp, PaymentsTestApp, SeededOrder } from './payments-test-app';
import { RefundsService } from '../refunds.service';
import { OrdersService } from '../orders.service';
import { OrderPaymentService } from '../order-payment.service';
import { Order } from '../models/order.model';
import { OrderVendorGroupStatus } from '../models/order-vendor-group.model';
import { ProviderRequestError } from '../../payments/payment-provider.interface';

// Decision 0054 rules 5-6, against real Postgres and the fake provider.
describe('RefundsService (decision 0054)', () => {
  let t: PaymentsTestApp;
  let service: RefundsService;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
    service = t.moduleRef.get(RefundsService);
  });

  afterAll(async () => {
    await t.close();
  });

  // The error paths below log on purpose (decision 0054); keep the output clean.
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Confirms a seeded order the way production does: a signed webhook.
  async function confirmedOrder(): Promise<{ o: SeededOrder; paymentId: string }> {
    const o = await t.seedPendingOrder();
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
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
    await request(t.app.getHttpServer())
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', t.signWebhook(body))
      .send(body)
      .expect(201);
    expect(await orderStatus(o)).toBe('confirmed');
    return { o, paymentId };
  }

  // A payment that cannot confirm its order: the order lands on refund_required.
  async function lateOrder(
    deltaPaise = -1,
  ): Promise<{ o: SeededOrder; paymentId: string; capturedPaise: number }> {
    const o = await t.seedPendingOrder();
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const order = (await Order.findByPk(o.orderId))!;
    const outcome = await t.moduleRef.get(OrderPaymentService).applyCapture(order, {
      id: paymentId,
      orderId: o.razorpayOrderId,
      amountPaise: o.grandTotalPaise + deltaPaise,
      currency: 'INR',
      status: 'captured',
    });
    expect(outcome).toBe('refund_required');
    return { o, paymentId, capturedPaise: o.grandTotalPaise + deltaPaise };
  }

  async function orderStatus(o: SeededOrder): Promise<string> {
    const [row] = await t.query<{ status: string }>(`SELECT status FROM orders WHERE id = :id`, {
      id: o.orderId,
    });
    return row.status;
  }

  type RefundRow = {
    id: string;
    status: string;
    razorpay_refund_id: string | null;
    idempotency_key: string;
    receipt: string;
    amount_paise: string;
  };
  async function refundRows(o: SeededOrder): Promise<RefundRow[]> {
    return t.query<RefundRow>(`SELECT * FROM refunds WHERE order_id = :id ORDER BY created_at`, {
      id: o.orderId,
    });
  }

  async function ageRefunds(o: SeededOrder): Promise<void> {
    await t.query(
      `UPDATE refunds SET created_at = now() - interval '6 minutes',
         updated_at = now() - interval '6 minutes' WHERE order_id = :id`,
      { id: o.orderId },
    );
  }

  const serverError = () => new ProviderRequestError('server', 'razorpay is down', 503);

  it('submits a full refund once with a stored 32-char key and receipt rf_<hex>_1', async () => {
    const { o, paymentId } = await confirmedOrder();
    t.provider.refundOutcome('pending');

    const dto = await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'customer changed mind',
    });

    const call = t.provider.createRefundCalls.at(-1)!;
    expect(t.provider.createRefundCalls.filter((c) => c.paymentId === paymentId)).toHaveLength(1);
    expect(call.idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
    expect(call.receipt).toBe(`rf_${o.orderId.replace(/-/g, '')}_1`);
    expect(call.paymentId).toBe(paymentId);
    expect(call.amountPaise).toBe(o.grandTotalPaise);

    expect(await orderStatus(o)).toBe('refund_pending');
    const [row] = await refundRows(o);
    expect(row.status).toBe('submitted');
    expect(row.razorpay_refund_id).toMatch(/^rfnd_fake_/);
    expect(row.idempotency_key).toBe(call.idempotencyKey);
    expect(row.receipt).toBe(call.receipt);
    expect(dto).toMatchObject({
      status: 'submitted',
      amountPaise: o.grandTotalPaise,
      razorpayRefundId: row.razorpay_refund_id,
    });
  });

  it('marks the order refunded when Razorpay processes the refund immediately', async () => {
    const { o } = await confirmedOrder();
    t.notifications.calls.length = 0;

    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'customer changed mind',
    });

    expect(await orderStatus(o)).toBe('refunded');
    expect((await refundRows(o))[0].status).toBe('processed');
    const refundedCalls = t.notifications
      .callsTo('sendOrderStatusChanged')
      .filter((c) => c.args[1] === o.orderId && c.args[2] === 'refunded');
    expect(refundedCalls).toHaveLength(1);
  });

  it('two concurrent full refunds create one Razorpay refund', async () => {
    const { o, paymentId } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    const input = { orderId: o.orderId, adminUserId: t.adminUserId, reason: 'duplicate click' };

    const results = await Promise.allSettled([
      service.requestRefund(input),
      service.requestRefund(input),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toBe('refund exceeds the refundable amount');
    expect(t.provider.createRefundCalls.filter((c) => c.paymentId === paymentId)).toHaveLength(1);
    expect(await refundRows(o)).toHaveLength(1);
  });

  // Decision 0054 rule 5: the admin's request makes one attempt (so it is not
  // held for a minute); the retries run in the sync job.
  it('makes one attempt inline, then adopts the refund Razorpay created by its receipt', async () => {
    const { o, paymentId } = await confirmedOrder();
    t.provider.refundOutcome({ error: 'timeout', afterProcessing: true });

    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'timeout case',
    });

    const calls = t.provider.createRefundCalls.filter((c) => c.paymentId === paymentId);
    expect(calls).toHaveLength(1);
    const fakeRefunds = await t.provider.fetchRefunds(paymentId);
    expect(fakeRefunds).toHaveLength(1);
    const [row] = await refundRows(o);
    // The fake reports an afterProcessing refund as already processed.
    expect(row.status).toBe('processed');
    expect(row.razorpay_refund_id).toBe(fakeRefunds[0].id);
  });

  it('answers 202 after one inline attempt when Razorpay times out, and the sync job retries three times', async () => {
    const { o } = await confirmedOrder();
    const spy = jest
      .spyOn(t.provider, 'createRefund')
      .mockRejectedValue(new ProviderRequestError('timeout', 'razorpay timed out'));

    await request(t.app.getHttpServer())
      .post(`/api/admin/orders/${o.orderId}/refund`)
      .set('Authorization', `Bearer ${t.adminToken}`)
      .send({ reason: 'single timeout' })
      .expect(202);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((await refundRows(o))[0].status).toBe('requested');
    await ageRefunds(o);

    await service.syncRefunds();

    expect(spy).toHaveBeenCalledTimes(1 + 3);
    expect((await refundRows(o))[0].status).toBe('requested');

    // Resolve the aged row now that Razorpay answers again, so no later test's
    // syncRefunds picks it up.
    spy.mockRestore();
    await service.syncRefunds();
    expect((await refundRows(o))[0].status).toBe('processed');
  }, 15_000);

  it('adopts an existing refund by receipt after the inline attempt fails', async () => {
    const { o, paymentId } = await confirmedOrder();
    // Razorpay holds a refund carrying our receipt although every response was lost.
    const existing = await t.provider.createRefund({
      paymentId,
      amountPaise: o.grandTotalPaise,
      receipt: `rf_${o.orderId.replace(/-/g, '')}_1`,
      idempotencyKey: 'a'.repeat(32),
      notes: {},
    });
    t.provider.setRefundStatus(existing.id, 'pending');
    const spy = jest.spyOn(t.provider, 'createRefund').mockRejectedValue(serverError());

    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'lost responses',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [row] = await refundRows(o);
    expect(row.status).toBe('submitted');
    expect(row.razorpay_refund_id).toBe(existing.id);
    expect(await orderStatus(o)).toBe('refund_pending');
  });

  it('adopts the refund Razorpay already created when the attempt gets a client error', async () => {
    const { o, paymentId } = await confirmedOrder();
    // An earlier attempt created the refund; this one is answered with an
    // error whose wording we do not recognise as a conflict.
    const existing = await t.provider.createRefund({
      paymentId,
      amountPaise: o.grandTotalPaise,
      receipt: `rf_${o.orderId.replace(/-/g, '')}_1`,
      idempotencyKey: 'b'.repeat(32),
      notes: {},
    });
    jest
      .spyOn(t.provider, 'createRefund')
      .mockRejectedValue(new ProviderRequestError('client', 'something unexpected', 400));

    const dto = await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'client error after create',
    });

    const [row] = await refundRows(o);
    expect(row.status).toBe('processed');
    expect(row.razorpay_refund_id).toBe(existing.id);
    expect(dto.status).toBe('processed');
    expect(await orderStatus(o)).toBe('refunded');
  });

  it('keeps a client-rejected refund requested when Razorpay cannot be asked about it', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome({ error: 'client' });
    t.provider.failFetchOnce('network');

    // Not a failure: Razorpay may have created the refund, so the caller is
    // told it is pending rather than that it failed.
    const dto = await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'cannot verify',
    });

    expect(dto.status).toBe('requested');
    expect((await refundRows(o))[0].status).toBe('requested');
    expect(await orderStatus(o)).toBe('refund_pending');
  });

  it('leaves the row requested when Razorpay never answers', async () => {
    const { o } = await confirmedOrder();
    jest.spyOn(t.provider, 'createRefund').mockRejectedValue(serverError());

    const dto = await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'razorpay outage',
    });

    expect(dto.status).toBe('requested');
    expect((await refundRows(o))[0].status).toBe('requested');
    expect(await orderStatus(o)).toBe('refund_pending');
  }, 15_000);

  it('keeps a partial refund out of the order status', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'damaged item',
      amountPaise: 20000,
    });
    expect(await orderStatus(o)).toBe('confirmed');

    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'too much',
        amountPaise: 90000,
      }),
    ).rejects.toThrow('refund exceeds the refundable amount');
    expect(await refundRows(o)).toHaveLength(1);
  });

  it('records a partial refund against its vendor group and rejects a foreign group', async () => {
    const { o } = await confirmedOrder();
    const other = await t.seedPendingOrder();
    t.provider.refundOutcome('pending');

    const dto = await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'one item',
      amountPaise: 20000,
      vendorGroupId: o.groupId,
    });
    expect(dto.orderVendorGroupId).toBe(o.groupId);

    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'wrong group',
        amountPaise: 20000,
        vendorGroupId: other.groupId,
      }),
    ).rejects.toThrow('vendor group does not belong to this order');
  });

  // Decision 0054 rule 5: a refund tagged to a vendor group cannot exceed what
  // that group was paid, even when the order as a whole has more left.
  it("caps a vendor-group refund at the group's share of the order", async () => {
    const { o } = await confirmedOrder();
    await t.query(
      `UPDATE order_vendor_group SET subtotal = 200, loading_unloading_fee = 0 WHERE id = :id`,
      { id: o.groupId },
    );
    t.provider.refundOutcome('pending');
    const refund = (amountPaise: number) =>
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'group cap',
        amountPaise,
        vendorGroupId: o.groupId,
      });

    await expect(refund(70000)).rejects.toThrow(
      "refund exceeds this vendor group's refundable amount",
    );
    expect(await refundRows(o)).toHaveLength(0);

    await expect(refund(20000)).resolves.toMatchObject({ amountPaise: 20000 });
    await expect(refund(100)).rejects.toThrow(
      "refund exceeds this vendor group's refundable amount",
    );
    expect(await refundRows(o)).toHaveLength(1);
  });

  it("counts the group's loading fee in its cap and ignores its failed refunds", async () => {
    const { o } = await confirmedOrder();
    await t.query(
      `UPDATE order_vendor_group SET subtotal = 200, loading_unloading_fee = 50 WHERE id = :id`,
      { id: o.groupId },
    );
    t.provider.refundOutcome({ error: 'client' });
    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'will fail',
        amountPaise: 25000,
        vendorGroupId: o.groupId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await refundRows(o))[0].status).toBe('failed');
    t.provider.refundOutcome('pending');

    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'full group share',
        amountPaise: 25000,
        vendorGroupId: o.groupId,
      }),
    ).resolves.toMatchObject({ amountPaise: 25000 });
  });

  it('ignores failed refunds when computing the refundable amount', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome({ error: 'client' });
    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'first try',
      }),
    ).rejects.toThrow();
    t.provider.refundOutcome('pending');

    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'second try',
      amountPaise: o.grandTotalPaise,
    });

    const rows = await refundRows(o);
    expect(rows.map((r) => r.status)).toEqual(['failed', 'submitted']);
    expect(rows[1].receipt).toBe(`rf_${o.orderId.replace(/-/g, '')}_2`);
    expect(await orderStatus(o)).toBe('refund_pending');
  });

  it('requires a late payment to be refunded in full', async () => {
    const { o } = await lateOrder();

    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'late payment',
        amountPaise: 1000,
      }),
    ).rejects.toThrow('this order must be refunded in full');
    expect(await refundRows(o)).toHaveLength(0);
  });

  it.each([
    ['underpaid', -1],
    ['overpaid', 1],
  ])(
    'refunds exactly what Razorpay captured for an %s late payment, then settles after sync',
    async (_label, delta) => {
      const { o, paymentId, capturedPaise } = await lateOrder(delta);
      const [{ captured_paise }] = await t.query<{ captured_paise: string }>(
        `SELECT captured_paise FROM orders WHERE id = :id`,
        { id: o.orderId },
      );
      expect(Number(captured_paise)).toBe(capturedPaise);
      t.provider.refundOutcome('pending');

      await service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'late payment',
      });

      expect(t.provider.createRefundCalls.at(-1)).toMatchObject({
        paymentId,
        amountPaise: capturedPaise,
      });
      expect(await orderStatus(o)).toBe('refund_pending');
      const [row] = await refundRows(o);
      t.provider.setRefundStatus(row.razorpay_refund_id!, 'processed');
      await ageRefunds(o);

      await service.syncRefunds();

      expect(await orderStatus(o)).toBe('refunded');
    },
  );

  it('lets a failed full refund be retried for the part a partial refund left', async () => {
    const { o } = await confirmedOrder();
    // 20000 is refunded and settled; the order stays confirmed.
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'damaged item',
      amountPaise: 20000,
    });
    expect(await orderStatus(o)).toBe('confirmed');
    // The rest is refunded, then Razorpay fails it.
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'cancel the order',
    });
    const rows = await refundRows(o);
    expect(Number(rows[1].amount_paise)).toBe(o.grandTotalPaise - 20000);
    t.provider.setRefundStatus(rows[1].razorpay_refund_id!, 'failed');
    await ageRefunds(o);
    await service.syncRefunds();
    expect(await orderStatus(o)).toBe('refund_required');

    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'wrong amount',
        amountPaise: 1000,
      }),
    ).rejects.toThrow('this order must be refunded in full');
    t.provider.refundOutcome('pending');
    const retry = await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'try again',
    });

    expect(retry.amountPaise).toBe(o.grandTotalPaise - 20000);
    expect(await orderStatus(o)).toBe('refund_pending');
  });

  it('rolls the refund status back when the order projection fails, so the next sync retries', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'projection blip',
    });
    const [row] = await refundRows(o);
    t.provider.setRefundStatus(row.razorpay_refund_id!, 'processed');
    await ageRefunds(o);
    jest
      .spyOn(service as unknown as { project: () => Promise<unknown> }, 'project')
      .mockRejectedValueOnce(new Error('db blip'));

    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('submitted');
    expect(await orderStatus(o)).toBe('refund_pending');

    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('processed');
    expect(await orderStatus(o)).toBe('refunded');
  });

  it('marks a client-rejected refund failed and returns the order to refund_required', async () => {
    const { o } = await lateOrder();
    t.provider.refundOutcome({ error: 'client' });

    await expect(
      service.requestRefund({
        orderId: o.orderId,
        adminUserId: t.adminUserId,
        reason: 'razorpay says no',
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect((await refundRows(o))[0].status).toBe('failed');
    expect(await orderStatus(o)).toBe('refund_required');
  });

  it('rejects an order with no captured payment, and an unknown order', async () => {
    const o = await t.seedPendingOrder();

    await expect(
      service.requestRefund({ orderId: o.orderId, adminUserId: t.adminUserId, reason: 'nothing' }),
    ).rejects.toThrow('order has no captured payment to refund');
    await expect(
      service.requestRefund({ orderId: randomUUID(), adminUserId: t.adminUserId, reason: 'nope' }),
    ).rejects.toThrow('order not found');
  });

  it('sync marks processed refunds and the order refunded', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'sync processed',
    });
    const [row] = await refundRows(o);
    t.provider.setRefundStatus(row.razorpay_refund_id!, 'processed');
    await ageRefunds(o);
    t.notifications.calls.length = 0;

    await service.syncRefunds();
    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('processed');
    expect(await orderStatus(o)).toBe('refunded');
    const refundedCalls = t.notifications
      .callsTo('sendOrderStatusChanged')
      .filter((c) => c.args[1] === o.orderId && c.args[2] === 'refunded');
    expect(refundedCalls).toHaveLength(1);
  });

  it('sync leaves a refund that is still pending at Razorpay alone', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'still pending',
    });
    await ageRefunds(o);

    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('submitted');
    expect(await orderStatus(o)).toBe('refund_pending');
  });

  it('sync ignores refunds younger than five minutes', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'fresh',
    });
    const [row] = await refundRows(o);
    t.provider.setRefundStatus(row.razorpay_refund_id!, 'processed');

    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('submitted');
  });

  it('sync returns the order to refund_required when the refund failed', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'sync failed',
    });
    const [row] = await refundRows(o);
    t.provider.setRefundStatus(row.razorpay_refund_id!, 'failed');
    await ageRefunds(o);

    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('failed');
    expect(await orderStatus(o)).toBe('refund_required');
  });

  it('sync re-sends a requested refund with its stored key', async () => {
    const { o, paymentId } = await confirmedOrder();
    const spy = jest.spyOn(t.provider, 'createRefund').mockRejectedValue(serverError());
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'resend me',
    });
    spy.mockRestore();
    const [before] = await refundRows(o);
    expect(before.status).toBe('requested');
    await ageRefunds(o);
    t.provider.createRefundCalls.length = 0;

    await service.syncRefunds();

    const calls = t.provider.createRefundCalls.filter((c) => c.paymentId === paymentId);
    expect(calls).toHaveLength(1);
    expect(calls[0].idempotencyKey).toBe(before.idempotency_key);
    expect(calls[0].receipt).toBe(before.receipt);
    const [after] = await refundRows(o);
    expect(after.status).toBe('processed');
    expect(await orderStatus(o)).toBe('refunded');
  }, 15_000);

  it('sync adopts a refund Razorpay already holds instead of re-sending a requested row', async () => {
    const { o, paymentId } = await confirmedOrder();
    const real = t.provider.createRefund.bind(t.provider);
    // The refund exists at Razorpay but every response was lost and the
    // receipt lookup at submit time failed too.
    const createSpy = jest
      .spyOn(t.provider, 'createRefund')
      .mockImplementationOnce(async (params) => {
        await real(params);
        throw serverError();
      })
      .mockRejectedValue(serverError());
    t.provider.refundOutcome('pending');
    t.provider.failFetchOnce('network');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'lost responses',
    });
    expect((await refundRows(o))[0].status).toBe('requested');
    await ageRefunds(o);
    createSpy.mockRestore();
    t.provider.createRefundCalls.length = 0;

    await service.syncRefunds();

    expect(t.provider.createRefundCalls.filter((c) => c.paymentId === paymentId)).toHaveLength(0);
    const [fake] = await t.provider.fetchRefunds(paymentId);
    const [row] = await refundRows(o);
    expect(row.status).toBe('submitted');
    expect(row.razorpay_refund_id).toBe(fake.id);
  }, 15_000);

  it('sync does nothing when this process is api-only', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'gated',
    });
    const [row] = await refundRows(o);
    t.provider.setRefundStatus(row.razorpay_refund_id!, 'processed');
    await ageRefunds(o);
    const config = (service as unknown as { configService: { get: () => string } }).configService;
    jest.spyOn(config, 'get').mockReturnValue('api');

    await service.syncRefunds();

    expect((await refundRows(o))[0].status).toBe('submitted');
  });

  it('vendor cannot advance a group while its order is refund_pending', async () => {
    const { o } = await confirmedOrder();
    t.provider.refundOutcome('pending');
    await service.requestRefund({
      orderId: o.orderId,
      adminUserId: t.adminUserId,
      reason: 'hold shipping',
    });
    expect(await orderStatus(o)).toBe('refund_pending');
    const [group] = await t.query<{ vendor_id: string }>(
      `SELECT vendor_id FROM order_vendor_group WHERE id = :id`,
      { id: o.groupId },
    );

    await expect(
      t.moduleRef
        .get(OrdersService)
        .updateVendorGroupStatus(group.vendor_id, o.groupId, OrderVendorGroupStatus.SHIPPED),
    ).rejects.toMatchObject({ status: 400 });
  });

  describe('HTTP', () => {
    it('POST /admin/orders/:id/refund answers 202 when Razorpay rejected it and cannot be asked about it', async () => {
      const { o } = await confirmedOrder();
      t.provider.refundOutcome({ error: 'client' });
      t.provider.failFetchOnce('network');

      const res = await request(t.app.getHttpServer())
        .post(`/api/admin/orders/${o.orderId}/refund`)
        .set('Authorization', `Bearer ${t.adminToken}`)
        .send({ reason: 'cannot verify' })
        .expect(202);

      expect(res.body.data.id).toBe(o.orderId);
      expect((await refundRows(o))[0].status).toBe('requested');
    });

    it('POST /admin/orders/:id/refund answers 400 when Razorpay rejected it and holds no such refund', async () => {
      const { o } = await confirmedOrder();
      t.provider.refundOutcome({ error: 'client' });

      await request(t.app.getHttpServer())
        .post(`/api/admin/orders/${o.orderId}/refund`)
        .set('Authorization', `Bearer ${t.adminToken}`)
        .send({ reason: 'razorpay says no' })
        .expect(400);

      expect((await refundRows(o))[0].status).toBe('failed');
    });

    it('POST /admin/orders/:id/refund answers 400 when Razorpay reports the refund as failed', async () => {
      const { o, paymentId } = await confirmedOrder();
      jest.spyOn(t.provider, 'createRefund').mockResolvedValue({
        id: 'rfnd_failed',
        paymentId,
        amountPaise: o.grandTotalPaise,
        receipt: null,
        status: 'failed',
      });

      const res = await request(t.app.getHttpServer())
        .post(`/api/admin/orders/${o.orderId}/refund`)
        .set('Authorization', `Bearer ${t.adminToken}`)
        .send({ reason: 'razorpay reports failure' })
        .expect(400);

      expect(res.body.message).toBe('Razorpay reported this refund as failed.');
      expect((await refundRows(o))[0].status).toBe('failed');
      expect(await orderStatus(o)).toBe('refund_required');
    });

    it('POST /admin/orders/:id/refund requires a reason and an admin', async () => {
      const { o } = await confirmedOrder();
      const url = `/api/admin/orders/${o.orderId}/refund`;

      await request(t.app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${t.adminToken}`)
        .send({})
        .expect(400);
      await request(t.app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${t.customerToken}`)
        .send({ reason: 'let me in' })
        .expect(403);
      expect(await refundRows(o)).toHaveLength(0);
    });

    it('POST then GET /admin/orders/:id/refunds returns the order and its refunds', async () => {
      const { o } = await confirmedOrder();
      t.provider.refundOutcome('pending');

      const post = await request(t.app.getHttpServer())
        .post(`/api/admin/orders/${o.orderId}/refund`)
        .set('Authorization', `Bearer ${t.adminToken}`)
        .send({ reason: 'http refund', amountPaise: 20000 })
        .expect(200);
      expect(post.body.data.id).toBe(o.orderId);

      const list = await request(t.app.getHttpServer())
        .get(`/api/admin/orders/${o.orderId}/refunds`)
        .set('Authorization', `Bearer ${t.adminToken}`)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        orderId: o.orderId,
        amountPaise: 20000,
        status: 'submitted',
        reason: 'http refund',
        createdBy: t.adminUserId,
      });
    });
  });
});
