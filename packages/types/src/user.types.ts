import { Role } from './role.enum';
import { VendorProfileDto } from './vendor.types';
import { ArtisanProfileDto } from './artisan.types';

export const VENDOR_ONBOARDING_STAGES = {
  basicDetails: 'BASIC_DETAILS',
  shopDetails: 'SHOP_DETAILS',
  bankDetails: 'BANK_DETAILS',
  completed: 'COMPLETED',
} as const;

export type VendorOnboardingStage =
  (typeof VENDOR_ONBOARDING_STAGES)[keyof typeof VENDOR_ONBOARDING_STAGES];

/**
 * Full user DTO returned by the API.
 * Matches the shape of the `users` table row exposed to clients.
 */
export interface UserDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  deviceToken: string | null;
  isActive: boolean;
  isApproved: boolean;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  onboardingStage: VendorOnboardingStage | null;
  vendorProfile?: VendorProfileDto;
  artisan?: ArtisanProfileDto;
  // Null means never logged in since this column existed (0039). Set only
  // on real authentication, never on token refresh.
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload embedded inside access tokens.
 * Keep it small — only sub + role, no PII.
 */
export interface JwtPayload {
  sub: string;
  role: Role;
}
