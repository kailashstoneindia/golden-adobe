import type {
  BulkStockItem,
  BulkStockResult,
  ListVendorListingsQuery,
  PaginatedResponse,
  SetVendorListingStatusRequest,
  SetVendorStockRequest,
  VendorCategoryDto,
  VendorListingStockDto,
} from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

function buildListingsParams(query: ListVendorListingsQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.status) params.status = query.status;
  if (query.page !== undefined) params.page = query.page;
  if (query.limit !== undefined) params.limit = query.limit;
  return params;
}

export const vendorListingsService = {
  fetchListings(
    query: ListVendorListingsQuery = {},
  ): Promise<PaginatedResponse<VendorListingStockDto>> {
    return apiClient.get<PaginatedResponse<VendorListingStockDto>>(
      API_ENDPOINTS.vendorListings.list,
      { params: buildListingsParams(query) },
    );
  },

  setStock(
    vendorListingId: string,
    body: SetVendorStockRequest,
  ): Promise<VendorListingStockDto> {
    return apiClient.patch<VendorListingStockDto>(
      API_ENDPOINTS.vendorListings.stock(vendorListingId),
      body,
    );
  },

  setStatus(
    vendorListingId: string,
    body: SetVendorListingStatusRequest,
  ): Promise<VendorListingStockDto> {
    return apiClient.patch<VendorListingStockDto>(
      API_ENDPOINTS.vendorListings.status(vendorListingId),
      body,
    );
  },

  bulkSetStock(items: BulkStockItem[]): Promise<BulkStockResult> {
    return apiClient.post<BulkStockResult>(API_ENDPOINTS.vendorListings.bulkStock, { items });
  },

  fetchCategories(): Promise<VendorCategoryDto[]> {
    return apiClient.get<VendorCategoryDto[]>(API_ENDPOINTS.vendors.meCategories);
  },
};
