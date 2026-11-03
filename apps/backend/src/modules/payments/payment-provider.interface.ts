import { PAYMENT_HOLD_MINUTES } from '@golden-abode/types';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

// Decision 0054: how long a payment attempt may take to capture
// (capture_options), and how long the stale-reservation sweep waits. Razorpay
// counts this window from each payment's creation, not from the order's, so it
// alone does not stop a payment started late: the mobile app closes the
// Checkout sheet before the hold expires (same constant), and a payment that
// still lands on a cancelled order ends in refund_required (rule 4).
export const PAYMENT_CAPTURE_WINDOW_MINUTES = PAYMENT_HOLD_MINUTES;
export const PROVIDER_TIMEOUT_MS = 15_000;

export interface CreateProviderOrderResult {
  providerOrderId: string;
}

export type ProviderPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

export interface ProviderPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: ProviderPaymentStatus;
}

export type ProviderRefundStatus = 'pending' | 'processed' | 'failed';

export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  receipt: string | null;
  status: ProviderRefundStatus;
}

export interface CreateRefundParams {
  paymentId: string;
  amountPaise: number;
  receipt: string;
  idempotencyKey: string;
  notes: Record<string, string>;
}

export type ProviderErrorKind =
  | 'timeout'
  | 'network'
  | 'server'
  | 'conflict_in_progress'
  | 'client';

export class ProviderRequestError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

// Decision 0042 rules 8-9. One implementation (RazorpayProviderService)
// behind this interface, same pattern as StorageService in decision
// 0024-product-images-gcs.md — a future provider swap, or wiring real
// credentials, is a config change, not a rewrite of the ordering domain.
export interface PaymentProviderService {
  createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  fetchOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
  createRefund(params: CreateRefundParams): Promise<ProviderRefund>;
  fetchRefunds(paymentId: string): Promise<ProviderRefund[]>;
  fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund>;
}
