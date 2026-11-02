import type {
  ArtisanCompletionEstimateDto,
  ArtisanHireRequestDto,
  CreateHireRequestDto,
  OrderDto,
} from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { artisansService } from '../../services';

export function useArtisanHireRequestsQuery(isEnabled: boolean) {
  return useQuery<ArtisanHireRequestDto[]>({
    queryKey: QUERY_KEYS.hireRequests.artisanList(),
    queryFn: () => artisansService.fetchArtisanHireRequests(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.hireRequestsStaleTimeMs,
  });
}

export function useCustomerHireRequestsQuery(isEnabled: boolean) {
  return useQuery<ArtisanHireRequestDto[]>({
    queryKey: QUERY_KEYS.hireRequests.customerList(),
    queryFn: () => artisansService.fetchCustomerHireRequests(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.hireRequestsStaleTimeMs,
  });
}

export function useHireRequestQuery(requestId: string | null) {
  return useQuery<ArtisanHireRequestDto>({
    queryKey: QUERY_KEYS.hireRequests.detail(requestId ?? ''),
    queryFn: () => artisansService.fetchHireRequest(requestId!),
    enabled: Boolean(requestId),
    staleTime: APP_CONSTANTS.hireRequestsStaleTimeMs,
  });
}

export function useHireRequestEstimatesQuery(requestId: string, isEnabled: boolean) {
  return useQuery<ArtisanCompletionEstimateDto[]>({
    queryKey: QUERY_KEYS.hireRequests.estimates(requestId),
    queryFn: () => artisansService.fetchEstimates(requestId),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.hireRequestsStaleTimeMs,
  });
}

export function useHireRequestOrdersQuery(requestId: string, isEnabled: boolean) {
  return useQuery<OrderDto[]>({
    queryKey: QUERY_KEYS.hireRequests.orders(requestId),
    queryFn: () => artisansService.fetchAttributedOrders(requestId),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.ordersStaleTimeMs,
  });
}

function useInvalidateHireRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hireRequests.all });
}

export function useCreateHireRequestMutation() {
  const invalidateHireRequests = useInvalidateHireRequests();
  return useMutation({
    mutationFn: (body: CreateHireRequestDto) => artisansService.createHireRequest(body),
    onSuccess: invalidateHireRequests,
  });
}

export function useCancelHireRequestMutation() {
  const invalidateHireRequests = useInvalidateHireRequests();
  return useMutation({
    mutationFn: (options: { requestId: string; reason: string }) =>
      artisansService.cancelHireRequest(options.requestId, { reason: options.reason }),
    onSuccess: invalidateHireRequests,
  });
}

export function useStartHireRequestMutation() {
  const invalidateHireRequests = useInvalidateHireRequests();
  return useMutation({
    mutationFn: (requestId: string) => artisansService.startWork(requestId),
    onSuccess: invalidateHireRequests,
  });
}

export function useCompleteHireRequestMutation() {
  const invalidateHireRequests = useInvalidateHireRequests();
  return useMutation({
    mutationFn: (requestId: string) => artisansService.completeWork(requestId),
    onSuccess: invalidateHireRequests,
  });
}

export function useAddEstimateMutation() {
  const invalidateHireRequests = useInvalidateHireRequests();
  return useMutation({
    mutationFn: (options: { requestId: string; estimatedDays: number; note?: string }) =>
      artisansService.addEstimate(options.requestId, {
        estimatedDays: options.estimatedDays,
        ...(options.note ? { note: options.note } : {}),
      }),
    // Refreshes both the estimate history and each list's `latestEstimate`.
    onSuccess: invalidateHireRequests,
  });
}
