import type { VendorListingStatus } from '@golden-abode/types';

import type { BadgeVariant } from '../components/ui/Badge';

export function formatListingStatusLabel(status: VendorListingStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Paused';
  return 'Out of stock';
}

export function listingStatusBadgeVariant(status: VendorListingStatus): BadgeVariant {
  if (status === 'active') return 'success';
  if (status === 'paused') return 'pending';
  return 'error';
}

export function formatListingQuantity(quantityAvailable: number | null, isPaint: boolean): string {
  if (isPaint) {
    return 'Tinted to order';
  }
  if (quantityAvailable === null) {
    return 'Stock not set';
  }
  return `Qty ${quantityAvailable}`;
}
