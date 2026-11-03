import Razorpay from 'razorpay';
import {
  CreateProviderOrderResult,
  CreateRefundParams,
  PaymentProviderService,
  ProviderErrorKind,
  ProviderPayment,
  ProviderRefund,
  ProviderRefundStatus,
  ProviderRequestError,
  RefundResult,
} from '../payment-provider.interface';

export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

type ProviderMethod = 'createOrder' | 'refundPayment';

type RefundOutcome =
  | 'pending'
  | 'processed'
  | { error: ProviderErrorKind; afterProcessing?: boolean };

// In-memory stand-in for RazorpayProviderService. Signature verification is
// the real Razorpay helper (same call the production provider makes), so a
// webhook test exercises genuine HMAC checking against TEST_WEBHOOK_SECRET.
export class FakePaymentProvider implements PaymentProviderService {
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly createRefundCalls: CreateRefundParams[] = [];
  private readonly failures = new Map<ProviderMethod, Error>();
  private readonly orderPayments = new Map<string, ProviderPayment[]>();
  private readonly refundsByKey = new Map<string, ProviderRefund>();
  private readonly refundsById = new Map<string, ProviderRefund>();
  private fetchFailure: ProviderErrorKind | null = null;
  private nextRefundOutcome: RefundOutcome = 'processed';
  private counter = 0;

  // Makes the next call to `method` reject once with `error`, then recovers.
  failNext(method: ProviderMethod, error: Error = new Error(`fake ${method} failure`)): void {
    this.failures.set(method, error);
  }

  setOrderPayments(orderId: string, payments: ProviderPayment[]): void {
    this.orderPayments.set(orderId, payments);
  }

  // Makes the next fetch (fetchOrderPayments, fetchRefunds or fetchRefund)
  // reject once with a ProviderRequestError of `kind`.
  failFetchOnce(kind: ProviderErrorKind): void {
    this.fetchFailure = kind;
  }

  // Scripts the outcome of the next createRefund that is not an idempotent
  // replay. { error, afterProcessing: true } models a request Razorpay accepted
  // but whose response never reached us (timeout after the refund exists).
  refundOutcome(next: RefundOutcome): void {
    this.nextRefundOutcome = next;
  }

  setRefundStatus(refundId: string, status: ProviderRefundStatus): void {
    const refund = this.refundsById.get(refundId);
    if (!refund) {
      throw new Error(`fake provider has no refund ${refundId}`);
    }
    refund.status = status;
  }

  callsTo(method: string): { method: string; args: unknown[] }[] {
    return this.calls.filter((c) => c.method === method);
  }

  private record(method: ProviderMethod, args: unknown[]): void {
    this.calls.push({ method, args });
    const failure = this.failures.get(method);
    if (failure) {
      this.failures.delete(method);
      throw failure;
    }
  }

  private maybeFailFetch(): void {
    if (this.fetchFailure) {
      const kind = this.fetchFailure;
      this.fetchFailure = null;
      throw new ProviderRequestError(kind, `fake fetch ${kind} failure`);
    }
  }

  async createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult> {
    this.record('createOrder', [amountPaise, receiptId]);
    this.counter += 1;
    return { providerOrderId: `order_fake_${this.counter}` };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!signatureHeader) {
      return false;
    }
    return Razorpay.validateWebhookSignature(rawBody, signatureHeader, TEST_WEBHOOK_SECRET);
  }

  async fetchOrderPayments(providerOrderId: string): Promise<ProviderPayment[]> {
    this.maybeFailFetch();
    return [...(this.orderPayments.get(providerOrderId) ?? [])];
  }

  // Emulates Razorpay's X-Refund-Idempotency: the same key returns the same
  // refund and never consumes a scripted outcome or creates a second one.
  async createRefund(params: CreateRefundParams): Promise<ProviderRefund> {
    this.createRefundCalls.push(params);
    const existing = this.refundsByKey.get(params.idempotencyKey);
    if (existing) {
      return { ...existing };
    }
    const outcome = this.nextRefundOutcome;
    this.nextRefundOutcome = 'processed';
    if (typeof outcome === 'object' && !outcome.afterProcessing) {
      throw new ProviderRequestError(outcome.error, `fake createRefund ${outcome.error} failure`);
    }
    this.counter += 1;
    const refund: ProviderRefund = {
      id: `rfnd_fake_${this.counter}`,
      paymentId: params.paymentId,
      amountPaise: params.amountPaise,
      receipt: params.receipt,
      status: outcome === 'pending' ? 'pending' : 'processed',
    };
    this.refundsByKey.set(params.idempotencyKey, refund);
    this.refundsById.set(refund.id, refund);
    if (typeof outcome === 'object') {
      throw new ProviderRequestError(outcome.error, `fake createRefund ${outcome.error} failure`);
    }
    return { ...refund };
  }

  async fetchRefunds(paymentId: string): Promise<ProviderRefund[]> {
    this.maybeFailFetch();
    return [...this.refundsById.values()]
      .filter((r) => r.paymentId === paymentId)
      .map((r) => ({ ...r }));
  }

  async fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund> {
    this.maybeFailFetch();
    const refund = this.refundsById.get(refundId);
    if (!refund || refund.paymentId !== paymentId) {
      throw new ProviderRequestError('client', `fake provider has no refund ${refundId}`, 400);
    }
    return { ...refund };
  }

  async refundPayment(providerPaymentId: string, amountPaise: number): Promise<RefundResult> {
    this.record('refundPayment', [providerPaymentId, amountPaise]);
    this.counter += 1;
    return { refundId: `rfnd_fake_${this.counter}` };
  }
}
