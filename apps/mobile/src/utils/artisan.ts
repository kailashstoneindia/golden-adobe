import type {
  ArtisanAccountDetailsInputDto,
  ArtisanHireRequestStatus,
  ArtisanOnboardDto,
  ArtisanProfileDto,
  UpdateArtisanProfileDto,
} from '@golden-abode/types';
import { router } from 'expo-router';

import { ApiError } from '../api';
import {
  BOOKING_ATTRIBUTABLE_HIRE_STATUSES,
  CANCELLABLE_HIRE_STATUSES,
  ERROR_MESSAGES,
  ROUTES,
  VENDOR_CONSTANTS,
} from '../constants';
import type { ArtisanProfileFormValues } from '../types';
import type { BadgeVariant } from '../components/ui';
import { isValidIndianPincode, sanitizePincodeDigits } from './pincode';

const WHOLE_NUMBER_PATTERN = /^\d+$/;

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 404;
}

/**
 * Onboarding is done once the profile exists and a verification document is
 * on file — admin cannot verify without one. Bank details stay optional.
 */
export function isArtisanOnboardingComplete(profile: ArtisanProfileDto | undefined): boolean {
  return Boolean(profile?.documentUrl);
}

export function toArtisanProfileFormValues(
  profile: ArtisanProfileDto | undefined,
): ArtisanProfileFormValues {
  return {
    tradeType: profile?.tradeType ?? null,
    servicePincode: profile?.servicePincode ?? '',
    experienceYears: profile?.experienceYears != null ? String(profile.experienceYears) : '',
    bio: profile?.bio ?? '',
  };
}

export function validateArtisanProfileForm(values: ArtisanProfileFormValues): string | null {
  if (!values.tradeType) {
    return ERROR_MESSAGES.tradeTypeRequired;
  }
  if (!isValidIndianPincode(values.servicePincode)) {
    return ERROR_MESSAGES.servicePincodeRequired;
  }
  const experience = values.experienceYears.trim();
  if (experience && !WHOLE_NUMBER_PATTERN.test(experience)) {
    return ERROR_MESSAGES.experienceYearsInvalid;
  }
  return null;
}

/** Assumes `validateArtisanProfileForm` passed. Blank optionals are omitted — the API rejects empty strings. */
export function toArtisanProfilePayload(
  values: ArtisanProfileFormValues,
): ArtisanOnboardDto & UpdateArtisanProfileDto {
  const experience = values.experienceYears.trim();
  const bio = values.bio.trim();
  return {
    tradeType: values.tradeType!,
    servicePincode: sanitizePincodeDigits(values.servicePincode),
    ...(experience ? { experienceYears: Number(experience) } : {}),
    ...(bio ? { bio } : {}),
  };
}

export const EMPTY_ARTISAN_ACCOUNT_DETAILS: ArtisanAccountDetailsInputDto = {
  accountHolderName: '',
  bankName: '',
  ifscCode: '',
  branchName: '',
  accountNumber: '',
};

// Same bank rules as vendor onboarding — payouts go to the same rails.
export function validateArtisanAccountDetails(
  values: ArtisanAccountDetailsInputDto,
): string | null {
  if (!values.accountHolderName.trim()) {
    return ERROR_MESSAGES.accountHolderNameRequired;
  }
  if (!values.bankName.trim()) {
    return ERROR_MESSAGES.bankNameRequired;
  }
  const accountNumberLength = values.accountNumber.trim().length;
  if (
    accountNumberLength < VENDOR_CONSTANTS.minAccountNumberLength ||
    accountNumberLength > VENDOR_CONSTANTS.maxAccountNumberLength
  ) {
    return ERROR_MESSAGES.accountNumberInvalid;
  }
  if (values.ifscCode.trim().length !== VENDOR_CONSTANTS.ifscCodeLength) {
    return ERROR_MESSAGES.ifscCodeInvalid;
  }
  if (!values.branchName.trim()) {
    return ERROR_MESSAGES.branchNameRequired;
  }
  return null;
}

export function toArtisanAccountDetailsFormValues(
  profile: ArtisanProfileDto | undefined,
): ArtisanAccountDetailsInputDto {
  const details = profile?.accountDetails;
  if (!details) {
    return EMPTY_ARTISAN_ACCOUNT_DETAILS;
  }
  return {
    accountHolderName: details.accountHolderName,
    bankName: details.bankName,
    ifscCode: details.ifscCode,
    branchName: details.branchName,
    accountNumber: details.accountNumber,
  };
}

export function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  return WHOLE_NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : null;
}

export function canCancelHireRequest(status: ArtisanHireRequestStatus): boolean {
  return CANCELLABLE_HIRE_STATUSES.includes(status);
}

export function isBookingAttributable(status: ArtisanHireRequestStatus): boolean {
  return BOOKING_ATTRIBUTABLE_HIRE_STATUSES.includes(status);
}

export function isActiveArtisanJob(status: ArtisanHireRequestStatus): boolean {
  return status === 'ACCEPTED_BY_ARTISAN' || status === 'IN_PROGRESS';
}

export function toHireRequestBadgeVariant(status: ArtisanHireRequestStatus): BadgeVariant {
  if (status === 'COMPLETED') {
    return 'success';
  }
  if (status === 'ADMIN_REJECTED' || status === 'CANCELLED') {
    return 'error';
  }
  if (status === 'PENDING_ADMIN_REVIEW') {
    return 'pending';
  }
  return 'info';
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function navigateToHireRequestDetail(requestId: string): void {
  router.push({ pathname: ROUTES.screens.hireRequestDetail, params: { id: requestId } });
}

export function replaceToHireRequestDetail(requestId: string): void {
  router.replace({ pathname: ROUTES.screens.hireRequestDetail, params: { id: requestId } });
}

export function navigateToArtisanProfile(artisanId: string): void {
  router.push({ pathname: ROUTES.screens.artisanPublic, params: { id: artisanId } });
}
