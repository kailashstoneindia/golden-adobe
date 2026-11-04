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

// The ustaad only sees a request the admin let through: it has been
// reviewed (admin_reviewed_at set) and not blocked. A request cancelled
// while still in admin review was never sent, so it stays hidden too —
// the current status alone can't tell that (PR #41 review).
export function isVisibleToArtisan(request: {
  status: string;
  adminReviewedAt: Date | null;
}): boolean {
  return request.adminReviewedAt !== null && request.status !== 'ADMIN_REJECTED';
}

// Load on the ustaad for the admin's capacity check: jobs they're working,
// plus requests already sent to them and waiting on an answer, so a burst
// of allows doesn't all read as zero (PR #41 review).
export const CAPACITY_LOAD_STATUSES: ArtisanHireRequestStatus[] = [
  'PENDING_ARTISAN_RESPONSE',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
];

export function artisanResponseDueAt(adminReviewedAt: Date): Date {
  return new Date(adminReviewedAt.getTime() + ARTISAN_RESPONSE_WINDOW_MS);
}
