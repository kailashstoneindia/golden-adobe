import { Role, type UserDto } from '@golden-abode/types';

import { ROUTES } from '../constants';

type UserApprovalFields = Pick<UserDto, 'role' | 'isApproved'>;

/** Vendors and Ustaads must be approved by an admin before using platform features. */
export function requiresAdminApproval(user: Pick<UserDto, 'role'>): boolean {
  return user.role === Role.VENDOR || user.role === Role.ARTISAN;
}

export function isPendingApproval(user: UserApprovalFields): boolean {
  return requiresAdminApproval(user) && !user.isApproved;
}

export function resolveAuthenticatedRoute(
  user: UserApprovalFields | null | undefined,
): (typeof ROUTES)['home'] | (typeof ROUTES)['pendingApproval'] {
  if (user && isPendingApproval(user)) {
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
