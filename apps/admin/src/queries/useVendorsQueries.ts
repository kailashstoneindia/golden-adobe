import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { vendorsService } from '@/services/api/vendorsService';
import type {
  RejectVendorRequest,
  SetVendorCategoriesRequest,
  SetVendorCityRequest,
} from '@/types/vendors.types';

export const VENDORS_QUERY_KEYS = {
  all: ['vendors'] as const,
  list: ['vendors', 'list'] as const,
  detail: (vendorId: string) => ['vendors', 'detail', vendorId] as const,
  categories: (vendorId: string) => ['vendors', 'categories', vendorId] as const,
  cities: ['vendors', 'cities'] as const,
  listings: (vendorId: string, query: { status?: string; page: number }) =>
    ['vendors', 'listings', vendorId, query] as const,
};

export function useVendorsQuery() {
  return useQuery({
    queryKey: VENDORS_QUERY_KEYS.list,
    queryFn: () => vendorsService.fetchVendors(),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

// One page of a vendor's listings in the vendor popup (decision 0058 Task 5).
export function useVendorListingsQuery(
  vendorId: string,
  query: { status?: string; page: number; limit: number },
) {
  return useQuery({
    queryKey: VENDORS_QUERY_KEYS.listings(vendorId, { status: query.status, page: query.page }),
    queryFn: () => vendorsService.fetchVendorListings(vendorId, query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useVendorCategoriesQuery(vendorId: string | null) {
  return useQuery({
    queryKey: VENDORS_QUERY_KEYS.categories(vendorId ?? ''),
    queryFn: () => vendorsService.fetchVendorCategories(vendorId!),
    enabled: Boolean(vendorId),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useCitiesQuery() {
  return useQuery({
    queryKey: VENDORS_QUERY_KEYS.cities,
    queryFn: () => vendorsService.fetchCities(),
    staleTime: APP_CONSTANTS.statsStaleTimeMs,
  });
}

export function useSetVendorCityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { vendorId: string; body: SetVendorCityRequest }) =>
      vendorsService.setVendorCity(options.vendorId, options.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEYS.all });
    },
  });
}

export function useSetVendorCategoriesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { vendorId: string; body: SetVendorCategoriesRequest }) =>
      vendorsService.setVendorCategories(options.vendorId, options.body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: VENDORS_QUERY_KEYS.categories(variables.vendorId),
      });
    },
  });
}

export function useApproveVendorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vendorId: string) => vendorsService.approveVendor(vendorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useRejectVendorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { vendorId: string; body: RejectVendorRequest }) =>
      vendorsService.rejectVendor(options.vendorId, options.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
