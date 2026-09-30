import type { BulkPublishResult, CategoryNode, ProductStatus } from '@/types/catalog.types';

export const PRODUCT_STATUS_FILTERS: Array<{ label: string; value: ProductStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Live', value: 'live' },
  { label: 'Deprecated', value: 'deprecated' },
];

export function flattenCategoryOptions(
  nodes: CategoryNode[],
  depth = 0,
): Array<{ node: CategoryNode; depth: number }> {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenCategoryOptions(node.children, depth + 1),
  ]);
}

export function toggleProductId(currentIds: string[], productId: string): string[] {
  if (currentIds.includes(productId)) {
    return currentIds.filter((id) => id !== productId);
  }
  return [...currentIds, productId];
}

export function formatBulkPublishResult(result: BulkPublishResult): string {
  const failureCount = result.failed.length;
  if (failureCount === 0) {
    return `Published ${result.published} of ${result.requested}.`;
  }
  const firstReason = result.failed[0]?.reason ?? 'unknown error';
  return `Published ${result.published} of ${result.requested}. ${failureCount} failed (e.g. ${firstReason}).`;
}
