export type TradeType =
  | 'CARPENTER'
  | 'PLUMBER'
  | 'PAINTER'
  | 'ELECTRICIAN'
  | 'MASON'
  | 'TILE_LAYING'
  | 'OTHERS';

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
  | 'ACCEPTED_BY_ARTISAN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

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
