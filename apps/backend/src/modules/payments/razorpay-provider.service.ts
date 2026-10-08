import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { CreateProviderOrderResult, PaymentProviderService } from './payment-provider.interface';

// No real Razorpay merchant account exists in this project as of 2026-10-09
// (decision 0033, rules 8-9). This implementation is written and
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
  private readonly logger = new Logger(RazorpayProviderService.name);
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

  async createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult> {
    const order = await this.getClient().orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: receiptId,
    });
    return { providerOrderId: order.id };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret || !signatureHeader) {
      return false;
    }
    return Razorpay.validateWebhookSignature(rawBody, signatureHeader, this.webhookSecret);
  }

  async markCaptured(providerOrderId: string, providerPaymentId: string): Promise<void> {
    // Razorpay's webhook payload already confirms capture; this method
    // exists for symmetry with the interface and as the place a future
    // reconciliation call (fetch payment by id to double-check) would go.
    // Not calling out to Razorpay again here — the webhook signature
    // verification is the authority, per decision 0032 rule 3.
    this.logger.log(`order ${providerOrderId} payment ${providerPaymentId} marked captured`);
  }
}
