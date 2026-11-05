import type {
  ArtisanHireRequestDto,
  ArtisanHireRequestStatus,
  ArtisanListQuery,
  PaginatedArtisansAwaitingDocumentResponse,
  AdminArtisanDto,
  PaginatedAdminArtisansResponse,
  PaginatedAdminHireRequestsResponse,
  ArtisanAccountDetailsInputDto,
  ArtisanProfileDto,
  UpdateArtisanProfileDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { deleteRequest, getRequest, patchRequest, putRequest } from '@/services/api/apiClient';
import type {
  CancelArtisanHireRequestRequest,
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

type HireRequestListQuery = ArtisanListQuery & { status?: ArtisanHireRequestStatus };

function buildHireRequestQueryString(query: HireRequestListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.status) params.set('status', query.status);
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export const artisansService = {
  fetchArtisans(query: ArtisanListQuery): Promise<PaginatedAdminArtisansResponse> {
    const suffix = buildArtisanQueryString(query);
    return getRequest<PaginatedAdminArtisansResponse>(`${API_ENDPOINTS.admin.artisans}${suffix}`);
  },

  // Decision 0058 Task 11. These answer with the admin view of the ustaad.
  updateArtisanProfile(artisanId: string, body: UpdateArtisanProfileDto): Promise<AdminArtisanDto> {
    return patchRequest<AdminArtisanDto, UpdateArtisanProfileDto>(
      API_ENDPOINTS.admin.artisanById(artisanId),
      body,
    );
  },

  updateArtisanBank(
    artisanId: string,
    body: ArtisanAccountDetailsInputDto,
  ): Promise<AdminArtisanDto> {
    return putRequest<AdminArtisanDto, ArtisanAccountDetailsInputDto>(
      API_ENDPOINTS.admin.artisanAccountDetails(artisanId),
      body,
    );
  },

  updateTeamMember(
    artisanId: string,
    memberId: string,
    body: { name?: string; roleOnTeam?: string; phone?: string },
  ): Promise<AdminArtisanDto> {
    return patchRequest<AdminArtisanDto, { name?: string; roleOnTeam?: string; phone?: string }>(
      API_ENDPOINTS.admin.artisanTeamMember(artisanId, memberId),
      body,
    );
  },

  removeTeamMember(artisanId: string, memberId: string): Promise<void> {
    return deleteRequest(API_ENDPOINTS.admin.artisanTeamMember(artisanId, memberId));
  },

  fetchArtisanById(artisanId: string): Promise<AdminArtisanDto> {
    return getRequest<AdminArtisanDto>(API_ENDPOINTS.admin.artisanById(artisanId));
  },

  fetchPendingVerification(query: ArtisanListQuery): Promise<PaginatedAdminArtisansResponse> {
    const suffix = buildArtisanQueryString(query);
    return getRequest<PaginatedAdminArtisansResponse>(
      `${API_ENDPOINTS.admin.artisansPendingVerification}${suffix}`,
    );
  },

  fetchAwaitingDocument(
    query: ArtisanListQuery,
  ): Promise<PaginatedArtisansAwaitingDocumentResponse> {
    const suffix = buildArtisanQueryString(query);
    return getRequest<PaginatedArtisansAwaitingDocumentResponse>(
      `${API_ENDPOINTS.admin.artisansAwaitingDocument}${suffix}`,
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

  fetchPendingHireRequests(query: ArtisanListQuery): Promise<PaginatedAdminHireRequestsResponse> {
    const suffix = buildArtisanQueryString(query);
    return getRequest<PaginatedAdminHireRequestsResponse>(
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

  fetchAllHireRequests(query: HireRequestListQuery): Promise<PaginatedAdminHireRequestsResponse> {
    const suffix = buildHireRequestQueryString(query);
    return getRequest<PaginatedAdminHireRequestsResponse>(
      `${API_ENDPOINTS.admin.artisanHireRequestsAll}${suffix}`,
    );
  },

  cancelHireRequest(
    requestId: string,
    body: CancelArtisanHireRequestRequest,
  ): Promise<ArtisanHireRequestDto> {
    return patchRequest<ArtisanHireRequestDto, CancelArtisanHireRequestRequest>(
      API_ENDPOINTS.admin.cancelArtisanHireRequest(requestId),
      body,
    );
  },
};
