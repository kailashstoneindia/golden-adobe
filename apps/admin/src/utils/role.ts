import { Role } from '@golden-abode/types';

export function formatRoleLabel(role: Role): string {
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
      return role;
  }
}
