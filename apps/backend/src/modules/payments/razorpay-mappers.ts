import {
  ProviderPayment,
  ProviderPaymentStatus,
  ProviderRefund,
  ProviderRefundStatus,
} from './payment-provider.interface';

export function toProviderPayment(raw: {
  id: string;
  order_id: string;
  amount: number | string;
  currency: string;
  status: string;
}): ProviderPayment {
  return {
    id: raw.id,
    orderId: raw.order_id,
    amountPaise: Number(raw.amount),
    currency: raw.currency,
    status: raw.status as ProviderPaymentStatus,
  };
}

export function toProviderRefund(raw: {
  id: string;
  payment_id: string;
  // Optional only because the SDK types it so; Razorpay always returns it.
  amount?: number | string;
  receipt?: string | null;
  status: string;
}): ProviderRefund {
  return {
    id: raw.id,
    paymentId: raw.payment_id,
    amountPaise: Number(raw.amount),
    receipt: raw.receipt ?? null,
    status: raw.status as ProviderRefundStatus,
  };
}
