import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { Role, type UserDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { UsersPage } from './UsersPage';

const ustaad = {
  id: 'u-ustaad',
  name: 'Suresh Ustaad',
  phone: '9876500000',
  email: null,
  role: Role.ARTISAN,
  deviceToken: null,
  isActive: true,
  isApproved: false,
  onboardingCompleted: true,
  onboardingCompletedAt: null,
  onboardingStage: null,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
} satisfies UserDto;

describe('UsersPage', () => {
  it('shows the server reason when approving an ustaad fails (decision 0056)', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          success: true,
          data: { items: [ustaad], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.patch('/api/admin/users/:id/approve', () =>
        HttpResponse.json(
          {
            success: false,
            message: 'This ustaad has not created a profile or uploaded a document yet',
          },
          { status: 400 },
        ),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <UsersPage />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByText('Suresh Ustaad'));
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText('This ustaad has not created a profile or uploaded a document yet'),
    ).toBeInTheDocument();
  });
});
