import { useMutation } from '@tanstack/react-query';

import { queryClient } from '../../lib/query-client';
import { authService } from '../../services';
import { useOnboardingStore } from '../../stores/onboarding.store';
import { useSelectedSearchProductStore } from '../../stores/selected-search-product.store';
import { useSelectedVendorListingStore } from '../../stores/selected-vendor-listing.store';

export function useLogout() {
  return useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      useOnboardingStore.getState().clear();
      useSelectedSearchProductStore.getState().clearSelectedProduct();
      useSelectedVendorListingStore.getState().clearSelectedListing();
      // Drop every cached query, not just auth: profiles, orders and carts are
      // per-user, and the next account on this device must not see them.
      queryClient.getQueryCache().clear();
    },
  });
}
