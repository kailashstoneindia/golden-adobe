import type {
  AdminOverrideVendorGroupStatusRequest,
  AdminRefundRequest,
} from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ordersService } from '@/services/api/ordersService';

export const ORDERS_QUERY_KEYS = {
  all: ['orders'] as const,
  list: (customerId: string | null) => ['orders', 'list', customerId ?? 'all'] as const,
  detail: (orderId: string) => ['orders', 'detail', orderId] as const,
  paymentEvents: (orderId: string) => ['orders', 'payment-events', orderId] as const,
  refunds: (orderId: string) => ['orders', 'refunds', orderId] as const,
};

export function useOrdersQuery(customerId: string | null = null) {
  return useQuery({
    queryKey: ORDERS_QUERY_KEYS.list(customerId),
    queryFn: () => ordersService.fetchOrders(customerId),
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

export function useOrderRefundsQuery(orderId: string | null, isEnabled: boolean) {
  return useQuery({
    queryKey: ORDERS_QUERY_KEYS.refunds(orderId ?? ''),
    queryFn: () => ordersService.listRefunds(orderId!),
    enabled: Boolean(orderId) && isEnabled,
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useRefundOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { orderId: string; body: AdminRefundRequest }) =>
      ordersService.refundOrder(options.orderId, options.body),
    // Also on error: a refund can be recorded even when the call reports a
    // problem, so the history and the remaining amount must come from the server.
    onSettled: () => {
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
