import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import {
  CreateProviderOrderResult,
  CreateRefundParams,
  PAYMENT_CAPTURE_WINDOW_MINUTES,
  PaymentProviderService,
  PROVIDER_TIMEOUT_MS,
  ProviderPayment,
  ProviderRefund,
  ProviderRequestError,
} from './payment-provider.interface';
import { toProviderPayment, toProviderRefund } from './razorpay-mappers';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

// No real Razorpay merchant account exists in this project as of 2026-10-09
// (decision 0042, rules 8-9). This implementation is written and
// unit-testable (next task) against the SDK's documented behavior, but has
// never been run against a live account. RAZORPAY_KEY_ID/KEY_SECRET/
// WEBHOOK_SECRET are read from config and may be empty strings in dev.
//
// The SDK's own constructor throws synchronously when key_id is empty
// ("`key_id` or `oauthToken` is mandatory") — found by actually booting the
// app with no credentials configured, which is exactly the case this
// abstraction boundary exists to support. Constructing the client eagerly
// in this service's own constructor would therefore crash the whole app
// at boot, not just the one checkout call that needs a real key. The
// client is built lazily instead, on the first createOrder call, so
// everything else in the app works with no Razorpay credentials at all,
// and only an actual checkout attempt fails — loudly, which is correct.
//
// Signature verification uses Razorpay.validateWebhookSignature, the SDK's
// own documented static helper (HMAC-SHA256, the webhook secret as key,
// the raw body as message) — not hand-rolled crypto, and it needs no
// client instance at all.
@Injectable()
export class RazorpayProviderService implements PaymentProviderService {
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private client: Razorpay | null = null;

  constructor(private readonly configService: ConfigService) {
    this.keyId = this.configService.get<string>('RAZORPAY_KEY_ID') ?? '';
    this.keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') ?? '';
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
  }

  private getClient(): Razorpay {
    if (!this.keyId) {
      throw new InternalServerErrorException(
        'Razorpay is not configured (RAZORPAY_KEY_ID is empty) — cannot create a payment order',
      );
    }
    if (!this.client) {
      this.client = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
    }
    return this.client;
  }

  // Final review finding #7 (the HTTP-timeout half — the other half,
  // moving this call outside the checkout transaction so a slow response
  // can no longer hold DB locks/connections, is fixed in
  // CheckoutService.checkout): the Razorpay SDK's own IOption type has no
  // timeout field anywhere in its .d.ts, confirmed by reading it rather
  // than assuming. A hung HTTP call here would otherwise wait
  // indefinitely. Race it against a timer instead of trusting the SDK to
  // bound it.
  private async withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ProviderRequestError(
                  'timeout',
                  `Razorpay ${label} timed out after ${PROVIDER_TIMEOUT_MS}ms`,
                ),
              ),
            PROVIDER_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  // SDK calls reject with { statusCode, error: { code, description } }; a
  // rejection without statusCode never got an HTTP response from Razorpay.
  private toProviderError(err: unknown): ProviderRequestError {
    if (err instanceof ProviderRequestError) {
      return err;
    }
    const e = err as {
      statusCode?: number;
      error?: { code?: string; description?: string };
      message?: string;
    };
    const message = e?.error?.description ?? e?.message ?? 'Razorpay request failed';
    return this.classify(e?.statusCode, message, e?.error?.code);
  }

  private classify(
    status: number | undefined,
    message: string,
    code?: string,
  ): ProviderRequestError {
    if (status === undefined) {
      return new ProviderRequestError('network', message, undefined, code);
    }
    // 408/429 are transient, so they retry like a 5xx; the stable idempotency
    // key makes that safe (decision 0054).
    if (status >= 500 || status === 408 || status === 429) {
      return new ProviderRequestError('server', message, status, code);
    }
    // Razorpay answers 409 while the first request carrying the same
    // X-Refund-Idempotency key is still being processed (decision 0054). The
    // exact description is unverified, so every 409 counts.
    if (status === 409) {
      return new ProviderRequestError('conflict_in_progress', message, status, code);
    }
    return new ProviderRequestError('client', message, status, code);
  }

  private async callSdk<T>(label: string, call: (client: Razorpay) => Promise<T>): Promise<T> {
    const client = this.getClient();
    try {
      return await this.withTimeout(call(client), label);
    } catch (err) {
      throw this.toProviderError(err);
    }
  }

  // Never retry this without an order-level idempotency strategy: 429 and 408
  // are classified retryable (for refunds, which carry a stable key).
  async createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult> {
    const order = await this.callSdk('createOrder', (client) =>
      client.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: receiptId,
        // Decision 0054: bounds how long a payment attempt on this order can
        // still succeed, which is what makes the stale-reservation sweep safe.
        payment: {
          capture: 'automatic',
          capture_options: {
            automatic_expiry_period: PAYMENT_CAPTURE_WINDOW_MINUTES,
            manual_expiry_period: PAYMENT_CAPTURE_WINDOW_MINUTES,
            refund_speed: 'normal',
          },
        },
      }),
    );
    return { providerOrderId: order.id };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret || !signatureHeader) {
      return false;
    }
    return Razorpay.validateWebhookSignature(rawBody, signatureHeader, this.webhookSecret);
  }

  async fetchOrderPayments(providerOrderId: string): Promise<ProviderPayment[]> {
    const res = await this.callSdk('fetchOrderPayments', (client) =>
      client.orders.fetchPayments(providerOrderId),
    );
    return res.items.map(toProviderPayment);
  }

  // Raw fetch, not the SDK: razorpay-node's getValidHeaders whitelists only
  // X-Razorpay-Account and Content-Type, so it silently drops
  // X-Refund-Idempotency (decision 0054).
  async createRefund(params: CreateRefundParams): Promise<ProviderRefund> {
    this.getClient();
    let res: Response;
    try {
      res = await fetch(`${RAZORPAY_API_BASE}/payments/${params.paymentId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'X-Refund-Idempotency': params.idempotencyKey,
        },
        body: JSON.stringify({
          amount: params.amountPaise,
          speed: 'normal',
          receipt: params.receipt,
          notes: params.notes,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        throw new ProviderRequestError(
          'timeout',
          `Razorpay createRefund timed out after ${PROVIDER_TIMEOUT_MS}ms`,
        );
      }
      throw new ProviderRequestError('network', (err as Error)?.message ?? 'fetch failed');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        throw new ProviderRequestError(
          'timeout',
          `Razorpay createRefund timed out after ${PROVIDER_TIMEOUT_MS}ms`,
        );
      }
      body = undefined;
    }
    if (!res.ok) {
      const error = (body as { error?: { code?: string; description?: string } } | undefined)
        ?.error;
      throw this.classify(
        res.status,
        error?.description ?? `Razorpay createRefund failed with ${res.status}`,
        error?.code,
      );
    }
    // A 2xx whose body is unusable means the refund may exist at Razorpay but
    // we cannot tell. Retryable: the stable idempotency key returns the same
    // refund (decision 0054).
    if (!body || typeof body !== 'object' || typeof (body as { id?: unknown }).id !== 'string') {
      throw new ProviderRequestError(
        'network',
        `Razorpay createRefund returned ${res.status} with an unusable body`,
        res.status,
      );
    }
    return toProviderRefund(body as Parameters<typeof toProviderRefund>[0]);
  }

  async fetchRefunds(paymentId: string): Promise<ProviderRefund[]> {
    const res = await this.callSdk('fetchRefunds', (client) =>
      client.payments.fetchMultipleRefund(paymentId),
    );
    return res.items.map(toProviderRefund);
  }

  async fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund> {
    const refund = await this.callSdk('fetchRefund', (client) =>
      client.payments.fetchRefund(paymentId, refundId),
    );
    return toProviderRefund(refund);
  }
}
