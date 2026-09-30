import type { VendorCategoryDto } from '@golden-abode/types';
import { useQuery } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { vendorListingsService } from '../../services';

export function useVendorCategoriesQuery() {
  return useQuery<VendorCategoryDto[]>({
    queryKey: QUERY_KEYS.vendor.categories(),
    queryFn: () => vendorListingsService.fetchCategories(),
    staleTime: 5 * 60_000,
  });
}
