import type { AddCartItemRequest } from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { cartService } from '../../services';

export function useCartQuery(isEnabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.cart.current(),
    queryFn: () => cartService.fetchCart(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.cartStaleTimeMs,
  });
}

export function useAddCartItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddCartItemRequest) => cartService.addItem(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart.all });
    },
  });
}

export function useUpdateCartItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { itemId: string; quantity: number }) =>
      cartService.updateItem(options.itemId, { quantity: options.quantity }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart.all });
    },
  });
}

export function useRemoveCartItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => cartService.removeItem(itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart.all });
    },
  });
}
