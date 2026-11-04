import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdminHireRequestDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisanHireRequestsTrackingPage } from './ArtisanHireRequestsTrackingPage';

const BASE = '/api/admin/artisans/hire-requests';
const CANCEL_BASE = '/api/artisans/hire-requests';

function hireRequest(over: Partial<AdminHireRequestDto> = {}): AdminHireRequestDto {
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
    artisanRespondedAt: null,
    artisanDeclineReason: null,
    artisanResponseDueAt: null,
    customerName: null,
    customerPhone: null,
    artisanActiveJobCount: null,
    artisanTeamSize: null,
    customer: {
      userId: 'c1111111-1111-4111-8111-111111111111',
      name: 'Asha Rao',
      phone: '9876543210',
      email: 'asha@example.com',
      role: Role.CUSTOMER,
      isActive: true,
      isApproved: true,
      lastLoginAt: null,
    },
    artisan: {
      userId: 'u2222222-2222-4222-8222-222222222222',
      name: 'Ramesh Plumber',
      phone: '9123456780',
      role: Role.ARTISAN,
      isActive: true,
      isApproved: true,
      lastLoginAt: null,
    },
    artisanTradeType: 'PLUMBER',
    adminReviewerName: null,
    estimateCount: 0,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-29T01:00:00.000Z',
    ...over,
  };
}

let requests: AdminHireRequestDto[];
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
        data: {
          ...requests[0],
          status: 'CANCELLED',
          cancelReason: (body as { reason: string }).reason,
        },
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
    expect(await screen.findByText('In progress')).toBeInTheDocument();
  });

  it('lists customer and ustaad for every request (0058)', async () => {
    renderPage();

    const row = await screen.findByRole('row', { name: /Asha Rao/ });
    expect(row).toHaveTextContent('Ramesh Plumber');
  });

  it('the popup shows both contacts, who reviewed it and how many estimates (0058)', async () => {
    requests = [
      hireRequest({
        adminReviewerName: 'Admin Priya',
        estimateCount: 3,
        latestEstimate: {
          id: 'e1',
          hireRequestId: 'h1111111-1111-4111-8111-111111111111',
          estimatedDays: 6,
          note: null,
          createdAt: '2026-10-30T00:00:00.000Z',
        },
      }),
    ];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));

    expect(screen.getByRole('group', { name: 'Customer' })).toHaveTextContent('Asha Rao');
    expect(screen.getByRole('group', { name: 'Ustaad' })).toHaveTextContent('Ramesh Plumber');
    expect(screen.getByText('Admin Priya')).toBeInTheDocument();
    expect(screen.getByText('3 (latest: 6 days)')).toBeInTheDocument();
  });

  it('explains there is nothing to show when the list is empty', async () => {
    requests = [];
    renderPage();
    expect(await screen.findByText(/No hire requests/)).toBeInTheDocument();
  });

  it('shows lifecycle timestamps in the detail view', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('In progress'));

    expect(await screen.findByText('Started')).toBeInTheDocument();
    // startedAt is set for this fixture; completedAt/cancelledAt are null
    // and render as a bare dash, not a formatted date.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('cancelling a request calls PATCH /artisans/hire-requests/:id/cancel with a reason', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('In progress'));
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

    await user.click(await screen.findByText('Completed'));

    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it('shows the response deadline and lets the admin cancel a request waiting on the artisan (0055)', async () => {
    requests = [
      hireRequest({
        status: 'PENDING_ARTISAN_RESPONSE',
        startedAt: null,
        artisanResponseDueAt: '2026-10-31T00:00:00.000Z',
      }),
    ];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Waiting for ustaad'));

    expect(await screen.findByText('Artisan must respond by')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
  });

  it('shows the artisan decline reason and offers no cancel on a declined request (0055)', async () => {
    requests = [
      hireRequest({
        status: 'ARTISAN_DECLINED',
        startedAt: null,
        artisanRespondedAt: '2026-10-29T05:00:00.000Z',
        artisanDeclineReason: 'Fully booked',
      }),
    ];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Declined by ustaad'));

    expect(await screen.findByText('Fully booked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });
});
