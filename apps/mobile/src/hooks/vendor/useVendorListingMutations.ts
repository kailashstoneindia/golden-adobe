import type { SetVendorListingStatusRequest, SetVendorStockRequest } from '@golden-abode/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { vendorListingsService } from '../../services';

type SetStockVariables = {
  vendorListingId: string;
  body: SetVendorStockRequest;
};

type SetStatusVariables = {
  vendorListingId: string;
  body: SetVendorListingStatusRequest;
};

export function useSetVendorStockMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vendorListingId, body }: SetStockVariables) =>
      vendorListingsService.setStock(vendorListingId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorListings.all });
    },
  });
}

export function useSetVendorListingStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vendorListingId, body }: SetStatusVariables) =>
      vendorListingsService.setStatus(vendorListingId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorListings.all });
    },
  });
}
