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
