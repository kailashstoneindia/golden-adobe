import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdminArtisanDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisansPage } from './ArtisansPage';

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
    isVerified: true,
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

let artisans: AdminArtisanDto[];

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
    expect(await screen.findByText('Plumber')).toBeInTheDocument();
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
            documentViewUrl: null,
            documentMissing: false,
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

    await user.click(await screen.findByText('Plumber'));

    expect(await screen.findByText('Reliable plumber')).toBeInTheDocument();
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bank' })).toHaveTextContent('SBI, Koramangala');
  });
});

// Decision 0058 Task 6: who the ustaad is, their team, and openable documents.
describe('ArtisansPage full ustaad view', () => {
  beforeEach(() => {
    artisans = [
      artisan({
        documentUrl: 'artisans/a1/id.pdf',
        documentViewUrl: 'https://signed.example.test/artisans/a1/id.pdf?sig=1',
        team: [
          {
            id: 't1',
            artisanId: 'a1111111-1111-4111-8111-111111111111',
            name: 'Suresh',
            roleOnTeam: 'Helper',
            phone: '9876543210',
            documentUrl: 'artisans/a1/suresh.pdf',
            documentViewUrl: 'https://signed.example.test/artisans/a1/suresh.pdf?sig=2',
            documentMissing: false,
            createdAt: '2026-10-29T00:00:00.000Z',
            updatedAt: '2026-10-29T00:00:00.000Z',
          },
        ],
        accountDetails: {
          id: 'acc1',
          artisanId: 'a1111111-1111-4111-8111-111111111111',
          accountHolderName: 'Mohan Lal',
          bankName: 'SBI',
          ifscCode: 'SBIN0001234',
          branchName: 'Koramangala',
          accountNumber: '998877665544',
          createdAt: '2026-10-29T00:00:00.000Z',
          updatedAt: '2026-10-29T00:00:00.000Z',
        },
      }),
    ];
    useHandlers();
  });

  it('lists the owner', async () => {
    renderPage();
    const row = await screen.findByRole('row', { name: /Mohan Lal/ });
    expect(row).toHaveTextContent('99887 76655');
  });

  it('shows the owner, document links, team documents, full account number and jobs', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Mohan Lal/ }));

    expect(await screen.findByRole('group', { name: 'Owner' })).toHaveTextContent(
      'mohan@example.com',
    );
    expect(screen.getByRole('link', { name: 'View ustaad document' })).toHaveAttribute(
      'href',
      'https://signed.example.test/artisans/a1/id.pdf?sig=1',
    );
    const team = screen.getByRole('group', { name: 'Team' });
    expect(team).toHaveTextContent('Suresh');
    expect(within(team).getByRole('link', { name: 'View document for Suresh' })).toHaveAttribute(
      'href',
      'https://signed.example.test/artisans/a1/suresh.pdf?sig=2',
    );
    expect(screen.getByRole('group', { name: 'Bank' })).toHaveTextContent('998877665544');
    expect(screen.getByRole('group', { name: 'Jobs' })).toHaveTextContent(
      '1 active · 5 completed · 0 declined · 2 expired · 1 other · 9 in total',
    );
  });
});

describe('ArtisansPage when document storage is not set up', () => {
  it('says the document exists but cannot be opened yet, rather than "No document"', async () => {
    artisans = [
      artisan({
        documentUrl: 'artisans/a1/id.pdf',
        documentViewUrl: null,
        documentLinks: 'storage_not_configured',
      }),
    ];
    useHandlers();
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Mohan Lal/ }));

    expect(await screen.findByRole('group', { name: 'Documents' })).toHaveTextContent(
      'Uploaded, but document storage is not set up',
    );
  });
});

describe('ArtisansPage document problems', () => {
  async function openWith(over: Partial<AdminArtisanDto>) {
    artisans = [artisan({ documentUrl: 'artisans/a1/id.pdf', documentViewUrl: null, ...over })];
    useHandlers();
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('row', { name: /Mohan Lal/ }));
    return screen.findByRole('group', { name: 'Documents' });
  }

  it('says the file is missing when the stored key has no file', async () => {
    expect(await openWith({ documentMissing: true })).toHaveTextContent('File missing');
  });

  it('says a link could not be made when signing failed', async () => {
    expect(await openWith({ documentLinks: 'signing_failed' })).toHaveTextContent(
      'Uploaded, but a link could not be made right now',
    );
  });
});
