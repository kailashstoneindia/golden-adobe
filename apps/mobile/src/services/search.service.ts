import type { SearchQueryParams, SearchResponse } from '@golden-abode/types';
import { isNil, omitBy } from 'lodash';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

function buildSearchParams(params: SearchQueryParams): Record<string, string | number | string[]> {
  const cleaned = omitBy(
    {
      q: params.q,
      pincode: params.pincode,
      lat: params.lat,
      lng: params.lng,
      category: params.category,
      brand: params.brand,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      attr: params.attr,
      limit: params.limit,
      offset: params.offset,
    },
    (value) => isNil(value) || value === '',
  );

  return cleaned as Record<string, string | number | string[]>;
}

export const searchService = {
  searchProducts(params: SearchQueryParams): Promise<SearchResponse> {
    return apiClient.get<SearchResponse>(API_ENDPOINTS.search.products, {
      params: buildSearchParams(params),
    });
  },
};
