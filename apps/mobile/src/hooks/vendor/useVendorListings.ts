import type {
  ListVendorListingsQuery,
  PaginatedResponse,
  VendorListingStockDto,
} from '@golden-abode/types';
import { useQuery } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { vendorListingsService } from '../../services';

function buildListingsParamsKey(query: ListVendorListingsQuery): string {
  return JSON.stringify(query);
}

export function useVendorListingsQuery(query: ListVendorListingsQuery = {}) {
  const resolvedQuery: ListVendorListingsQuery = {
    ...query,
    page: query.page ?? 1,
    limit: query.limit ?? APP_CONSTANTS.vendorListingsDefaultPageSize,
  };

  return useQuery<PaginatedResponse<VendorListingStockDto>>({
    queryKey: QUERY_KEYS.vendorListings.list(buildListingsParamsKey(resolvedQuery)),
    queryFn: () => vendorListingsService.fetchListings(resolvedQuery),
    staleTime: 30_000,
  });
}
