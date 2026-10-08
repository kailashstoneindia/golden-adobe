import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { CreateProviderOrderResult, PaymentProviderService } from './payment-provider.interface';

// No real Razorpay merchant account exists in this project as of 2026-10-09
// (decision 0033, rules 8-9). This implementation is written and
// unit-testable (next task) against the SDK's documented behavior, but has
// never been run against a live account. RAZORPAY_KEY_ID/KEY_SECRET/
// WEBHOOK_SECRET are read from config and may be empty strings in dev —
// createOrder will fail loudly against Razorpay's API in that case, which
// is correct: it should not pretend to succeed.
//
// Signature verification uses Razorpay.validateWebhookSignature, the SDK's
// own documented helper (HMAC-SHA256, the webhook secret as key, the raw
// body as message) — not hand-rolled crypto. The SDK maintains this; a
// bespoke reimplementation would only risk a timing or encoding mismatch
// the SDK has already solved.
@Injectable()
export class RazorpayProviderService implements PaymentProviderService {
  private readonly logger = new Logger(RazorpayProviderService.name);
  private readonly client: Razorpay;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID') ?? '';
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') ?? '';
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult> {
    const order = await this.client.orders.create({
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
