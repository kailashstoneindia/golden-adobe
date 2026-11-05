import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
  it('shows email, push, signed-in devices and the user id', () => {
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

// Decision 0058 Task 9.
describe('UserDetailModal account actions', () => {
  function renderEditable(
    user: AdminUserDetailDto,
    handlers: {
      onSaveDetails?: (id: string, body: object) => Promise<void>;
      onSetActive?: (id: string, isActive: boolean) => Promise<void>;
      onRevokeSessions?: (id: string) => Promise<void>;
    } = {},
  ) {
    const fns = {
      onSaveDetails: vi.fn(handlers.onSaveDetails ?? (async () => undefined)),
      onSetActive: vi.fn(handlers.onSetActive ?? (async () => undefined)),
      onRevokeSessions: vi.fn(handlers.onRevokeSessions ?? (async () => undefined)),
    };
    render(
      <MemoryRouter>
        <UserDetailModal
          user={user}
          isSubmitting={false}
          showApprovalActions={false}
          onClose={() => undefined}
          {...fns}
        />
      </MemoryRouter>,
    );
    return fns;
  }

  it('edits only what the admin changed, then leaves edit mode', async () => {
    const fns = renderEditable(detail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Asha Rao');
    expect(screen.getByLabelText('Email')).toHaveValue('asha@example.com');
    expect(screen.getByLabelText('Phone')).toHaveValue('9876543210');
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Asha R. Rao');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(fns.onSaveDetails).toHaveBeenCalledWith('u-1', { name: 'Asha R. Rao' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument(),
    );
  });

  it('cannot save until something changes', async () => {
    renderEditable(detail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit details' }));

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('keeps the form open and shows the reason when the server refuses', async () => {
    renderEditable(detail(), {
      onSaveDetails: async () => {
        throw new Error('This phone number is already used by another account');
      },
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '+919000000001');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This phone number is already used by another account'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('asks before deactivating, and says what it does', async () => {
    const fns = renderEditable(detail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    expect(fns.onSetActive).not.toHaveBeenCalled();
    expect(screen.getByText(/signs them out of every device/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm deactivate' }));

    expect(fns.onSetActive).toHaveBeenCalledWith('u-1', false);
  });

  it('lets the admin back out of a deactivation', async () => {
    const fns = renderEditable(detail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    await user.click(screen.getByRole('button', { name: 'Keep active' }));

    expect(fns.onSetActive).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeInTheDocument();
  });

  it('reactivates a deactivated account in one click', async () => {
    const fns = renderEditable(detail({ isActive: false }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reactivate account' }));

    expect(fns.onSetActive).toHaveBeenCalledWith('u-1', true);
  });

  it('signs the user out everywhere after a confirm, only when a device is signed in', async () => {
    const fns = renderEditable(detail({ activeSessionCount: 2 }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await user.click(screen.getByRole('button', { name: 'Confirm sign out' }));

    expect(fns.onRevokeSessions).toHaveBeenCalledWith('u-1');
  });

  it('disables sign out when no device is signed in', () => {
    renderEditable(detail({ activeSessionCount: 0 }));

    expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeDisabled();
  });

  it('shows the server’s reason when a deactivation is refused', async () => {
    renderEditable(detail(), {
      onSetActive: async () => {
        throw new Error('You cannot deactivate your own account');
      },
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    await user.click(screen.getByRole('button', { name: 'Confirm deactivate' }));

    expect(await screen.findByText('You cannot deactivate your own account')).toBeInTheDocument();
  });

  it('offers none of this where the page gives no handlers (the Approvals page)', () => {
    renderModal(detail());

    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out everywhere' })).not.toBeInTheDocument();
  });
});
