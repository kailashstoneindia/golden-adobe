import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdminHireRequestDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisanHireRequestsPage } from './ArtisanHireRequestsPage';

const BASE = '/api/admin/artisans/hire-requests';

function hireRequest(over: Partial<AdminHireRequestDto> = {}): AdminHireRequestDto {
  return {
    id: 'h1111111-1111-4111-8111-111111111111',
    customerId: 'c1111111-1111-4111-8111-111111111111',
    artisanId: 'a1111111-1111-4111-8111-111111111111',
    status: 'PENDING_ADMIN_REVIEW',
    adminReviewedBy: null,
    adminReviewedAt: null,
    adminRejectReason: null,
    addressText: '12 MG Road, Bengaluru',
    notes: 'Leaking pipe under kitchen sink',
    latestEstimate: null,
    startedAt: null,
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
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...over,
  };
}

let pending: AdminHireRequestDto[];
let reviewCalls: Array<{ id: string; body: unknown }>;

function useHandlers() {
  server.use(
    http.get(`${BASE}/pending`, () =>
      HttpResponse.json({
        success: true,
        data: { items: pending, total: pending.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.patch(`${BASE}/:id/review`, async ({ params, request }) => {
      const body = await request.json();
      reviewCalls.push({ id: String(params.id), body });
      return HttpResponse.json({
        success: true,
        data: { ...pending[0], status: 'PENDING_ARTISAN_RESPONSE' },
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
      <ArtisanHireRequestsPage />
    </QueryClientProvider>,
  );
}

describe('ArtisanHireRequestsPage', () => {
  beforeEach(() => {
    pending = [hireRequest()];
    reviewCalls = [];
    useHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the admin-gate context and a pending row', async () => {
    renderPage();
    expect(
      await screen.findByText(/artisan is notified only once you approve/),
    ).toBeInTheDocument();
    expect(await screen.findByText('12 MG Road, Bengaluru')).toBeInTheDocument();
  });

  it('shows who is involved: customer and ustaad name and phone in the list (0056)', async () => {
    renderPage();

    const row = await screen.findByRole('row', { name: /Asha Rao/ });
    expect(row).toHaveTextContent('Asha Rao');
    expect(row).toHaveTextContent('98765 43210');
    expect(row).toHaveTextContent('Ramesh Plumber');
    expect(row).toHaveTextContent('91234 56780');
  });

  it('the review popup shows both contacts with call links, and no ustaad email (0056)', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));

    const customer = screen.getByRole('group', { name: 'Customer' });
    expect(customer).toHaveTextContent('Asha Rao');
    expect(within(customer).getByRole('link', { name: '98765 43210' })).toHaveAttribute(
      'href',
      'tel:9876543210',
    );
    expect(within(customer).getByRole('link', { name: 'asha@example.com' })).toBeInTheDocument();
    const ustaad = screen.getByRole('group', { name: 'Ustaad' });
    expect(ustaad).toHaveTextContent('Ramesh Plumber');
    expect(ustaad).toHaveTextContent('PLUMBER');
    expect(within(ustaad).queryByText(/Email/)).not.toBeInTheDocument();
  });

  it('approving a row calls PATCH .../review with approve: true', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('12 MG Road, Bengaluru'));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(reviewCalls).toEqual([{ id: hireRequest().id, body: { approve: true } }]);
  });

  it('shows the artisan capacity signal in the review modal', async () => {
    pending = [hireRequest({ artisanActiveJobCount: 3, artisanTeamSize: 4 })];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('12 MG Road, Bengaluru'));

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('the reject button stays disabled until a reason is entered', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('12 MG Road, Bengaluru'));
    const rejectButton = await screen.findByRole('button', { name: 'Reject' });
    expect(rejectButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Required if rejecting'), 'Fully booked');
    expect(rejectButton).toBeEnabled();

    await user.click(rejectButton);
    expect(reviewCalls).toEqual([
      { id: hireRequest().id, body: { approve: false, rejectReason: 'Fully booked' } },
    ]);
  });
});
