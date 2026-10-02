import type { CityDto, VendorCategoryDto, VendorProfileDto } from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest, putRequest } from '@/services/api/apiClient';
import type { SetVendorCategoriesRequest, SetVendorCityRequest } from '@/types/vendors.types';

export const vendorsService = {
  fetchVendors(): Promise<VendorProfileDto[]> {
    return getRequest<VendorProfileDto[]>(API_ENDPOINTS.admin.vendors);
  },

  fetchVendorById(vendorId: string): Promise<VendorProfileDto> {
    return getRequest<VendorProfileDto>(API_ENDPOINTS.admin.vendorById(vendorId));
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
};
