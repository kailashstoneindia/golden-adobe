import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { catalogService } from '@/services';
import type {
  BulkPublishRequest,
  CreateProductRequest,
  HsnCodeOption,
  ListProductsQuery,
  UpdateProductRequest,
} from '@/types/catalog.types';

export const CATALOG_QUERY_KEYS = {
  all: ['catalog'] as const,
  categories: ['catalog', 'categories'] as const,
  categoryAttributes: (categoryId: string) =>
    ['catalog', 'category-attributes', categoryId] as const,
  products: (query: ListProductsQuery) => ['catalog', 'products', query] as const,
  product: (productId: string) => ['catalog', 'product', productId] as const,
  readiness: (productId: string) => ['catalog', 'readiness', productId] as const,
  reviewQueue: ['catalog', 'review-queue'] as const,
};

export function useCategoryTreeQuery() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.categories,
    queryFn: () => catalogService.fetchCategoryTree(),
    // The taxonomy changes on the order of never — a seeder run, not a user
    // action — so a short stale time would just add round trips.
    staleTime: APP_CONSTANTS.statsStaleTimeMs,
  });
}

export function useCategoryAttributesQuery(categoryId: string | null) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.categoryAttributes(categoryId ?? ''),
    queryFn: () => catalogService.fetchCategoryAttributes(categoryId!),
    enabled: Boolean(categoryId),
    staleTime: APP_CONSTANTS.statsStaleTimeMs,
  });
}

export function useProductsQuery(query: ListProductsQuery) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.products(query),
    queryFn: () => catalogService.fetchProducts(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useProductQuery(productId: string | null) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.product(productId ?? ''),
    queryFn: () => catalogService.fetchProduct(productId!),
    enabled: Boolean(productId),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function usePublishProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => catalogService.publishProduct(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

export function useUnpublishProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => catalogService.unpublishProduct(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

export function useBulkPublishProductsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkPublishRequest) => catalogService.bulkPublishProducts(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

export function useUploadImportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { categoryId: string; file: File }) =>
      catalogService.uploadImport(options.categoryId, options.file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

export function useReviewQueueQuery() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.reviewQueue,
    queryFn: () => catalogService.fetchReviewQueue(),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useLinkReviewRowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { importRowId: string; masterProductId: string }) =>
      catalogService.linkReviewRow(options.importRowId, options.masterProductId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

export function useRejectReviewRowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { importRowId: string; reason: string }) =>
      catalogService.rejectReviewRow(options.importRowId, options.reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

// Decision 0058 Task 13: correct a product's name from its popup.
export function useRenameProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { productId: string; name: string }) =>
      catalogService.renameProduct(options.productId, options.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

// ── Decision 0063: readiness, create/edit, retire/restore/delete, merge, HSN ──

export function useProductReadinessQuery(productId: string | null) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.readiness(productId ?? ''),
    queryFn: () => catalogService.fetchReadiness(productId!),
    enabled: Boolean(productId),
  });
}

function useCatalogMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all }),
  });
}

export function useCreateProductMutation() {
  return useCatalogMutation((body: CreateProductRequest) => catalogService.createProduct(body));
}

export function useUpdateProductMutation(productId: string) {
  return useCatalogMutation((body: UpdateProductRequest) =>
    catalogService.updateProduct(productId, body),
  );
}

export function useRetireProductMutation() {
  return useCatalogMutation((productId: string) => catalogService.retireProduct(productId));
}

export function useRestoreProductMutation() {
  return useCatalogMutation((productId: string) => catalogService.restoreProduct(productId));
}

export function useDeleteProductMutation() {
  return useCatalogMutation((productId: string) => catalogService.deleteProduct(productId));
}

export function useMergeProductMutation(productId: string) {
  return useCatalogMutation((intoProductId: string) =>
    catalogService.mergeProduct(productId, intoProductId),
  );
}

export function useHsnCodesQuery(search: string) {
  return useQuery({
    queryKey: ['catalog', 'hsn-codes', search] as const,
    queryFn: () => catalogService.listHsnCodes(search),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useCreateHsnCodeMutation() {
  return useCatalogMutation((body: HsnCodeOption) => catalogService.createHsnCode(body));
}

export function useSetCategoryHsnDefaultMutation() {
  return useCatalogMutation((args: { categoryId: string; hsnCodeDefault: string | null }) =>
    catalogService.setCategoryHsnDefault(args.categoryId, args.hsnCodeDefault),
  );
}
