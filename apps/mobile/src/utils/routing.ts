import { Role } from '@golden-abode/types';

import { ROUTES } from '../constants/routes';

export function getHomeRouteForRole(role: Role): string {
  switch (role) {
    case Role.CUSTOMER:
      return ROUTES.customer.home;
    case Role.VENDOR:
      return ROUTES.vendor.home;
    case Role.ARTISAN:
      return ROUTES.artisan.projects;
    default:
      return ROUTES.auth.login;
  }
}
