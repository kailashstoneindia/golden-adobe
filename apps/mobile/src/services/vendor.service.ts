import type { VendorOnboardDto, VendorProfileDto } from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

export const vendorService = {
  onboard(dto: VendorOnboardDto): Promise<VendorProfileDto> {
    return apiClient.post<VendorProfileDto>(API_ENDPOINTS.vendors.onboard, dto);
  },
};
