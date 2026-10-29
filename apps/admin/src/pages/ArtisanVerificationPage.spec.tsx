import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtisanProfileDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisanVerificationPage } from './ArtisanVerificationPage';

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
    isVerified: false,
    isAvailable: true,
    accountDetails: null,
    team: [],
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...over,
  };
}

let pending: ArtisanProfileDto[];
let verifyCalls: string[];

function useHandlers() {
  server.use(
    http.get(`${BASE}/pending-verification`, () =>
      HttpResponse.json({ success: true, data: pending }),
    ),
    http.patch(`${BASE}/:id/verify`, ({ params }) => {
      verifyCalls.push(String(params.id));
      return HttpResponse.json({
        success: true,
        data: { ...pending[0], isVerified: true },
      });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ArtisanVerificationPage />
    </QueryClientProvider>,
  );
}

describe('ArtisanVerificationPage', () => {
  beforeEach(() => {
    pending = [artisan()];
    verifyCalls = [];
    useHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders a pending-verification row', async () => {
    renderPage();
    expect(await screen.findByText('PLUMBER')).toBeInTheDocument();
  });

  it('explains there is nothing to review when the queue is empty', async () => {
    pending = [];
    renderPage();
    expect(await screen.findByText(/No ustaads awaiting verification/)).toBeInTheDocument();
  });

  it('approving a row calls PATCH /admin/artisans/:id/verify', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('PLUMBER'));
    await user.click(await screen.findByRole('button', { name: 'Verify' }));

    await screen.findByText('PLUMBER'); // dialog closes, list re-renders
    expect(verifyCalls).toEqual([artisan().id]);
  });
});
