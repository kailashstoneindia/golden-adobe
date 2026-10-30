import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtisanHireRequestDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisanHireRequestsTrackingPage } from './ArtisanHireRequestsTrackingPage';

const BASE = '/api/admin/artisans/hire-requests';
const CANCEL_BASE = '/api/artisans/hire-requests';

function hireRequest(over: Partial<ArtisanHireRequestDto> = {}): ArtisanHireRequestDto {
  return {
    id: 'h1111111-1111-4111-8111-111111111111',
    customerId: 'c1111111-1111-4111-8111-111111111111',
    artisanId: 'a1111111-1111-4111-8111-111111111111',
    status: 'IN_PROGRESS',
    adminReviewedBy: 'admin-1',
    adminReviewedAt: '2026-10-29T00:00:00.000Z',
    adminRejectReason: null,
    addressText: '12 MG Road',
    notes: 'Leaking pipe',
    latestEstimate: null,
    startedAt: '2026-10-29T01:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    artisanActiveJobCount: null,
    artisanTeamSize: null,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-29T01:00:00.000Z',
    ...over,
  };
}

let requests: ArtisanHireRequestDto[];
let cancelCalls: Array<{ id: string; body: unknown }>;

function useHandlers() {
  server.use(
    http.get(BASE, () =>
      HttpResponse.json({
        success: true,
        data: { items: requests, total: requests.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.patch(`${CANCEL_BASE}/:id/cancel`, async ({ params, request }) => {
      const body = await request.json();
      cancelCalls.push({ id: String(params.id), body });
      return HttpResponse.json({
        success: true,
        data: { ...requests[0], status: 'CANCELLED', cancelReason: (body as { reason: string }).reason },
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
      <ArtisanHireRequestsTrackingPage />
    </QueryClientProvider>,
  );
}

describe('ArtisanHireRequestsTrackingPage', () => {
  beforeEach(() => {
    requests = [hireRequest()];
    cancelCalls = [];
    useHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders a hire request row with its current status', async () => {
    renderPage();
    expect(await screen.findByText('IN_PROGRESS')).toBeInTheDocument();
  });

  it('explains there is nothing to show when the list is empty', async () => {
    requests = [];
    renderPage();
    expect(await screen.findByText(/No hire requests/)).toBeInTheDocument();
  });

  it('shows lifecycle timestamps in the detail view', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('IN_PROGRESS'));

    expect(await screen.findByText('Started')).toBeInTheDocument();
    // startedAt is set for this fixture; completedAt/cancelledAt are null
    // and render as a bare dash, not a formatted date.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('cancelling a request calls PATCH /artisans/hire-requests/:id/cancel with a reason', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('IN_PROGRESS'));
    await user.type(screen.getByPlaceholderText('Required to cancel'), 'Customer backed out');
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));

    expect(cancelCalls).toEqual([
      { id: hireRequest().id, body: { reason: 'Customer backed out' } },
    ]);
  });

  it('does not allow cancelling an already-terminal request', async () => {
    requests = [hireRequest({ status: 'COMPLETED', completedAt: '2026-10-29T02:00:00.000Z' })];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('COMPLETED'));

    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });
});
