export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface CreateProviderOrderResult {
  providerOrderId: string;
}

// Decision 0033 rules 8-9. One implementation (RazorpayProviderService)
// behind this interface, same pattern as StorageService in decision
// 0024-product-images-gcs.md — a future provider swap, or wiring real
// credentials, is a config change, not a rewrite of the ordering domain.
export interface PaymentProviderService {
  createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  markCaptured(providerOrderId: string, providerPaymentId: string): Promise<void>;
}
