import type {
  UpdateVendorOnboardingProgressDto,
  VendorOnboardDto,
  VendorOnboardingStage,
  VendorProfileDto,
} from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

export const vendorService = {
  onboard(dto: VendorOnboardDto): Promise<VendorProfileDto> {
    return apiClient.post<VendorProfileDto>(API_ENDPOINTS.vendors.onboard, dto);
  },
  updateOnboardingProgress(onboardingStage: VendorOnboardingStage): Promise<{ success: boolean }> {
    const requestBody: UpdateVendorOnboardingProgressDto = { onboardingStage };
    return apiClient.patch<{ success: boolean }>(API_ENDPOINTS.vendors.onboardingProgress, requestBody);
  },
};
