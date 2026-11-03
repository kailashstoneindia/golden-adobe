import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RazorpayProviderService } from '../razorpay-provider.service';

describe('RazorpayProviderService.verifyWebhookSignature', () => {
  const webhookSecret = 'test-webhook-secret';
  let service: RazorpayProviderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RazorpayProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'RAZORPAY_WEBHOOK_SECRET' ? webhookSecret : ''),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RazorpayProviderService);
  });

  it('accepts a correctly signed payload', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const signature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    expect(service.verifyWebhookSignature(body, signature)).toBe(true);
  });

  it('rejects a payload with a tampered signature', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const wrongSignature = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    expect(service.verifyWebhookSignature(body, wrongSignature)).toBe(false);
  });

  it('rejects when the signature header is missing', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(service.verifyWebhookSignature(body, '')).toBe(false);
  });

  it('rejects when the body has been tampered with after signing', () => {
    const originalBody = JSON.stringify({ event: 'payment.captured', amount: 100 });
    const signature = crypto.createHmac('sha256', webhookSecret).update(originalBody).digest('hex');
    const tamperedBody = JSON.stringify({ event: 'payment.captured', amount: 999999 });
    expect(service.verifyWebhookSignature(tamperedBody, signature)).toBe(false);
  });
});

describe('RazorpayProviderService.refundPayment', () => {
  let service: RazorpayProviderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RazorpayProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'RAZORPAY_KEY_ID' ? 'test-key-id' : ''),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RazorpayProviderService);
  });

  it('calls the SDK refund method with amount in paise and returns the refund id', async () => {
    const refundMock = jest.fn().mockResolvedValue({ id: 'rfnd_abc123' });
    (service as any).client = { payments: { refund: refundMock } };

    const result = await service.refundPayment('pay_xyz789', 150000);

    expect(refundMock).toHaveBeenCalledWith('pay_xyz789', { amount: 150000 });
    expect(result).toEqual({ refundId: 'rfnd_abc123' });
  });

  it('throws if Razorpay is not configured', async () => {
    (service as any).keyId = '';
    await expect(service.refundPayment('pay_xyz789', 150000)).rejects.toThrow(
      'Razorpay is not configured',
    );
  });
});

describe('RazorpayProviderService (decision 0054 provider surface)', () => {
  let service: RazorpayProviderService;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RazorpayProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'RAZORPAY_KEY_ID') return 'test-key-id';
              if (key === 'RAZORPAY_KEY_SECRET') return 'test-key-secret';
              return '';
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RazorpayProviderService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  const jsonResponse = (status: number, body: unknown): Response =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  const refundParams = {
    paymentId: 'pay_1',
    amountPaise: 5000,
    receipt: 'rf_x_1',
    idempotencyKey: 'k'.repeat(32),
    notes: { order_id: 'o1' },
  };

  it('creates the order with a 20-minute capture window', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'order_1' });
    (service as any).client = { orders: { create } };

    const result = await service.createOrder(150000, 'order-1');

    expect(result).toEqual({ providerOrderId: 'order_1' });
    expect(create).toHaveBeenCalledWith({
      amount: 150000,
      currency: 'INR',
      receipt: 'order-1',
      payment: {
        capture: 'automatic',
        capture_options: {
          automatic_expiry_period: 20,
          manual_expiry_period: 20,
          refund_speed: 'normal',
        },
      },
    });
  });

  it('maps order payments to ProviderPayment', async () => {
    const fetchPayments = jest.fn().mockResolvedValue({
      items: [
        { id: 'pay_1', order_id: 'order_1', amount: 150000, currency: 'INR', status: 'captured' },
      ],
    });
    (service as any).client = { orders: { fetchPayments } };

    const result = await service.fetchOrderPayments('order_1');

    expect(fetchPayments).toHaveBeenCalledWith('order_1');
    expect(result).toEqual([
      { id: 'pay_1', orderId: 'order_1', amountPaise: 150000, currency: 'INR', status: 'captured' },
    ]);
  });

  it('sends X-Refund-Idempotency over HTTPS with basic auth', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'rfnd_1',
        payment_id: 'pay_1',
        amount: 5000,
        receipt: 'rf_x_1',
        status: 'pending',
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.createRefund(refundParams);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/payments/pay_1/refund',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('test-key-id:test-key-secret').toString('base64')}`,
          'Content-Type': 'application/json',
          'X-Refund-Idempotency': 'k'.repeat(32),
        }),
        body: JSON.stringify({
          amount: 5000,
          speed: 'normal',
          receipt: 'rf_x_1',
          notes: { order_id: 'o1' },
        }),
      }),
    );
    expect(result).toEqual({
      id: 'rfnd_1',
      paymentId: 'pay_1',
      amountPaise: 5000,
      receipt: 'rf_x_1',
      status: 'pending',
    });
  });

  it('throws if Razorpay is not configured when creating a refund', async () => {
    (service as any).keyId = '';
    await expect(service.createRefund(refundParams)).rejects.toThrow('Razorpay is not configured');
  });

  it.each([
    [
      'an aborted request to timeout',
      () => Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
      'timeout',
    ],
    [
      'an AbortError to timeout',
      () => Object.assign(new Error('aborted'), { name: 'AbortError' }),
      'timeout',
    ],
    ['a connection failure to network', () => new TypeError('fetch failed'), 'network'],
  ])('maps fetch %s', async (_label, makeError, kind) => {
    global.fetch = jest.fn().mockRejectedValue(makeError()) as unknown as typeof fetch;

    await expect(service.createRefund(refundParams)).rejects.toMatchObject({
      name: 'ProviderRequestError',
      kind,
    });
  });

  it.each([
    ['a 500 to server', 500, { error: { code: 'SERVER_ERROR', description: 'boom' } }, 'server'],
    [
      'a 409 still in progress to conflict_in_progress',
      409,
      { error: { code: 'BAD_REQUEST_ERROR', description: 'Request in progress for same key' } },
      'conflict_in_progress',
    ],
    [
      'a 400 to client',
      400,
      { error: { code: 'BAD_REQUEST_ERROR', description: 'bad amount' } },
      'client',
    ],
    [
      'a 409 that is not in progress to client',
      409,
      { error: { code: 'BAD_REQUEST_ERROR', description: 'already refunded' } },
      'client',
    ],
    // Decision 0054: transient and safe to retry under a stable idempotency key.
    [
      'a 429 to server',
      429,
      { error: { code: 'BAD_REQUEST_ERROR', description: 'rate limited' } },
      'server',
    ],
    [
      'a 408 to server',
      408,
      { error: { code: 'BAD_REQUEST_ERROR', description: 'request timeout' } },
      'server',
    ],
  ])('maps fetch %s', async (_label, status, body, kind) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(status, body)) as unknown as typeof fetch;

    await expect(service.createRefund(refundParams)).rejects.toMatchObject({
      name: 'ProviderRequestError',
      kind,
      status,
      code: body.error.code,
    });
  });

  it.each([
    [
      'a 500 to server',
      { statusCode: 500, error: { code: 'SERVER_ERROR', description: 'boom' } },
      'server',
    ],
    [
      'a 409 still in progress to conflict_in_progress',
      { statusCode: 409, error: { code: 'BAD_REQUEST_ERROR', description: 'Refund in progress' } },
      'conflict_in_progress',
    ],
    [
      'a 400 to client',
      { statusCode: 400, error: { code: 'BAD_REQUEST_ERROR', description: 'bad' } },
      'client',
    ],
    ['a 429 to server', { statusCode: 429, error: { description: 'rate limited' } }, 'server'],
    ['a 408 to server', { statusCode: 408, error: { description: 'timeout' } }, 'server'],
    ['an error with no status code to network', new Error('ECONNRESET'), 'network'],
  ])('maps SDK %s', async (_label, sdkError, kind) => {
    const fetchPayments = jest.fn().mockRejectedValue(sdkError);
    (service as any).client = { orders: { fetchPayments } };

    await expect(service.fetchOrderPayments('order_1')).rejects.toMatchObject({
      name: 'ProviderRequestError',
      kind,
    });
  });

  it('maps a 502 with an HTML body to server', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }) as unknown as typeof fetch;

    await expect(service.createRefund(refundParams)).rejects.toMatchObject({
      name: 'ProviderRequestError',
      kind: 'server',
      status: 502,
    });
  });

  // The refund may exist at Razorpay already; the stable idempotency key makes
  // a retry safe, so an unusable 2xx body must be retryable, not a TypeError.
  it.each([
    ['a non-JSON body', async () => Promise.reject(new SyntaxError('Unexpected token <'))],
    ['a null body', async () => null],
    ['a body with no refund id', async () => ({})],
  ])('maps a 200 with %s to network', async (_label, json) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch;

    await expect(service.createRefund(refundParams)).rejects.toMatchObject({
      name: 'ProviderRequestError',
      kind: 'network',
    });
  });

  it('keeps kind timeout when the body read is aborted', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        });
      },
    }) as unknown as typeof fetch;

    await expect(service.createRefund(refundParams)).rejects.toMatchObject({
      name: 'ProviderRequestError',
      kind: 'timeout',
    });
  });

  it('fetchRefunds and fetchRefund map Razorpay refunds', async () => {
    const raw = {
      id: 'rfnd_1',
      payment_id: 'pay_1',
      amount: 5000,
      receipt: null,
      status: 'processed',
    };
    const fetchMultipleRefund = jest.fn().mockResolvedValue({ items: [raw] });
    const fetchRefund = jest.fn().mockResolvedValue(raw);
    (service as any).client = { payments: { fetchMultipleRefund, fetchRefund } };
    const mapped = {
      id: 'rfnd_1',
      paymentId: 'pay_1',
      amountPaise: 5000,
      receipt: null,
      status: 'processed',
    };

    await expect(service.fetchRefunds('pay_1')).resolves.toEqual([mapped]);
    await expect(service.fetchRefund('pay_1', 'rfnd_1')).resolves.toEqual(mapped);
    expect(fetchMultipleRefund).toHaveBeenCalledWith('pay_1');
    expect(fetchRefund).toHaveBeenCalledWith('pay_1', 'rfnd_1');
  });

  it('wraps SDK calls in the 15s timeout', async () => {
    jest.useFakeTimers();
    const fetchPayments = jest.fn().mockReturnValue(new Promise(() => undefined));
    (service as any).client = { orders: { fetchPayments } };

    const outcome = service.fetchOrderPayments('order_1').then(
      () => null,
      (e: unknown) => e,
    );
    await jest.advanceTimersByTimeAsync(15_000);

    await expect(outcome).resolves.toMatchObject({ name: 'ProviderRequestError', kind: 'timeout' });
  });
});
