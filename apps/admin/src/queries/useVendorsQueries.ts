import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { vendorsService } from '@/services/api/vendorsService';
import type { SetVendorCategoriesRequest, SetVendorCityRequest } from '@/types/vendors.types';

export const VENDORS_QUERY_KEYS = {
  all: ['vendors'] as const,
  list: ['vendors', 'list'] as const,
  detail: (vendorId: string) => ['vendors', 'detail', vendorId] as const,
  categories: (vendorId: string) => ['vendors', 'categories', vendorId] as const,
  cities: ['vendors', 'cities'] as const,
};

export function useVendorsQuery() {
  return useQuery({
    queryKey: VENDORS_QUERY_KEYS.list,
    queryFn: () => vendorsService.fetchVendors(),
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
