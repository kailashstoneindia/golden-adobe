import type { SearchQueryParams, SearchResponse } from '@golden-abode/types';
import { useQuery } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { searchService } from '../../services';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../stores/location-preference.store';

function buildSearchParamsKey(params: SearchQueryParams): string {
  return JSON.stringify(params);
}

export function useSearchProductsQuery(
  options: Omit<SearchQueryParams, 'pincode' | 'lat' | 'lng'>,
) {
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const preference = useLocationPreferenceStore((store) => store.preference);

  const params: SearchQueryParams = {
    ...options,
    pincode: preference.pincode ?? undefined,
    lat: preference.latitude ?? undefined,
    lng: preference.longitude ?? undefined,
    limit: options.limit ?? APP_CONSTANTS.searchDefaultPageSize,
  };

  return useQuery<SearchResponse>({
    queryKey: QUERY_KEYS.search.products(buildSearchParamsKey(params)),
    queryFn: () => searchService.searchProducts(params),
    enabled: hasSearchLocation,
    staleTime: 60_000,
  });
}
