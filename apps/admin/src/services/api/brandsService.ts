import type { BrandDto, PaginatedResponse } from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, postRequest } from '@/services/api/apiClient';
import type { BrandFormValues, BrandListFilters } from '@/types/brands.types';

function queryString(filters: BrandListFilters): string {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const value = params.toString();
  return value ? `?${value}` : '';
}

// Decision 0063: the admin brands API.
export const brandsService = {
  list(filters: BrandListFilters): Promise<PaginatedResponse<BrandDto>> {
    return getRequest(`${API_ENDPOINTS.brands.list}${queryString(filters)}`);
  },

  get(brandId: string): Promise<BrandDto> {
    return getRequest(API_ENDPOINTS.brands.byId(brandId));
  },

  create(body: BrandFormValues): Promise<BrandDto> {
    return postRequest<BrandDto, BrandFormValues>(API_ENDPOINTS.brands.list, body);
  },
};
