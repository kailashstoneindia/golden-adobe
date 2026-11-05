import { AdminUserDto, Role, UserDto, VENDOR_ONBOARDING_STAGES } from '@golden-abode/types';

import { User } from '../users/models/user.model';
import { toArtisanProfileDto } from '../artisans/artisan-profile.mapper';
import { formatTimestamp, toVendorProfileDto } from '../vendors/vendor-profile.mapper';

// A user as the admin sees them (decision 0058 Task 7). Built field by field,
// not by spreading UserDto, so the device token (a push credential) can never
// slip back in: the admin only learns whether push is on.
export function toAdminUserDto(user: User): AdminUserDto {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role as Role,
    pushEnabled: Boolean(user.deviceToken),
    isActive: user.isActive,
    isApproved: user.isApproved,
    onboardingCompleted: user.onboardingCompleted ?? Boolean(user.vendorProfile),
    onboardingCompletedAt: formatTimestamp(user.get('onboardingCompletedAt')) || null,
    onboardingStage:
      (user.onboardingStage as UserDto['onboardingStage']) ??
      (user.vendorProfile ? VENDOR_ONBOARDING_STAGES.completed : null),
    vendorProfile: toVendorProfileDto(user.vendorProfile),
    artisan: user.artisanProfile ? toArtisanProfileDto(user.artisanProfile) : undefined,
    lastLoginAt: formatTimestamp(user.get('lastLoginAt')) || null,
    createdAt: formatTimestamp(user.get('createdAt')),
    updatedAt: formatTimestamp(user.get('updatedAt')),
  };
}
