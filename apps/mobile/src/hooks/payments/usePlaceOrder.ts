import { ORDER_STATUSES, type OrderDto } from '@golden-abode/types';

import { APP_CONSTANTS, ERROR_MESSAGES, TOAST_MESSAGES } from '../../constants';
import { openRazorpayCheckout } from '../../services';
import { getApiErrorMessage, replaceToOrderDetail } from '../../utils';
import { useToast } from '../useToast';
import { useCheckoutMutation } from '../orders';
import { useOrderPaymentPoll } from './useOrderPaymentPoll';

export function usePlaceOrder() {
  const checkout = useCheckoutMutation();
  const { pollUntilResolved } = useOrderPaymentPoll();
  const { showSuccess, showError, showWarning } = useToast();

  async function placeOrder(deliveryAddressId: string): Promise<void> {
    try {
      const order = await checkout.mutateAsync({ deliveryAddressId });
      await openPaymentSheetOrWarn(order, showError);
      const resolved = await pollUntilResolved(order.id);
      notifyPaymentResult(resolved.status, showSuccess, showWarning);
      replaceToOrderDetail(order.id);
    } catch (error) {
      showError(getApiErrorMessage(error, ERROR_MESSAGES.checkoutFailed));
    }
  }

  async function payExistingOrder(order: OrderDto): Promise<void> {
    try {
      await openPaymentSheetOrWarn(order, showError);
      const resolved = await pollUntilResolved(order.id);
      notifyPaymentResult(resolved.status, showSuccess, showWarning);
    } catch (error) {
      showError(getApiErrorMessage(error, ERROR_MESSAGES.paymentFailed));
    }
  }

  return { placeOrder, payExistingOrder, isPlacing: checkout.isPending };
}

async function tryOpenPaymentSheet(
  razorpayOrderId: string | null,
  grandTotal: number,
): Promise<void> {
  if (!razorpayOrderId) {
    return;
  }
  await openRazorpayCheckout({
    razorpayOrderId,
    merchantName: APP_CONSTANTS.checkoutMerchantName,
    amountPaise: Math.round(grandTotal * 100),
  });
}

async function openPaymentSheetOrWarn(
  order: OrderDto,
  showError: (message: string) => void,
): Promise<void> {
  try {
    await tryOpenPaymentSheet(order.razorpayOrderId, order.grandTotal);
  } catch (error) {
    showError(getApiErrorMessage(error, ERROR_MESSAGES.paymentFailed));
  }
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
  showWarning(TOAST_MESSAGES.paymentPending);
}
