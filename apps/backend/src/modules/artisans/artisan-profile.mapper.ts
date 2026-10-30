import {
  ArtisanAccountDetailsDto,
  ArtisanCompletionEstimateDto,
  ArtisanHireRequestDto,
  ArtisanProfileDto,
  ArtisanPublicProfileDto,
  ArtisanTeamMemberDto,
} from '@golden-abode/types';

import { Artisan } from './models/artisan.model';
import { ArtisanAccountDetails } from './models/artisan-account-details.model';
import { ArtisanTeamMember } from './models/artisan-team-member.model';
import { ArtisanHireRequest } from './models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from './models/artisan-completion-estimate.model';
import { formatTimestamp } from '../vendors/vendor-profile.mapper';

// All DTO mapping for this module lives here, mirroring
// vendor-profile.mapper.ts's rationale: plain functions, not an
// injectable — they map already-loaded models and need no dependencies.
// Callers are responsible for including the right associations; an
// omitted include yields null/empty here, not a lazy load.
//
// formatTimestamp itself is re-exported from vendor-profile.mapper
// rather than duplicated — admin.service.ts already imports it from
// there, so this is reuse of an existing cross-module dependency, not a
// new one.
export { formatTimestamp };

export function toAccountDetailsDto(
  accountDetails?: ArtisanAccountDetails | null,
): ArtisanAccountDetailsDto | null {
  if (!accountDetails) {
    return null;
  }

  return {
    id: accountDetails.id,
    artisanId: accountDetails.artisanId,
    accountHolderName: accountDetails.accountHolderName,
    bankName: accountDetails.bankName,
    ifscCode: accountDetails.ifscCode,
    branchName: accountDetails.branchName,
    accountNumber: accountDetails.accountNumber,
    createdAt: formatTimestamp(accountDetails.get('createdAt')),
    updatedAt: formatTimestamp(accountDetails.get('updatedAt')),
  };
}

export function toTeamMemberDto(member: ArtisanTeamMember): ArtisanTeamMemberDto {
  return {
    id: member.id,
    artisanId: member.artisanId,
    name: member.name,
    roleOnTeam: member.roleOnTeam,
    phone: member.phone,
    documentUrl: member.documentUrl,
    createdAt: formatTimestamp(member.get('createdAt')),
    updatedAt: formatTimestamp(member.get('updatedAt')),
  };
}

export function toArtisanProfileDto(artisan: Artisan): ArtisanProfileDto {
  return {
    id: artisan.id,
    userId: artisan.userId,
    tradeType: artisan.tradeType,
    experienceYears: artisan.experienceYears,
    bio: artisan.bio,
    servicePincode: artisan.servicePincode,
    documentUrl: artisan.documentUrl,
    isVerified: artisan.isVerified,
    isAvailable: artisan.isAvailable,
    accountDetails: toAccountDetailsDto(artisan.accountDetails),
    team: (artisan.team ?? []).map(toTeamMemberDto),
    createdAt: formatTimestamp(artisan.get('createdAt')),
    updatedAt: formatTimestamp(artisan.get('updatedAt')),
  };
}

// Customer-facing view — bio-only visibility rule (spec §5). Built by
// explicitly listing only these six fields, never by spreading the full
// profile and deleting keys, so a future field added to ArtisanProfileDto
// does not leak into the public view by default.
export function toArtisanPublicProfileDto(artisan: Artisan): ArtisanPublicProfileDto {
  return {
    id: artisan.id,
    tradeType: artisan.tradeType,
    experienceYears: artisan.experienceYears,
    bio: artisan.bio,
    isAvailable: artisan.isAvailable,
    isVerified: artisan.isVerified,
  };
}

export function toCompletionEstimateDto(
  estimate: ArtisanCompletionEstimate,
): ArtisanCompletionEstimateDto {
  return {
    id: estimate.id,
    hireRequestId: estimate.hireRequestId,
    estimatedDays: estimate.estimatedDays,
    note: estimate.note,
    createdAt: formatTimestamp(estimate.get('createdAt')),
  };
}

// latestEstimate is whatever the caller already loaded as the single most
// recent row (ORDER BY created_at DESC LIMIT 1) — this function never
// queries, it only maps what's already in memory. capacity is the same
// deal: admin-only derived numbers (decision 0045 addendum), omitted
// (-> null) by every caller that isn't the admin review surface.
export function toHireRequestDto(
  request: ArtisanHireRequest,
  latestEstimate?: ArtisanCompletionEstimate | null,
  capacity?: { activeJobCount: number; teamSize: number } | null,
): ArtisanHireRequestDto {
  return {
    id: request.id,
    customerId: request.customerId,
    artisanId: request.artisanId,
    status: request.status,
    adminReviewedBy: request.adminReviewedBy,
    adminReviewedAt: formatTimestamp(request.adminReviewedAt) || null,
    adminRejectReason: request.adminRejectReason,
    addressText: request.addressText,
    notes: request.notes,
    latestEstimate: latestEstimate ? toCompletionEstimateDto(latestEstimate) : null,
    startedAt: formatTimestamp(request.startedAt) || null,
    completedAt: formatTimestamp(request.completedAt) || null,
    cancelledAt: formatTimestamp(request.cancelledAt) || null,
    cancelReason: request.cancelReason,
    artisanActiveJobCount: capacity?.activeJobCount ?? null,
    artisanTeamSize: capacity?.teamSize ?? null,
    createdAt: formatTimestamp(request.get('createdAt')),
    updatedAt: formatTimestamp(request.get('updatedAt')),
  };
}
