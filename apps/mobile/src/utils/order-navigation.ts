import { router } from 'expo-router';

import { ROUTES } from '../constants';

export function navigateToOrderDetail(orderId: string): void {
  router.push({
    pathname: ROUTES.screens.orderDetail,
    params: { id: orderId },
  });
}

export function replaceToOrderDetail(orderId: string): void {
  router.replace({
    pathname: ROUTES.screens.orderDetail,
    params: { id: orderId },
  });
}

/**
 * The name to show for an order (decision 0061). Falls back to the short id
 * while a backend without order numbers is still deployed.
 */
export function formatOrderTitle(order: { id: string; orderNumber?: string | null }): string {
  return order.orderNumber || `Order ${order.id.slice(0, 8).toUpperCase()}`;
}
