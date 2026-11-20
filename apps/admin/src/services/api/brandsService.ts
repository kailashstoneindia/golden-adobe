import type { BrandDto, MergeBrandResultDto, PaginatedResponse } from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { deleteRequest, getRequest, patchRequest, postRequest } from '@/services/api/apiClient';
import type {
  BrandFormValues,
  BrandListFilters,
  BrandLogoUploadTicket,
} from '@/types/brands.types';

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

  update(brandId: string, body: Partial<BrandFormValues>): Promise<BrandDto> {
    return patchRequest<BrandDto, Partial<BrandFormValues>>(
      API_ENDPOINTS.brands.byId(brandId),
      body,
    );
  },

  setActive(brandId: string, isActive: boolean): Promise<BrandDto> {
    return patchRequest<BrandDto, { isActive: boolean }>(API_ENDPOINTS.brands.active(brandId), {
      isActive,
    });
  },

  addAlias(brandId: string, alias: string): Promise<BrandDto> {
    return postRequest<BrandDto, { alias: string }>(API_ENDPOINTS.brands.aliases(brandId), {
      alias,
    });
  },

  removeAlias(brandId: string, aliasId: string): Promise<void> {
    return deleteRequest(API_ENDPOINTS.brands.alias(brandId, aliasId));
  },

  createLogoUploadUrl(brandId: string, contentType: string): Promise<BrandLogoUploadTicket> {
    return postRequest<BrandLogoUploadTicket, { contentType: string }>(
      API_ENDPOINTS.brands.logoUploadUrl(brandId),
      { contentType },
    );
  },

  merge(brandId: string, intoBrandId: string): Promise<MergeBrandResultDto> {
    return postRequest<MergeBrandResultDto, { intoBrandId: string }>(
      API_ENDPOINTS.brands.merge(brandId),
      { intoBrandId },
    );
  },

  confirmLogo(brandId: string, key: string): Promise<BrandDto> {
    return postRequest<BrandDto, { key: string }>(API_ENDPOINTS.brands.logoConfirm(brandId), {
      key,
    });
  },
};
