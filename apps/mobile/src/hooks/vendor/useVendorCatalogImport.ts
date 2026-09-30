import type { QueryClient } from '@tanstack/react-query';
import type {
  ChoosePendingCandidateRequest,
  PendingConfirmation,
  VendorCatalogExportScope,
  VendorImportResult,
} from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { vendorCatalogImportService } from '../../services';
import type { CatalogUploadFile } from '../../types';

function buildExportScopeKey(scope: VendorCatalogExportScope): string {
  return JSON.stringify(scope);
}

async function invalidatePendingAndListings(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: QUERY_KEYS.vendorCatalogImport.pendingConfirmations(),
  });
  await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorListings.all });
}

export function useVendorExportCountQuery(
  scope: VendorCatalogExportScope,
  isEnabled: boolean,
) {
  return useQuery({
    queryKey: QUERY_KEYS.vendorCatalogImport.exportCount(buildExportScopeKey(scope)),
    queryFn: () => vendorCatalogImportService.fetchExportCount(scope),
    enabled: isEnabled && scope.leafCategoryIds.length > 0,
    staleTime: 30_000,
  });
}

export function usePendingConfirmationsQuery() {
  return useQuery<PendingConfirmation[]>({
    queryKey: QUERY_KEYS.vendorCatalogImport.pendingConfirmations(),
    queryFn: () => vendorCatalogImportService.fetchPendingConfirmations(),
    staleTime: 15_000,
  });
}

export function useDownloadVendorExportMutation() {
  return useMutation({
    mutationFn: (scope: VendorCatalogExportScope) =>
      vendorCatalogImportService.downloadExport(scope),
  });
}

export function useUploadVendorCatalogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: CatalogUploadFile) => vendorCatalogImportService.uploadCatalog(file),
    onSuccess: async (_result: VendorImportResult) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorListings.all });
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.vendorCatalogImport.pendingConfirmations(),
      });
    },
  });
}

export function useConfirmPendingListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vendorListingId: string) =>
      vendorCatalogImportService.confirmPendingListing(vendorListingId),
    onSuccess: async () => {
      await invalidatePendingAndListings(queryClient);
    },
  });
}

export function useChoosePendingCandidateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { vendorListingId: string; body: ChoosePendingCandidateRequest }) =>
      vendorCatalogImportService.choosePendingCandidate(
        variables.vendorListingId,
        variables.body,
      ),
    onSuccess: async () => {
      await invalidatePendingAndListings(queryClient);
    },
  });
}

export function useRejectPendingListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vendorListingId: string) =>
      vendorCatalogImportService.rejectPendingListing(vendorListingId),
    onSuccess: async () => {
      await invalidatePendingAndListings(queryClient);
    },
  });
}
