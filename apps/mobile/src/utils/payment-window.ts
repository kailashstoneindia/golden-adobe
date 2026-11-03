import { PAYMENT_HOLD_MINUTES } from '@golden-abode/types';

import { APP_CONSTANTS } from '../constants';

// Decision 0054: seconds the Razorpay Checkout sheet may stay open for an order
// created at `orderCreatedAt`, or null when too little of the order's payment
// hold is left to be worth opening it. The sheet closes a safety buffer before
// the hold ends, because Razorpay's own capture window counts from each
// payment's creation and would otherwise let a payment started late succeed on
// an order the sweep has already cancelled.
export function getCheckoutTimeoutSeconds(
  orderCreatedAt: string,
  nowMs: number = Date.now(),
): number | null {
  const elapsedSeconds = (nowMs - new Date(orderCreatedAt).getTime()) / 1000;
  const remainingSeconds = Math.floor(
    PAYMENT_HOLD_MINUTES * 60 - elapsedSeconds - APP_CONSTANTS.paymentSheetCloseBufferSeconds,
  );
  return remainingSeconds >= APP_CONSTANTS.paymentSheetMinSeconds ? remainingSeconds : null;
}
