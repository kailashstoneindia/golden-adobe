import { PaginatedResponse } from './pagination.types';

export type TradeType =
  | 'CARPENTER'
  | 'PLUMBER'
  | 'PAINTER'
  | 'ELECTRICIAN'
  | 'MASON'
  | 'TILE_LAYING'
  | 'OTHERS';

// The single source of truth for the TradeType union's members, for
// anywhere (e.g. class-validator's @IsEnum) that needs the values as a
// runtime array rather than just a type.
export const TRADE_TYPES: TradeType[] = [
  'CARPENTER',
  'PLUMBER',
  'PAINTER',
  'ELECTRICIAN',
  'MASON',
  'TILE_LAYING',
  'OTHERS',
];

export interface ArtisanAccountDetailsDto {
  id: string;
  artisanId: string;
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtisanAccountDetailsInputDto {
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
}

export interface ArtisanTeamMemberDto {
  id: string;
  artisanId: string;
  name: string | null;
  roleOnTeam: string | null;
  phone: string | null;
  documentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtisanTeamMemberInputDto {
  name?: string;
  roleOnTeam?: string;
  phone?: string;
  documentUrl?: string;
}

// Full profile — artisan-self or admin view. Never returned to a
// customer-facing caller; see ArtisanPublicProfileDto for that.
export interface ArtisanProfileDto {
  id: string;
  userId: string;
  tradeType: TradeType;
  experienceYears: number | null;
  bio: string | null;
  servicePincode: string | null;
  documentUrl: string | null;
  isVerified: boolean;
  isAvailable: boolean;
  accountDetails: ArtisanAccountDetailsDto | null;
  team: ArtisanTeamMemberDto[];
  createdAt: string;
  updatedAt: string;
}

// Customer-facing view — bio-only visibility rule (spec §5). No phone, no
// account details, no raw document url.
export interface ArtisanPublicProfileDto {
  id: string;
  tradeType: TradeType;
  experienceYears: number | null;
  bio: string | null;
  isAvailable: boolean;
  isVerified: boolean;
}

export interface ArtisanOnboardDto {
  tradeType: TradeType;
  servicePincode?: string;
  experienceYears?: number;
  bio?: string;
}

export interface UpdateArtisanProfileDto {
  tradeType?: TradeType;
  experienceYears?: number;
  bio?: string;
  servicePincode?: string;
  isAvailable?: boolean;
}

export type ArtisanHireRequestStatus =
  | 'PENDING_ADMIN_REVIEW'
  | 'ADMIN_REJECTED'
  // Admin allowed it; waiting on the ustaad to accept or decline (0055).
  | 'PENDING_ARTISAN_RESPONSE'
  | 'ARTISAN_DECLINED'
  // The ustaad didn't answer within the response window (0055).
  | 'EXPIRED'
  | 'ACCEPTED_BY_ARTISAN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

// Single source of truth for ArtisanHireRequestStatus's members, same
// rationale as TRADE_TYPES above: callers that need the values as a
// runtime array (e.g. class-validator's @IsIn) read this instead of
// re-listing the union.
export const HIRE_REQUEST_STATUSES: ArtisanHireRequestStatus[] = [
  'PENDING_ADMIN_REVIEW',
  'ADMIN_REJECTED',
  'PENDING_ARTISAN_RESPONSE',
  'ARTISAN_DECLINED',
  'EXPIRED',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

export interface ArtisanCompletionEstimateDto {
  id: string;
  hireRequestId: string;
  estimatedDays: number;
  note: string | null;
  createdAt: string;
}

export interface CreateCompletionEstimateDto {
  estimatedDays: number;
  note?: string;
}

export interface ArtisanHireRequestDto {
  id: string;
  customerId: string;
  artisanId: string;
  status: ArtisanHireRequestStatus;
  adminReviewedBy: string | null;
  adminReviewedAt: string | null;
  adminRejectReason: string | null;
  addressText: string;
  notes: string | null;
  // Latest estimate only, for list views. Full history via a dedicated
  // endpoint (GET /artisans/hire-requests/:id/estimates).
  latestEstimate: ArtisanCompletionEstimateDto | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  // Ustaad's accept/decline (0055). artisanResponseDueAt is when a
  // PENDING_ARTISAN_RESPONSE request expires; null in every other status.
  artisanRespondedAt: string | null;
  artisanDeclineReason: string | null;
  artisanResponseDueAt: string | null;
  // Customer contact for the ustaad (0055): set only while the request is
  // PENDING_ARTISAN_RESPONSE, ACCEPTED_BY_ARTISAN or IN_PROGRESS, null
  // otherwise.
  customerName: string | null;
  customerPhone: string | null;
  // Capacity signal for admin review (decision 0045 addendum) — present
  // only on admin-facing reads (listPendingAdminReview, listAll), null
  // elsewhere. A proxy, not real per-job assignment tracking: admin reads
  // active jobs against team size and judges capacity themselves.
  artisanActiveJobCount: number | null;
  artisanTeamSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHireRequestDto {
  artisanId: string;
  addressText: string;
  notes?: string;
}

export interface ReviewHireRequestDto {
  approve: boolean;
  rejectReason?: string; // required by the DTO validator when approve is false
}

export interface CancelHireRequestDto {
  reason: string;
}

export interface DeclineHireRequestDto {
  reason: string;
}

export type ArtisanListQuery = {
  page?: number;
  limit?: number;
};

// Customer-facing browse/search (decision 0051 Batch B) — distinct from
// ArtisanListQuery (admin-only, full ArtisanProfileDto). Exact-match
// filters only: tradeType and pincode are both plain equality, not a
// geo/radius search — Artisan has no lat/lng today, only a service
// pincode string.
export type ArtisanSearchQuery = {
  page?: number;
  limit?: number;
  tradeType?: TradeType;
  pincode?: string;
};

export type PaginatedArtisansResponse = PaginatedResponse<ArtisanProfileDto>;
export type PaginatedArtisanPublicProfilesResponse = PaginatedResponse<ArtisanPublicProfileDto>;
export type PaginatedHireRequestsResponse = PaginatedResponse<ArtisanHireRequestDto>;
