import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { artisansService } from '@/services';
import type {
  RejectArtisanVerificationRequest,
  ReviewArtisanHireRequestRequest,
} from '@/types/artisans.types';

export const ARTISANS_QUERY_KEYS = {
  all: ['artisans'] as const,
  pendingVerification: ['artisans', 'pending-verification'] as const,
  pendingHireRequests: ['artisans', 'hire-requests', 'pending'] as const,
};

export function useArtisanPendingVerificationQuery() {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.pendingVerification,
    queryFn: () => artisansService.fetchPendingVerification(),
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

export function useArtisanPendingHireRequestsQuery() {
  return useQuery({
    queryKey: ARTISANS_QUERY_KEYS.pendingHireRequests,
    queryFn: () => artisansService.fetchPendingHireRequests(),
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
