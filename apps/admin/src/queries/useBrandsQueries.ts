import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { brandsService } from '@/services';
import { uploadToS3 } from '@/services/api/mediaService';
import type { BrandFormValues, BrandListFilters } from '@/types/brands.types';

import { CATALOG_QUERY_KEYS } from './useCatalogQueries';

// Decision 0063.
export const brandKeys = {
  all: ['brands'] as const,
  list: (filters: BrandListFilters) => ['brands', 'list', filters] as const,
  detail: (brandId: string) => ['brands', 'detail', brandId] as const,
};

export function useBrandsQuery(filters: BrandListFilters) {
  return useQuery({
    queryKey: brandKeys.list(filters),
    queryFn: () => brandsService.list(filters),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useBrandQuery(brandId: string | null) {
  return useQuery({
    queryKey: brandKeys.detail(brandId ?? ''),
    queryFn: () => brandsService.get(brandId!),
    enabled: brandId != null,
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

// Brand changes show up on product screens too (brand names, counts), so
// every mutation refreshes both.
function useRefreshBrands() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: brandKeys.all }),
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
    ]);
}

export function useCreateBrandMutation() {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: (body: BrandFormValues) => brandsService.create(body),
    onSuccess: refresh,
  });
}

export function useUpdateBrandMutation(brandId: string) {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: (body: Partial<BrandFormValues>) => brandsService.update(brandId, body),
    onSuccess: refresh,
  });
}

export function useSetBrandActiveMutation(brandId: string) {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: (isActive: boolean) => brandsService.setActive(brandId, isActive),
    onSuccess: refresh,
  });
}

export function useAddBrandAliasMutation(brandId: string) {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: (alias: string) => brandsService.addAlias(brandId, alias),
    onSuccess: refresh,
  });
}

export function useRemoveBrandAliasMutation(brandId: string) {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: (aliasId: string) => brandsService.removeAlias(brandId, aliasId),
    onSuccess: refresh,
  });
}

// Ticket, then the file straight to storage, then confirm (decision 0063).
export function useUploadBrandLogoMutation(brandId: string) {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: async (file: File) => {
      const ticket = await brandsService.createLogoUploadUrl(brandId, file.type);
      await uploadToS3({ url: ticket.url, fields: ticket.fields }, file);
      return brandsService.confirmLogo(brandId, ticket.key);
    },
    onSuccess: refresh,
  });
}

export function useMergeBrandMutation(brandId: string) {
  const refresh = useRefreshBrands();
  return useMutation({
    mutationFn: (intoBrandId: string) => brandsService.merge(brandId, intoBrandId),
    onSuccess: refresh,
  });
}
