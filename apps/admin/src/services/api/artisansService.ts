import type {
  ArtisanHireRequestDto,
  ArtisanListQuery,
  PaginatedArtisansResponse,
  PaginatedHireRequestsResponse,
  ArtisanProfileDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest } from '@/services/api/apiClient';
import type {
  RejectArtisanVerificationRequest,
  ReviewArtisanHireRequestRequest,
} from '@/types/artisans.types';

function buildArtisanQueryString(query: ArtisanListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export const artisansService = {
  fetchPendingVerification(query: ArtisanListQuery): Promise<PaginatedArtisansResponse> {
    const suffix = buildArtisanQueryString(query);
    return getRequest<PaginatedArtisansResponse>(
      `${API_ENDPOINTS.admin.artisansPendingVerification}${suffix}`,
    );
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

  fetchPendingHireRequests(query: ArtisanListQuery): Promise<PaginatedHireRequestsResponse> {
    const suffix = buildArtisanQueryString(query);
    return getRequest<PaginatedHireRequestsResponse>(
      `${API_ENDPOINTS.admin.artisanHireRequestsPending}${suffix}`,
    );
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
