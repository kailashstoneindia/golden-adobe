import type { AdminOverrideVendorGroupStatusRequest } from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ordersService } from '@/services/api/ordersService';

export const ORDERS_QUERY_KEYS = {
  all: ['orders'] as const,
  list: ['orders', 'list'] as const,
  detail: (orderId: string) => ['orders', 'detail', orderId] as const,
  paymentEvents: (orderId: string) => ['orders', 'payment-events', orderId] as const,
};

export function useOrdersQuery() {
  return useQuery({
    queryKey: ORDERS_QUERY_KEYS.list,
    queryFn: () => ordersService.fetchOrders(),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useOrderQuery(orderId: string | null) {
  return useQuery({
    queryKey: ORDERS_QUERY_KEYS.detail(orderId ?? ''),
    queryFn: () => ordersService.fetchOrder(orderId!),
    enabled: Boolean(orderId),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function usePaymentEventsQuery(orderId: string | null, isEnabled: boolean) {
  return useQuery({
    queryKey: ORDERS_QUERY_KEYS.paymentEvents(orderId ?? ''),
    queryFn: () => ordersService.fetchPaymentEvents(orderId!),
    enabled: Boolean(orderId) && isEnabled,
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useRefundOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => ordersService.refundOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEYS.all });
    },
  });
}

export function useCancelAdminOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => ordersService.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEYS.all });
    },
  });
}

export function useOverrideVendorGroupStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { groupId: string; body: AdminOverrideVendorGroupStatusRequest }) =>
      ordersService.overrideVendorGroupStatus(options.groupId, options.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEYS.all });
    },
  });
}
