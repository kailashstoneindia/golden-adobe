import type { CustomerAddressDto, UpsertCustomerAddressRequest } from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { customersService } from '../../services';

export function useAddressesQuery(isEnabled: boolean) {
  return useQuery<CustomerAddressDto[]>({
    queryKey: QUERY_KEYS.addresses.list(),
    queryFn: () => customersService.fetchAddresses(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.addressesStaleTimeMs,
  });
}

export function useAddAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertCustomerAddressRequest) => customersService.addAddress(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.addresses.all });
    },
  });
}

export function useUpdateAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { addressId: string; body: UpsertCustomerAddressRequest }) =>
      customersService.updateAddress(options.addressId, options.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.addresses.all });
    },
  });
}

export function useDeleteAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addressId: string) => customersService.deleteAddress(addressId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.addresses.all });
    },
  });
}
