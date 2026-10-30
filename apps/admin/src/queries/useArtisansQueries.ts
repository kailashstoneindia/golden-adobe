import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArtisanHireRequestStatus, ArtisanListQuery } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { artisansService } from '@/services';
import type {
  CancelArtisanHireRequestRequest,
  RejectArtisanVerificationRequest,
  ReviewArtisanHireRequestRequest,
} from '@/types/artisans.types';

type HireRequestListQuery = ArtisanListQuery & { status?: ArtisanHireRequestStatus };

export const ARTISANS_QUERY_KEYS = {
  all: ['artisans'] as const,
  list: (query: ArtisanListQuery) => ['artisans', 'list', query] as const,
  detail: (artisanId: string) => ['artisans', 'detail', artisanId] as const,
  pendingVerification: (query: ArtisanListQuery) =>
    ['artisans', 'pending-verification', query] as const,
  pendingHireRequests: (query: ArtisanListQuery) =>
    ['artisans', 'hire-requests', 'pending', query] as const,
  allHireRequests: (query: HireRequestListQuery) =>
    ['artisans', 'hire-requests', 'all', query] as const,
};

export function useArtisansQuery(query: ArtisanListQuery) {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.list(query),
    queryFn: () => artisansService.fetchArtisans(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useArtisanByIdQuery(artisanId: string | null) {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.detail(artisanId ?? ''),
    queryFn: () => artisansService.fetchArtisanById(artisanId!),
    enabled: artisanId != null,
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useArtisanPendingVerificationQuery(query: ArtisanListQuery) {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.pendingVerification(query),
    queryFn: () => artisansService.fetchPendingVerification(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useVerifyArtisanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (artisanId: string) => artisansService.verifyArtisan(artisanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ARTISANS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useRejectArtisanVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { artisanId: string; body: RejectArtisanVerificationRequest }) =>
      artisansService.rejectArtisanVerification(options.artisanId, options.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ARTISANS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useArtisanPendingHireRequestsQuery(query: ArtisanListQuery) {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.pendingHireRequests(query),
    queryFn: () => artisansService.fetchPendingHireRequests(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useReviewHireRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { requestId: string; body: ReviewArtisanHireRequestRequest }) =>
      artisansService.reviewHireRequest(options.requestId, options.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ARTISANS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useAllHireRequestsQuery(query: HireRequestListQuery) {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.allHireRequests(query),
    queryFn: () => artisansService.fetchAllHireRequests(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useCancelHireRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { requestId: string; body: CancelArtisanHireRequestRequest }) =>
      artisansService.cancelHireRequest(options.requestId, options.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ARTISANS_QUERY_KEYS.all });
    },
  });
}
