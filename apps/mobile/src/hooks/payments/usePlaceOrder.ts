import { ORDER_STATUSES, type OrderDto } from '@golden-abode/types';
import { useState } from 'react';

import { APP_CONSTANTS, ERROR_MESSAGES, TOAST_MESSAGES } from '../../constants';
import { openRazorpayCheckout } from '../../services';
import { getApiErrorMessage, getCheckoutTimeoutSeconds, replaceToOrderDetail } from '../../utils';
import { useToast } from '../useToast';
import { useCheckoutMutation } from '../orders';
import { useOrderPaymentPoll } from './useOrderPaymentPoll';

export function usePlaceOrder() {
  const checkout = useCheckoutMutation();
  const { pollUntilResolved } = useOrderPaymentPoll();
  const { showSuccess, showError, showWarning } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  async function placeOrder(deliveryAddressId: string, bookingId?: string): Promise<void> {
    setIsProcessing(true);
    try {
      const order = await checkout.mutateAsync({
        deliveryAddressId,
        ...(bookingId ? { bookingId } : {}),
      });
      const sheetOpened = await openPaymentSheetOrWarn(order, showError);
      if (sheetOpened) {
        const resolved = await pollUntilResolved(order.id);
        notifyPaymentResult(resolved.status, showSuccess, showWarning);
      }
      replaceToOrderDetail(order.id);
    } catch (error) {
      showError(getApiErrorMessage(error, ERROR_MESSAGES.checkoutFailed));
    } finally {
      setIsProcessing(false);
    }
  }

  async function payExistingOrder(order: OrderDto): Promise<void> {
    try {
      const sheetOpened = await openPaymentSheetOrWarn(order, showError);
      if (!sheetOpened) {
        return;
      }
      const resolved = await pollUntilResolved(order.id);
      notifyPaymentResult(resolved.status, showSuccess, showWarning);
    } catch (error) {
      showError(getApiErrorMessage(error, ERROR_MESSAGES.paymentFailed));
    }
  }

  return { placeOrder, payExistingOrder, isPlacing: checkout.isPending || isProcessing };
}

async function tryOpenPaymentSheet(order: OrderDto, timeoutSeconds: number): Promise<void> {
  if (!order.razorpayOrderId) {
    return;
  }
  await openRazorpayCheckout({
    razorpayOrderId: order.razorpayOrderId,
    merchantName: APP_CONSTANTS.checkoutMerchantName,
    amountPaise: Math.round(order.grandTotal * 100),
    timeoutSeconds,
  });
}

// Returns true only when the customer went through the payment sheet, so a
// webhook may be on its way and polling is worthwhile. Returns false when the
// sheet never opened (hold expired, no Razorpay order, key missing) or the
// customer closed it: there is nothing to wait for, so the caller goes
// straight to order detail, where "Pay now" retries.
async function openPaymentSheetOrWarn(
  order: OrderDto,
  showError: (message: string) => void,
): Promise<boolean> {
  // Decision 0054: Razorpay's capture window counts from each payment, not
  // from the order, so the sheet must close before the hold expires or a late
  // payment would land on a cancelled order.
  const timeoutSeconds = getCheckoutTimeoutSeconds(order.createdAt);
  if (order.razorpayOrderId && timeoutSeconds === null) {
    showError(ERROR_MESSAGES.paymentWindowExpired);
    return false;
  }
  if (!order.razorpayOrderId) {
    showError(ERROR_MESSAGES.paymentFailed);
    return false;
  }
  try {
    await tryOpenPaymentSheet(order, timeoutSeconds ?? 0);
  } catch (error) {
    showError(getApiErrorMessage(error, ERROR_MESSAGES.paymentFailed));
    return false;
  }
  return true;
}

function notifyPaymentResult(
  status: OrderDto['status'],
  showSuccess: (message: string) => void,
  showWarning: (message: string) => void,
): void {
  if (status === ORDER_STATUSES.CONFIRMED) {
    showSuccess(TOAST_MESSAGES.paymentConfirmed);
    return;
  }
  if (status === ORDER_STATUSES.REFUND_REQUIRED || status === ORDER_STATUSES.REFUND_PENDING) {
    showWarning(TOAST_MESSAGES.paymentArrivedAfterExpiry);
    return;
  }
  showWarning(TOAST_MESSAGES.paymentPending);
}
