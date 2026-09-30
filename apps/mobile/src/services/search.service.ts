import type {
  ProductListingsQueryParams,
  ProductListingsResponse,
  SearchQueryParams,
  SearchResponse,
} from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

function buildSearchParams(params: SearchQueryParams): Record<string, string | number | string[]> {
  const queryParams: Record<string, string | number | string[]> = {};

  if (params.q) queryParams.q = params.q;
  if (params.pincode) queryParams.pincode = params.pincode;
  if (params.lat !== undefined) queryParams.lat = params.lat;
  if (params.lng !== undefined) queryParams.lng = params.lng;
  if (params.category) queryParams.category = params.category;
  if (params.brand) queryParams.brand = params.brand;
  if (params.minPrice !== undefined) queryParams.minPrice = params.minPrice;
  if (params.maxPrice !== undefined) queryParams.maxPrice = params.maxPrice;
  if (params.attr?.length) queryParams.attr = params.attr;
  if (params.limit !== undefined) queryParams.limit = params.limit;
  if (params.offset !== undefined) queryParams.offset = params.offset;

  return queryParams;
}

function buildListingsParams(
  params: ProductListingsQueryParams,
): Record<string, string | number> {
  const queryParams: Record<string, string | number> = {};
  if (params.pincode) queryParams.pincode = params.pincode;
  if (params.lat !== undefined) queryParams.lat = params.lat;
  if (params.lng !== undefined) queryParams.lng = params.lng;
  return queryParams;
}

export const searchService = {
  searchProducts(params: SearchQueryParams): Promise<SearchResponse> {
    return apiClient.get<SearchResponse>(API_ENDPOINTS.search.products, {
      params: buildSearchParams(params),
    });
  },

  fetchProductListings(
    masterProductId: string,
    params: ProductListingsQueryParams,
  ): Promise<ProductListingsResponse> {
    return apiClient.get<ProductListingsResponse>(API_ENDPOINTS.search.listings(masterProductId), {
      params: buildListingsParams(params),
    });
  },
};
