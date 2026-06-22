import { Role } from '@golden-abode/types';

import { ROUTES } from '../constants';
import { useAuth } from '../hooks/auth';
import { getHomeRouteForRole } from '../utils/routing';

interface RoleGuardResult {
  isReady: boolean;
  redirectTo: string | null;
}

export function useRoleGuard(requiredRole: Role): RoleGuardResult {
  const { isAuthenticated, user, isHydrated } = useAuth();

  if (!isHydrated) {
    return { isReady: false, redirectTo: null };
  }

  if (!isAuthenticated) {
    return { isReady: false, redirectTo: ROUTES.auth.login };
  }

  if (user && user.role !== requiredRole) {
    return { isReady: false, redirectTo: getHomeRouteForRole(user.role) };
  }

  return { isReady: true, redirectTo: null };
}
