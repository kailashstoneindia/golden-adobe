import type { ArtisanHireRequestStatus, TradeType } from '@golden-abode/types';

export const ARTISAN_CONSTANTS = {
  // Mirrors the backend's DOCUMENT_MAX_BYTES presign condition.
  documentMaxBytes: 10 * 1024 * 1024,
  bioMaxLength: 500,
} as const;

export const ARTISAN_DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  CARPENTER: 'Carpenter',
  PLUMBER: 'Plumber',
  PAINTER: 'Painter',
  ELECTRICIAN: 'Electrician',
  MASON: 'Mason',
  TILE_LAYING: 'Tile laying',
  OTHERS: 'Other trade',
};

export const HIRE_REQUEST_STATUS_LABELS: Record<ArtisanHireRequestStatus, string> = {
  PENDING_ADMIN_REVIEW: 'Pending review',
  ADMIN_REJECTED: 'Rejected',
  ACCEPTED_BY_ARTISAN: 'Accepted',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Statuses the backend allows `PATCH /artisans/hire-requests/:id/cancel` from. */
export const CANCELLABLE_HIRE_STATUSES: readonly ArtisanHireRequestStatus[] = [
  'PENDING_ADMIN_REVIEW',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
];

/** Statuses checkout accepts as a `bookingId` (decision 0045). */
export const BOOKING_ATTRIBUTABLE_HIRE_STATUSES: readonly ArtisanHireRequestStatus[] = [
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
  'COMPLETED',
];
