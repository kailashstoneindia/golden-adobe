import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Role, type AdminUserDetailDto } from '@golden-abode/types';

import { UserDetailModal } from './UserDetailModal';

function detail(over: Partial<AdminUserDetailDto> = {}): AdminUserDetailDto {
  return {
    id: 'u-1',
    name: 'Asha Rao',
    phone: '9876543210',
    email: 'asha@example.com',
    role: Role.CUSTOMER,
    pushEnabled: true,
    isActive: true,
    isApproved: true,
    onboardingCompleted: true,
    onboardingCompletedAt: null,
    onboardingStage: null,
    lastLoginAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    activeSessionCount: 2,
    customerProfile: null,
    ...over,
  };
}

function renderModal(user: AdminUserDetailDto) {
  return render(
    <MemoryRouter>
      <UserDetailModal
        user={user}
        isSubmitting={false}
        showApprovalActions={false}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
}

const row = (label: string) => screen.getByText(label).closest('div') as HTMLElement;

// Decision 0058 Task 7.
describe('UserDetailModal', () => {
  it('shows email, push and signed-in devices, never a device token', () => {
    renderModal(detail());

    expect(within(row('Email')).getByText('asha@example.com')).toBeInTheDocument();
    expect(within(row('Push notifications')).getByText('On')).toBeInTheDocument();
    expect(within(row('Signed-in devices')).getByText('2')).toBeInTheDocument();
    expect(within(row('User id')).getByText('u-1')).toBeInTheDocument();
  });

  it('says push is off when the user has none', () => {
    renderModal(detail({ pushEnabled: false }));

    expect(within(row('Push notifications')).getByText('Off')).toBeInTheDocument();
  });

  it('shows a customer’s totals and addresses, with a link to their orders', () => {
    renderModal(
      detail({
        customerProfile: {
          customerId: 'c-1',
          fullName: 'Asha R.',
          orderCount: 3,
          paidTotalPaise: 70_000,
          hireRequestCount: 1,
          addresses: [
            {
              id: 'ad-1',
              customerId: 'c-1',
              label: 'Home',
              addressLine1: '12 MG Road',
              addressLine2: 'Near the park',
              city: 'Bengaluru',
              pincode: '560001',
              lat: null,
              lng: null,
              isDefault: true,
              createdAt: '2026-11-01T00:00:00.000Z',
              updatedAt: '2026-11-01T00:00:00.000Z',
            },
          ],
        },
      }),
    );

    const customer = screen.getByRole('group', { name: 'Customer' });
    expect(within(customer).getByText('Asha R.')).toBeInTheDocument();
    expect(within(customer).getByText('₹700.00')).toBeInTheDocument();
    expect(within(customer).getByText(/Home \(default\)/)).toBeInTheDocument();
    expect(
      within(customer).getByText('12 MG Road, Near the park, Bengaluru 560001'),
    ).toBeInTheDocument();
    expect(within(customer).getByRole('link', { name: '3 orders' })).toHaveAttribute(
      'href',
      '/orders?customerId=c-1',
    );
    expect(within(row('Hire requests')).getByText('1')).toBeInTheDocument();
  });

  it('links a vendor to their vendor popup and an ustaad to theirs', () => {
    const { unmount } = renderModal(
      detail({
        role: Role.VENDOR,
        vendorProfile: { id: 'v-1' } as AdminUserDetailDto['vendorProfile'],
      }),
    );
    expect(screen.getByRole('link', { name: 'Open in Vendors' })).toHaveAttribute(
      'href',
      '/vendors?vendorId=v-1',
    );
    unmount();

    renderModal(
      detail({ role: Role.ARTISAN, artisan: { id: 'a-1' } as AdminUserDetailDto['artisan'] }),
    );
    expect(screen.getByRole('link', { name: 'Open in Ustaads' })).toHaveAttribute(
      'href',
      '/artisans?artisanId=a-1',
    );
  });
});
