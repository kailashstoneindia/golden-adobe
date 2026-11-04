import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Role, type UserDto } from '@golden-abode/types';

import { tokenStorage } from '@/services/storage/tokenStorage';
import { useAuthStore } from '@/store';
import { server } from '@/test/server';

import { AppRouter } from './AppRouter';

const admin = { id: 'admin-1', name: 'Admin', role: Role.ADMIN } as UserDto;

beforeEach(() => {
  tokenStorage.setTokens('a1', 'r1');
  useAuthStore.setState({ user: admin, isHydrated: true });
  server.use(
    http.get('/api/admin/artisans/pending-verification', () =>
      HttpResponse.json({
        success: true,
        data: { items: [], total: 0, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
  );
});

afterEach(() => {
  useAuthStore.setState({ user: null, isHydrated: false });
});

describe('AppRouter', () => {
  it('sends the old ustaad approvals tab to the verification page (decision 0056)', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/approvals/artisans']}>
          <AppRouter />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Ustaad verification' })).toBeInTheDocument();
  });
});
