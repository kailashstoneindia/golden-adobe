import type { ArtisanHireRequestStatus } from '@golden-abode/types';

// Decision 0055 rules, shared by HireRequestsService and the DTO mapper.

// How long the ustaad has to accept or decline, counted from the admin
// allowing the request (admin_reviewed_at).
export const ARTISAN_RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1000;

// A customer may hold only one request in these statuses per ustaad. Must
// match the partial unique index in
// 20261104090100-add-open-hire-request-unique-index.js.
export const OPEN_HIRE_REQUEST_STATUSES: ArtisanHireRequestStatus[] = [
  'PENDING_ADMIN_REVIEW',
  'PENDING_ARTISAN_RESPONSE',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
];

// The ustaad sees the customer's name and phone only in these statuses.
export const CUSTOMER_CONTACT_VISIBLE_STATUSES = new Set<ArtisanHireRequestStatus>([
  'PENDING_ARTISAN_RESPONSE',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
]);

// Never shown to the ustaad: the admin hasn't sent it, or blocked it.
export const HIDDEN_FROM_ARTISAN_STATUSES: ArtisanHireRequestStatus[] = [
  'PENDING_ADMIN_REVIEW',
  'ADMIN_REJECTED',
];

export function artisanResponseDueAt(adminReviewedAt: Date): Date {
  return new Date(adminReviewedAt.getTime() + ARTISAN_RESPONSE_WINDOW_MS);
}
