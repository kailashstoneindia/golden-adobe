import Razorpay from 'razorpay';
import {
  CreateProviderOrderResult,
  PaymentProviderService,
  RefundResult,
} from '../payment-provider.interface';

export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

type ProviderMethod = 'createOrder' | 'markCaptured' | 'refundPayment';

// In-memory stand-in for RazorpayProviderService. Signature verification is
// the real Razorpay helper (same call the production provider makes), so a
// webhook test exercises genuine HMAC checking against TEST_WEBHOOK_SECRET.
export class FakePaymentProvider implements PaymentProviderService {
  readonly calls: { method: string; args: unknown[] }[] = [];
  private readonly failures = new Map<ProviderMethod, Error>();
  private counter = 0;

  // Makes the next call to `method` reject once with `error`, then recovers.
  failNext(method: ProviderMethod, error: Error = new Error(`fake ${method} failure`)): void {
    this.failures.set(method, error);
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

  async markCaptured(providerOrderId: string, providerPaymentId: string): Promise<void> {
    this.record('markCaptured', [providerOrderId, providerPaymentId]);
  }

  async refundPayment(providerPaymentId: string, amountPaise: number): Promise<RefundResult> {
    this.record('refundPayment', [providerPaymentId, amountPaise]);
    this.counter += 1;
    return { refundId: `rfnd_fake_${this.counter}` };
  }
}
