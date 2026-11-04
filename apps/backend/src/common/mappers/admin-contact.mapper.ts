import { AdminContactDto, AdminContactWithoutEmailDto } from '@golden-abode/types';

import { User } from '../../modules/users/models/user.model';

// "Who is this person and how do I reach them", for admin responses only
// (decision 0056). The caller must load these user attributes:
// id, name, phone, email, role, isActive, isApproved, lastLoginAt.
export function toAdminContactDto(user: User | null | undefined): AdminContactDto | null {
  const contact = toAdminContactWithoutEmailDto(user);
  return contact && user ? { ...contact, email: user.email ?? null } : null;
}

// Same, with the email left out entirely — used for the ustaad on hire
// requests (user ruling, decision 0056).
export function toAdminContactWithoutEmailDto(
  user: User | null | undefined,
): AdminContactWithoutEmailDto | null {
  if (!user) return null;
  return {
    userId: user.id,
    name: user.name,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    isApproved: user.isApproved,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
  };
}

// Attribute list for a User include that feeds the mappers above.
export const ADMIN_CONTACT_ATTRIBUTES = [
  'id',
  'name',
  'phone',
  'email',
  'role',
  'isActive',
  'isApproved',
  'lastLoginAt',
];
