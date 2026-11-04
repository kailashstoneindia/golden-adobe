import { Role } from '@golden-abode/types';

import { User } from '../../../modules/users/models/user.model';
import { toAdminContactDto, toAdminContactWithoutEmailDto } from '../admin-contact.mapper';

function user(over: Partial<Record<string, unknown>> = {}): User {
  return {
    id: 'u-1',
    name: 'Asha Rao',
    phone: '9876543210',
    email: 'asha@example.com',
    role: Role.CUSTOMER,
    isActive: true,
    isApproved: false,
    lastLoginAt: new Date('2026-11-01T10:00:00.000Z'),
    ...over,
  } as unknown as User;
}

describe('admin contact mapper (decision 0058)', () => {
  it('maps a user to a contact', () => {
    expect(toAdminContactDto(user())).toEqual({
      userId: 'u-1',
      name: 'Asha Rao',
      phone: '9876543210',
      email: 'asha@example.com',
      role: Role.CUSTOMER,
      isActive: true,
      isApproved: false,
      lastLoginAt: '2026-11-01T10:00:00.000Z',
    });
  });

  it('returns null for a missing user', () => {
    expect(toAdminContactDto(null)).toBeNull();
    expect(toAdminContactDto(undefined)).toBeNull();
  });

  it('keeps a missing phone, email and last login as null', () => {
    expect(toAdminContactDto(user({ phone: null, email: null, lastLoginAt: null }))).toMatchObject({
      phone: null,
      email: null,
      lastLoginAt: null,
    });
  });

  it('the without-email variant has no email key at all', () => {
    const contact = toAdminContactWithoutEmailDto(user());
    expect(contact).not.toHaveProperty('email');
    expect(contact).toMatchObject({ userId: 'u-1', phone: '9876543210' });
    expect(toAdminContactWithoutEmailDto(null)).toBeNull();
  });
});
