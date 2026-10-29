import type { ArtisanHireRequestDto, ArtisanProfileDto } from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest } from '@/services/api/apiClient';
import type {
  RejectArtisanVerificationRequest,
  ReviewArtisanHireRequestRequest,
} from '@/types/artisans.types';

export const artisansService = {
  fetchPendingVerification(): Promise<ArtisanProfileDto[]> {
    return getRequest<ArtisanProfileDto[]>(API_ENDPOINTS.admin.artisansPendingVerification);
  },

  verifyArtisan(artisanId: string): Promise<ArtisanProfileDto> {
    return patchRequest<ArtisanProfileDto, Record<string, never>>(
      API_ENDPOINTS.admin.verifyArtisan(artisanId),
      {},
    );
  },

  rejectArtisanVerification(
    artisanId: string,
    body: RejectArtisanVerificationRequest,
  ): Promise<ArtisanProfileDto> {
    return patchRequest<ArtisanProfileDto, RejectArtisanVerificationRequest>(
      API_ENDPOINTS.admin.rejectArtisanVerification(artisanId),
      body,
    );
  },

  fetchPendingHireRequests(): Promise<ArtisanHireRequestDto[]> {
    return getRequest<ArtisanHireRequestDto[]>(API_ENDPOINTS.admin.artisanHireRequestsPending);
  },

  reviewHireRequest(
    requestId: string,
    body: ReviewArtisanHireRequestRequest,
  ): Promise<ArtisanHireRequestDto> {
    return patchRequest<ArtisanHireRequestDto, ReviewArtisanHireRequestRequest>(
      API_ENDPOINTS.admin.reviewArtisanHireRequest(requestId),
      body,
    );
  },
};
