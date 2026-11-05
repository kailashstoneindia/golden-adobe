import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Role, type AdminContactDto } from '@golden-abode/types';

import { ContactBlock } from './ContactBlock';

const contact: AdminContactDto = {
  userId: 'u1',
  name: 'Asha Rao',
  phone: '9876543210',
  email: 'asha@example.com',
  role: Role.CUSTOMER,
  isActive: true,
  isApproved: true,
  lastLoginAt: null,
};

// Review Focus 4: missing details and deactivated accounts must render, not crash.
describe('ContactBlock', () => {
  it('shows dashes for a missing phone and email', () => {
    render(<ContactBlock title="Customer" contact={{ ...contact, phone: null, email: null }} />);

    const block = screen.getByRole('group', { name: 'Customer' });
    expect(block).toHaveTextContent('Phone—');
    expect(block).toHaveTextContent('Email—');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('marks a deactivated account', () => {
    render(<ContactBlock title="Customer" contact={{ ...contact, isActive: false }} />);
    expect(screen.getByText(/Deactivated/)).toBeInTheDocument();
  });

  it('says so when the account no longer exists', () => {
    render(<ContactBlock title="Customer" contact={null} />);
    expect(screen.getByText('Account not found.')).toBeInTheDocument();
  });

  it('shows the role and whether the account is approved', () => {
    render(
      <ContactBlock
        title="Ustaad"
        contact={{ ...contact, role: Role.ARTISAN, isApproved: false }}
      />,
    );
    expect(screen.getByRole('group', { name: 'Ustaad' })).toHaveTextContent(
      'AccountUstaad · not approved',
    );
  });
});
