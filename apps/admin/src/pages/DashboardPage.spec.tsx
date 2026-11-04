import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AdminDashboardStats } from '@golden-abode/types';

import { server } from '@/test/server';

import { DashboardPage } from './DashboardPage';

const stats: AdminDashboardStats = {
  pendingVendors: 1,
  pendingArtisans: 9,
  totalUsers: 40,
  approvedVendors: 5,
  approvedArtisans: 6,
  pendingArtisanVerifications: 2,
  pendingHireRequests: 3,
  artisansAwaitingDocument: 4,
};

describe('DashboardPage', () => {
  it('links the ustaads-without-a-document count to the verification page (decision 0058)', async () => {
    server.use(
      http.get('/api/admin/stats', () => HttpResponse.json({ success: true, data: stats })),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const card = await screen.findByRole('link', { name: /Ustaads without a document/ });
    expect(card).toHaveAttribute('href', '/artisans/verification');
    expect(card).toHaveTextContent('4');
    // The old card counted rejected ustaads and ones mid-onboarding together.
    expect(screen.queryByText('Pending ustaads')).not.toBeInTheDocument();
  });
});
