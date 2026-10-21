import type { ProductListingsQueryParams, ProductListingsResponse } from '@golden-abode/types';
import { useQuery } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { searchService } from '../../services';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../stores/location-preference.store';

const LISTINGS_STALE_TIME_MS = 60_000;

function buildListingsParamsKey(params: ProductListingsQueryParams): string {
  return JSON.stringify(params);
}

export function useProductListingsQuery(masterProductId: string | null) {
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const preference = useLocationPreferenceStore((locationStore) => locationStore.preference);

  const params: ProductListingsQueryParams = {
    pincode: preference.pincode ?? undefined,
    lat: preference.latitude ?? undefined,
    lng: preference.longitude ?? undefined,
  };

  return useQuery<ProductListingsResponse>({
    queryKey: QUERY_KEYS.search.listings(masterProductId ?? '', buildListingsParamsKey(params)),
    queryFn: () => searchService.fetchProductListings(masterProductId!, params),
    enabled: Boolean(masterProductId) && hasSearchLocation,
    staleTime: LISTINGS_STALE_TIME_MS,
  });
}
