import { ERROR_MESSAGES, Env } from '../constants';
import type { RazorpayCheckoutOptions, RazorpayCheckoutResult } from '../types/razorpay.types';

type RazorpayNativeModule = {
  open: (options: Record<string, string | number>) => Promise<Record<string, string>>;
};

function loadRazorpayModule(): RazorpayNativeModule | null {
  try {
    const loaded = require('react-native-razorpay') as
      | RazorpayNativeModule
      | { default: RazorpayNativeModule };
    if ('open' in loaded) {
      return loaded;
    }
    return loaded.default ?? null;
  } catch {
    return null;
  }
}

export async function openRazorpayCheckout(
  options: RazorpayCheckoutOptions,
): Promise<RazorpayCheckoutResult> {
  if (!Env.razorpayKeyId) {
    throw new Error(ERROR_MESSAGES.paymentKeyMissing);
  }

  const checkout = loadRazorpayModule();
  if (!checkout) {
    throw new Error(ERROR_MESSAGES.paymentSheetUnavailable);
  }

  const payload = {
    key: Env.razorpayKeyId,
    order_id: options.razorpayOrderId,
    currency: 'INR',
    name: options.merchantName,
    amount: options.amountPaise,
  };

  try {
    const result = await checkout.open(payload);
    return { razorpayPaymentId: result.razorpay_payment_id ?? null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ERROR_MESSAGES.paymentFailed;
    throw new Error(message);
  }
}
