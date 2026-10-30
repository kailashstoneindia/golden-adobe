import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtisanProfileDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisansPage } from './ArtisansPage';

const BASE = '/api/admin/artisans';

function artisan(over: Partial<ArtisanProfileDto> = {}): ArtisanProfileDto {
  return {
    id: 'a1111111-1111-4111-8111-111111111111',
    userId: 'u1111111-1111-4111-8111-111111111111',
    tradeType: 'PLUMBER',
    experienceYears: 6,
    bio: 'Reliable plumber',
    servicePincode: '560001',
    documentUrl: 'artisans/a1.../doc.pdf',
    isVerified: true,
    isAvailable: true,
    accountDetails: null,
    team: [],
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...over,
  };
}

let artisans: ArtisanProfileDto[];

function useHandlers() {
  server.use(
    http.get(BASE, () =>
      HttpResponse.json({
        success: true,
        data: { items: artisans, total: artisans.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.get(`${BASE}/:id`, ({ params }) => {
      const found = artisans.find((a) => a.id === params.id);
      return HttpResponse.json({ success: true, data: found });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ArtisansPage />
    </QueryClientProvider>,
  );
}

describe('ArtisansPage', () => {
  beforeEach(() => {
    artisans = [artisan()];
    useHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders an artisan row with trade type and verification status', async () => {
    renderPage();
    expect(await screen.findByText('PLUMBER')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('explains there are no artisans when the list is empty', async () => {
    artisans = [];
    renderPage();
    expect(await screen.findByText(/No artisans yet/)).toBeInTheDocument();
  });

  it('shows the unverified badge for an artisan who has not been verified', async () => {
    artisans = [artisan({ isVerified: false })];
    renderPage();
    expect(await screen.findByText('Unverified')).toBeInTheDocument();
  });

  it('opens a detail view with team and account info on row click', async () => {
    artisans = [
      artisan({
        bio: 'Reliable plumber',
        team: [
          {
            id: 't1',
            artisanId: 'a1111111-1111-4111-8111-111111111111',
            name: 'Suresh',
            roleOnTeam: 'Helper',
            phone: '9876543210',
            documentUrl: null,
            createdAt: '2026-10-29T00:00:00.000Z',
            updatedAt: '2026-10-29T00:00:00.000Z',
          },
        ],
        accountDetails: {
          id: 'acc1',
          artisanId: 'a1111111-1111-4111-8111-111111111111',
          accountHolderName: 'Ramesh Kumar',
          bankName: 'SBI',
          ifscCode: 'SBIN0001234',
          branchName: 'Koramangala',
          accountNumber: '1234567890',
          createdAt: '2026-10-29T00:00:00.000Z',
          updatedAt: '2026-10-29T00:00:00.000Z',
        },
      }),
    ];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('PLUMBER'));

    expect(await screen.findByText('Reliable plumber')).toBeInTheDocument();
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.getByText('SBI')).toBeInTheDocument();
  });
});
