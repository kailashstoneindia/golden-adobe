import { Role, type UserDto } from '@golden-abode/types';

import { ROUTES } from '../constants';

type UserApprovalFields = Pick<UserDto, 'role' | 'isApproved'>;
type AuthenticatedRoute =
  | typeof ROUTES.home
  | typeof ROUTES.pendingApproval
  | typeof ROUTES.vendorOnboard;

/** Vendors and Ustaads must be approved by an admin before using platform features. */
export function requiresAdminApproval(user: Pick<UserDto, 'role'>): boolean {
  return user.role === Role.VENDOR || user.role === Role.ARTISAN;
}

export function needsVendorOnboarding(user: UserDto): boolean {
  return user.role === Role.VENDOR && !user.vendorProfile;
}

export function isPendingApproval(user: UserApprovalFields): boolean {
  return requiresAdminApproval(user) && !user.isApproved;
}

export function resolveAuthenticatedRoute(user: UserDto | null | undefined): AuthenticatedRoute {
  if (!user) {
    return ROUTES.home;
  }

  if (needsVendorOnboarding(user)) {
    return ROUTES.vendorOnboard;
  }

  if (isPendingApproval(user)) {
    return ROUTES.pendingApproval;
  }

  return ROUTES.home;
}

export function formatRoleLabel(role: Role | undefined): string {
  switch (role) {
    case Role.CUSTOMER:
      return 'Customer';
    case Role.VENDOR:
      return 'Vendor';
    case Role.ARTISAN:
      return 'Ustaad';
    case Role.ADMIN:
      return 'Admin';
    default:
      return '';
  }
}
