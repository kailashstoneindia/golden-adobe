import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { MEDIA_CONSTANTS } from '@/constants/mediaConstants';
import { CATALOG_QUERY_KEYS } from '@/queries/useCatalogQueries';
import { mediaService } from '@/services/api/mediaService';

export const MEDIA_QUERY_KEYS = {
  list: (productId: string) => ['catalog', 'media', productId] as const,
};

export function useProductMediaQuery(productId: string) {
  return useQuery({
    queryKey: MEDIA_QUERY_KEYS.list(productId),
    queryFn: () => mediaService.list(productId),
    // While any image is still being processed, re-read the list; the interval
    // switches itself off once every image has settled, so an idle panel does no
    // polling at all.
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'processing')
        ? MEDIA_CONSTANTS.processingPollMs
        : false,
  });
}

// Refreshes everything that shows this product's images: the panel's own list
// and the product detail, which carries the same list.
export function useRefreshProductMedia(productId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEYS.list(productId) }),
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.product(productId) }),
    ]);
}

export function useUpdateMediaMutation(productId: string) {
  const refresh = useRefreshProductMedia(productId);
  return useMutation({
    mutationFn: (input: {
      mediaId: string;
      body: { isPrimary?: boolean; isRepresentative?: boolean };
    }) => mediaService.update(productId, input.mediaId, input.body),
    onSuccess: refresh,
  });
}

export function useReorderMediaMutation(productId: string) {
  const refresh = useRefreshProductMedia(productId);
  return useMutation({
    mutationFn: (mediaIds: string[]) => mediaService.reorder(productId, mediaIds),
    onSuccess: refresh,
  });
}

export function useDeleteMediaMutation(productId: string) {
  const refresh = useRefreshProductMedia(productId);
  return useMutation({
    mutationFn: (mediaId: string) => mediaService.remove(productId, mediaId),
    onSuccess: refresh,
  });
}

export function useReprocessMediaMutation(productId: string) {
  const refresh = useRefreshProductMedia(productId);
  return useMutation({
    mutationFn: (mediaId: string) => mediaService.reprocess(productId, mediaId),
    onSuccess: refresh,
  });
}
