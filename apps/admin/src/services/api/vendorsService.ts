import type {
  AdminVendorDto,
  CityDto,
  PaginatedAdminVendorListingsResponse,
  VendorCategoryDto,
  VendorProfileDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest, putRequest } from '@/services/api/apiClient';
import type {
  RejectVendorRequest,
  SetVendorCategoriesRequest,
  SetVendorCityRequest,
} from '@/types/vendors.types';

export const vendorsService = {
  fetchVendors(): Promise<AdminVendorDto[]> {
    return getRequest<AdminVendorDto[]>(API_ENDPOINTS.admin.vendors);
  },

  fetchVendorListings(
    vendorId: string,
    query: { status?: string; page: number; limit: number },
  ): Promise<PaginatedAdminVendorListingsResponse> {
    const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
    if (query.status) params.set('status', query.status);
    return getRequest<PaginatedAdminVendorListingsResponse>(
      `${API_ENDPOINTS.admin.vendorListings(vendorId)}?${params.toString()}`,
    );
  },

  setVendorCity(vendorId: string, body: SetVendorCityRequest): Promise<VendorProfileDto> {
    return patchRequest<VendorProfileDto, SetVendorCityRequest>(
      API_ENDPOINTS.admin.vendorCity(vendorId),
      body,
    );
  },

  fetchVendorCategories(vendorId: string): Promise<VendorCategoryDto[]> {
    return getRequest<VendorCategoryDto[]>(API_ENDPOINTS.admin.vendorCategories(vendorId));
  },

  setVendorCategories(
    vendorId: string,
    body: SetVendorCategoriesRequest,
  ): Promise<VendorCategoryDto[]> {
    return putRequest<VendorCategoryDto[], SetVendorCategoriesRequest>(
      API_ENDPOINTS.admin.vendorCategories(vendorId),
      body,
    );
  },

  fetchCities(): Promise<CityDto[]> {
    return getRequest<CityDto[]>(API_ENDPOINTS.admin.cities);
  },

  approveVendor(vendorId: string): Promise<VendorProfileDto> {
    return patchRequest<VendorProfileDto, Record<string, never>>(
      API_ENDPOINTS.admin.vendorApprove(vendorId),
      {},
    );
  },

  rejectVendor(vendorId: string, body: RejectVendorRequest): Promise<VendorProfileDto> {
    return patchRequest<VendorProfileDto, RejectVendorRequest>(
      API_ENDPOINTS.admin.vendorReject(vendorId),
      body,
    );
  },
};
