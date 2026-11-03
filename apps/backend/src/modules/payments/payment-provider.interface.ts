export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

// Decision 0054: Razorpay expires an unpaid order's payment attempts after this
// many minutes (capture_options), so after it passes no new capture can start
// and a stale reservation can be released safely.
export const PAYMENT_CAPTURE_WINDOW_MINUTES = 20;
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
