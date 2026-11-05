import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdminArtisanDto, type ArtisanAwaitingDocumentDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisanVerificationPage } from './ArtisanVerificationPage';

const BASE = '/api/admin/artisans';

function artisan(over: Partial<AdminArtisanDto> = {}): AdminArtisanDto {
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
    owner: {
      userId: 'u1111111-1111-4111-8111-111111111111',
      name: 'Mohan Lal',
      phone: '9988776655',
      email: 'mohan@example.com',
      role: Role.ARTISAN,
      isActive: true,
      isApproved: false,
      lastLoginAt: null,
    },
    documentViewUrl: null,
    documentMissing: false,
    documentLinks: 'ok',
    jobCounts: { active: 1, completed: 5, declined: 0, expired: 2, other: 1, total: 9 },
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...over,
  };
}

let pending: AdminArtisanDto[];
let verifyCalls: string[];
let rejectCalls: Array<{ id: string; body: unknown }>;
let awaiting: ArtisanAwaitingDocumentDto[];

function useHandlers() {
  // Registered first: a later server.use() wins, so the named routes below
  // match before this catch-all ':id' route.
  server.use(
    http.get(`${BASE}/:id`, ({ params }) => {
      const found = pending.find((a) => a.id === params.id);
      return HttpResponse.json({
        success: true,
        data: found && { ...found, documentViewUrl: 'https://signed.example.test/doc?sig=1' },
      });
    }),
  );
  server.use(
    http.get(`${BASE}/awaiting-document`, () =>
      HttpResponse.json({
        success: true,
        data: { items: awaiting, total: awaiting.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.get(`${BASE}/pending-verification`, () =>
      HttpResponse.json({
        success: true,
        data: { items: pending, total: pending.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.patch(`${BASE}/:id/verify`, ({ params }) => {
      verifyCalls.push(String(params.id));
      return HttpResponse.json({
        success: true,
        data: { ...pending[0], isVerified: true },
      });
    }),
    http.patch(`${BASE}/:id/reject-verification`, async ({ params, request }) => {
      const body = await request.json();
      rejectCalls.push({ id: String(params.id), body });
      return HttpResponse.json({
        success: true,
        data: { ...pending[0], isVerified: false },
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
    awaiting = [];
    verifyCalls = [];
    rejectCalls = [];
    useHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders a pending-verification row', async () => {
    renderPage();
    expect(await screen.findByText('Plumber')).toBeInTheDocument();
  });

  it('tells the admin that verifying also approves the account', async () => {
    renderPage();
    expect(
      await screen.findByText(/Verifying an ustaad also approves their account/),
    ).toBeInTheDocument();
  });

  it('lists ustaads waiting for a document with a call link (decision 0058)', async () => {
    awaiting = [
      {
        userId: 'u-await',
        name: 'Ramesh Kumar',
        phone: '9876543210',
        email: null,
        hasProfile: false,
        tradeType: null,
        servicePincode: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      },
    ];
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Waiting for a document' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Ramesh Kumar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '98765 43210' })).toHaveAttribute(
      'href',
      'tel:9876543210',
    );
    expect(screen.getByText('No profile yet')).toBeInTheDocument();
  });

  it('names the trade of a waiting ustaad who has a profile', async () => {
    awaiting = [
      {
        userId: 'u-await-2',
        name: 'Suresh Mehta',
        phone: null,
        email: null,
        hasProfile: true,
        tradeType: 'PLUMBER',
        servicePincode: '560001',
        createdAt: '2026-11-01T10:00:00.000Z',
      },
    ];
    renderPage();

    expect(await screen.findByText('Plumber · 560001 · no document')).toBeInTheDocument();
  });

  it('says how many are waiting when the list is longer than one page', async () => {
    awaiting = [
      {
        userId: 'u-1',
        name: 'First Waiting',
        phone: null,
        email: null,
        hasProfile: true,
        tradeType: 'PLUMBER',
        servicePincode: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      },
    ];
    server.use(
      http.get(`${BASE}/awaiting-document`, () =>
        HttpResponse.json({
          success: true,
          data: { items: awaiting, total: 35, page: 1, limit: 20, totalPages: 2 },
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Showing 1 of 35')).toBeInTheDocument();
  });

  it('does not claim nobody is waiting while the list is still loading', async () => {
    server.use(http.get(`${BASE}/awaiting-document`, () => new Promise(() => undefined)));
    renderPage();

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Nobody is waiting on a document.')).not.toBeInTheDocument();
  });

  it('explains there is nothing to review when the queue is empty', async () => {
    pending = [];
    renderPage();
    expect(await screen.findByText(/No ustaads awaiting verification/)).toBeInTheDocument();
  });

  it('approving a row calls PATCH /admin/artisans/:id/verify', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Plumber'));
    await user.click(await screen.findByRole('button', { name: 'Verify and approve' }));

    await screen.findByText('Plumber'); // dialog closes, list re-renders
    expect(verifyCalls).toEqual([artisan().id]);
  });

  it('rejecting with a reason calls PATCH .../reject-verification with that reason', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Plumber'));
    await user.type(
      screen.getByPlaceholderText('Optional, stored in logs only'),
      'Document is blurry',
    );
    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(rejectCalls).toEqual([{ id: artisan().id, body: { reason: 'Document is blurry' } }]);
  });

  it('rejecting with no reason sends an empty body', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Plumber'));
    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(rejectCalls).toEqual([{ id: artisan().id, body: {} }]);
  });
});

describe('ArtisanVerificationPage review popup (decision 0058 Task 6)', () => {
  beforeEach(() => {
    pending = [artisan()];
    verifyCalls = [];
    rejectCalls = [];
    awaiting = [];
    useHandlers();
  });

  it('shows who the ustaad is and lets the admin open their document', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Plumber'));

    expect(await screen.findByRole('group', { name: 'Owner' })).toHaveTextContent('99887 76655');
    expect(await screen.findByRole('link', { name: 'View ustaad document' })).toHaveAttribute(
      'href',
      'https://signed.example.test/doc?sig=1',
    );
  });
});

describe('ArtisanVerificationPage when the detail fails to load', () => {
  beforeEach(() => {
    pending = [artisan()];
    verifyCalls = [];
    rejectCalls = [];
    awaiting = [];
    useHandlers();
    server.use(
      // Only this ustaad's detail fails; the queue routes still answer.
      http.get(`${BASE}/${artisan().id}`, () =>
        HttpResponse.json({ success: false, message: 'boom' }, { status: 500 }),
      ),
    );
  });

  it('says so, and Verify still works', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Plumber'));

    expect(await screen.findByText("Could not load this ustaad's details.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify and approve' }));
    expect(verifyCalls).toEqual([artisan().id]);
  });
});
