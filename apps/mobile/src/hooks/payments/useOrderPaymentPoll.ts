import type { OrderDto } from '@golden-abode/types';
import { ORDER_STATUSES } from '@golden-abode/types';
import { useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { ordersService } from '../../services';

function waitForPollInterval(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, APP_CONSTANTS.orderPaymentPollIntervalMs);
  });
}

export function useOrderPaymentPoll() {
  const queryClient = useQueryClient();

  async function pollUntilResolved(orderId: string): Promise<OrderDto> {
    let attempt = 0;
    let order = await ordersService.fetchOrder(orderId);

    while (order.status === ORDER_STATUSES.PENDING_PAYMENT && attempt < APP_CONSTANTS.orderPaymentPollMaxAttempts) {
      await waitForPollInterval();
      order = await ordersService.fetchOrder(orderId);
      attempt += 1;
    }

    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders.all });
    return order;
  }

  return { pollUntilResolved };
}
