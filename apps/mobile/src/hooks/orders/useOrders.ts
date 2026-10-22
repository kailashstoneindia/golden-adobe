import type {
  CheckoutRequest,
  OrderDto,
  OrderVendorGroupStatus,
  VendorOrderGroupDto,
} from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { ordersService } from '../../services';

export function useOrdersQuery(isEnabled: boolean) {
  return useQuery<OrderDto[]>({
    queryKey: QUERY_KEYS.orders.list(),
    queryFn: () => ordersService.fetchOrders(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.ordersStaleTimeMs,
  });
}

export function useOrderQuery(orderId: string | null) {
  return useQuery<OrderDto>({
    queryKey: QUERY_KEYS.orders.detail(orderId ?? ''),
    queryFn: () => ordersService.fetchOrder(orderId!),
    enabled: Boolean(orderId),
    staleTime: APP_CONSTANTS.ordersStaleTimeMs,
  });
}

export function useCheckoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckoutRequest) => ordersService.checkout(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart.all });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders.all });
    },
  });
}

export function useCancelOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => ordersService.cancelOrder(orderId),
    onSuccess: async (_order, orderId) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders.all });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders.detail(orderId) });
    },
  });
}

export function useVendorOrderGroupsQuery(isEnabled: boolean) {
  return useQuery<VendorOrderGroupDto[]>({
    queryKey: QUERY_KEYS.vendorOrderGroups.list(),
    queryFn: () => ordersService.fetchVendorOrderGroups(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.ordersStaleTimeMs,
  });
}

export function useVendorOrderGroupQuery(groupId: string | null) {
  return useQuery<VendorOrderGroupDto>({
    queryKey: QUERY_KEYS.vendorOrderGroups.detail(groupId ?? ''),
    queryFn: () => ordersService.fetchVendorOrderGroup(groupId!),
    enabled: Boolean(groupId),
    staleTime: APP_CONSTANTS.ordersStaleTimeMs,
  });
}

export function useUpdateVendorOrderGroupStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { groupId: string; status: OrderVendorGroupStatus }) =>
      ordersService.updateVendorOrderGroupStatus(options.groupId, options.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorOrderGroups.all });
    },
  });
}
