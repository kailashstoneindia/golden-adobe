import type { SearchQueryParams, SearchResponse } from '@golden-abode/types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { searchService } from '../../services';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../stores/location-preference.store';

function buildSearchParamsKey(params: SearchQueryParams): string {
  return JSON.stringify(params);
}

function buildLocatedParams(
  options: Omit<SearchQueryParams, 'pincode' | 'lat' | 'lng'>,
): SearchQueryParams {
  const preference = useLocationPreferenceStore.getState().preference;
  return {
    ...options,
    pincode: preference.pincode ?? undefined,
    lat: preference.latitude ?? undefined,
    lng: preference.longitude ?? undefined,
    limit: options.limit ?? APP_CONSTANTS.searchDefaultPageSize,
  };
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

export function useSearchProductsInfiniteQuery(
  options: Omit<SearchQueryParams, 'pincode' | 'lat' | 'lng' | 'offset'>,
) {
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const preference = useLocationPreferenceStore((store) => store.preference);
  const baseParams = buildLocatedParams(options);
  const paramsKey = buildSearchParamsKey({
    ...baseParams,
    pincode: preference.pincode ?? undefined,
    lat: preference.latitude ?? undefined,
    lng: preference.longitude ?? undefined,
  });

  return useInfiniteQuery({
    queryKey: QUERY_KEYS.search.products(`infinite:${paramsKey}`),
    queryFn: ({ pageParam }) =>
      searchService.searchProducts({
        ...baseParams,
        pincode: preference.pincode ?? undefined,
        lat: preference.latitude ?? undefined,
        lng: preference.longitude ?? undefined,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => getNextSearchOffset(lastPage, allPages),
    enabled: hasSearchLocation,
    staleTime: 60_000,
  });
}

function getNextSearchOffset(
  lastPage: SearchResponse,
  allPages: SearchResponse[],
): number | undefined {
  const loadedCount = allPages.reduce((sum, page) => sum + page.hits.length, 0);
  if (loadedCount >= lastPage.total) {
    return undefined;
  }
  return loadedCount;
}
