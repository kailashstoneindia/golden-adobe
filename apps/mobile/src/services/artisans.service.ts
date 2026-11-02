import type {
  ArtisanAccountDetailsDto,
  ArtisanAccountDetailsInputDto,
  ArtisanCompletionEstimateDto,
  ArtisanHireRequestDto,
  ArtisanOnboardDto,
  ArtisanProfileDto,
  ArtisanPublicProfileDto,
  ArtisanSearchQuery,
  ArtisanTeamMemberDto,
  ArtisanTeamMemberInputDto,
  CancelHireRequestDto,
  CreateCompletionEstimateDto,
  CreateHireRequestDto,
  OrderDto,
  PaginatedArtisanPublicProfilesResponse,
  UpdateArtisanProfileDto,
} from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';
import type { ArtisanDocumentPurpose, ArtisanDocumentUploadUrl } from '../types';

const ENDPOINTS = API_ENDPOINTS.artisans;

export const artisansService = {
  onboard(dto: ArtisanOnboardDto): Promise<ArtisanProfileDto> {
    return apiClient.post<ArtisanProfileDto>(ENDPOINTS.meProfile, dto);
  },
  fetchMe(): Promise<ArtisanProfileDto> {
    return apiClient.get<ArtisanProfileDto>(ENDPOINTS.meProfile);
  },
  updateMe(body: UpdateArtisanProfileDto): Promise<ArtisanProfileDto> {
    return apiClient.patch<ArtisanProfileDto>(ENDPOINTS.meProfile, body);
  },
  replaceAccountDetails(body: ArtisanAccountDetailsInputDto): Promise<ArtisanAccountDetailsDto> {
    return apiClient.put<ArtisanAccountDetailsDto>(ENDPOINTS.meAccountDetails, body);
  },
  createDocumentUploadUrl(
    contentType: string,
    purpose: ArtisanDocumentPurpose = 'lead',
  ): Promise<ArtisanDocumentUploadUrl> {
    return apiClient.post<ArtisanDocumentUploadUrl>(ENDPOINTS.meDocumentUploadUrl, {
      contentType,
      purpose,
    });
  },
  confirmDocumentUpload(key: string): Promise<ArtisanProfileDto> {
    return apiClient.post<ArtisanProfileDto>(ENDPOINTS.meDocumentConfirm, { key });
  },

  addTeamMember(body: ArtisanTeamMemberInputDto): Promise<ArtisanTeamMemberDto> {
    return apiClient.post<ArtisanTeamMemberDto>(ENDPOINTS.meTeam, body);
  },
  updateTeamMember(
    memberId: string,
    body: ArtisanTeamMemberInputDto,
  ): Promise<ArtisanTeamMemberDto> {
    return apiClient.patch<ArtisanTeamMemberDto>(ENDPOINTS.meTeamMember(memberId), body);
  },
  removeTeamMember(memberId: string): Promise<void> {
    return apiClient.delete<void>(ENDPOINTS.meTeamMember(memberId));
  },

  fetchArtisanHireRequests(): Promise<ArtisanHireRequestDto[]> {
    return apiClient.get<ArtisanHireRequestDto[]>(ENDPOINTS.meHireRequests);
  },
  addEstimate(
    requestId: string,
    body: CreateCompletionEstimateDto,
  ): Promise<ArtisanCompletionEstimateDto> {
    return apiClient.post<ArtisanCompletionEstimateDto>(
      ENDPOINTS.meHireRequestEstimates(requestId),
      body,
    );
  },
  startWork(requestId: string): Promise<ArtisanHireRequestDto> {
    return apiClient.patch<ArtisanHireRequestDto>(ENDPOINTS.meHireRequestStart(requestId));
  },
  completeWork(requestId: string): Promise<ArtisanHireRequestDto> {
    return apiClient.patch<ArtisanHireRequestDto>(ENDPOINTS.meHireRequestComplete(requestId));
  },

  createHireRequest(body: CreateHireRequestDto): Promise<ArtisanHireRequestDto> {
    return apiClient.post<ArtisanHireRequestDto>(ENDPOINTS.hireRequests, body);
  },
  fetchHireRequest(requestId: string): Promise<ArtisanHireRequestDto> {
    return apiClient.get<ArtisanHireRequestDto>(ENDPOINTS.hireRequestById(requestId));
  },
  fetchCustomerHireRequests(): Promise<ArtisanHireRequestDto[]> {
    return apiClient.get<ArtisanHireRequestDto[]>(ENDPOINTS.myHireRequests);
  },
  cancelHireRequest(requestId: string, body: CancelHireRequestDto): Promise<ArtisanHireRequestDto> {
    return apiClient.patch<ArtisanHireRequestDto>(ENDPOINTS.hireRequestCancel(requestId), body);
  },
  fetchEstimates(requestId: string): Promise<ArtisanCompletionEstimateDto[]> {
    return apiClient.get<ArtisanCompletionEstimateDto[]>(ENDPOINTS.hireRequestEstimates(requestId));
  },
  fetchAttributedOrders(requestId: string): Promise<OrderDto[]> {
    return apiClient.get<OrderDto[]>(ENDPOINTS.hireRequestOrders(requestId));
  },
  searchArtisans(query: ArtisanSearchQuery): Promise<PaginatedArtisanPublicProfilesResponse> {
    return apiClient.get<PaginatedArtisanPublicProfilesResponse>(ENDPOINTS.search, {
      params: query,
    });
  },
  fetchPublicProfile(artisanId: string): Promise<ArtisanPublicProfileDto> {
    return apiClient.get<ArtisanPublicProfileDto>(ENDPOINTS.publicProfile(artisanId));
  },
};
