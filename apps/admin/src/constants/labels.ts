import type { ArtisanHireRequestStatus, TradeType, VendorProfileDto } from '@golden-abode/types';

import type { ProductStatus } from '@/types/catalog.types';

// Follow-up F10 (decision 0058): admin pages show friendly labels instead of
// raw codes. Record<Union, string> makes the compiler insist on a label for
// every value, so a new status can't silently fall through to the raw code.

export const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  CARPENTER: 'Carpenter',
  PLUMBER: 'Plumber',
  PAINTER: 'Painter',
  ELECTRICIAN: 'Electrician',
  MASON: 'Mason',
  TILE_LAYING: 'Tile laying',
  OTHERS: 'Other trade',
};

// Worded for the admin, who sees every stage of a request.
export const HIRE_REQUEST_STATUS_LABELS: Record<ArtisanHireRequestStatus, string> = {
  PENDING_ADMIN_REVIEW: 'Waiting for admin review',
  ADMIN_REJECTED: 'Rejected by admin',
  PENDING_ARTISAN_RESPONSE: 'Waiting for ustaad',
  ARTISAN_DECLINED: 'Declined by ustaad',
  EXPIRED: 'Expired (no reply)',
  ACCEPTED_BY_ARTISAN: 'Accepted',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  live: 'Live',
  deprecated: 'Deprecated',
};

export const VENDOR_STATUS_LABELS: Record<VendorProfileDto['status'], string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// For a value that may be missing, or newer than this build of the admin:
// an unknown code is shown as-is, never as a blank and never as some other
// status (e.g. an unknown vendor status must not read as "Pending").
// The map and the code share one type, so a trade map can't be used on a status.
export function labelFor<Code extends string>(
  labels: Record<Code, string>,
  code: Code | null | undefined,
): string {
  if (!code) return '—';
  return Object.prototype.hasOwnProperty.call(labels, code) ? labels[code] : code;
}
