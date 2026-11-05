import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { Role, type AdminArtisanDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { ArtisansPage } from './ArtisansPage';

const ARTISAN_ID = 'a1111111-1111-4111-8111-111111111111';
const MEMBER_ID = 'm1111111-1111-4111-8111-111111111111';
const BASE = '/api/admin/artisans';

function artisan(over: Partial<AdminArtisanDto> = {}): AdminArtisanDto {
  return {
    id: ARTISAN_ID,
    userId: 'u1111111-1111-4111-8111-111111111111',
    tradeType: 'PLUMBER',
    experienceYears: 6,
    bio: 'Reliable plumber',
    servicePincode: '560001',
    documentUrl: null,
    isVerified: true,
    isAvailable: true,
    accountDetails: {
      id: 'acc1',
      artisanId: ARTISAN_ID,
      accountHolderName: 'Mohan Lal',
      bankName: 'State Bank of India',
      ifscCode: 'SBIN0001234',
      branchName: 'Koramangala',
      accountNumber: '123456789012',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    team: [
      {
        id: MEMBER_ID,
        artisanId: ARTISAN_ID,
        name: 'Suresh',
        roleOnTeam: 'Helper',
        phone: '9876543210',
        documentUrl: null,
        documentViewUrl: null,
        documentMissing: false,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
    owner: {
      userId: 'u1111111-1111-4111-8111-111111111111',
      name: 'Mohan Lal',
      phone: '9988776655',
      email: 'mohan@example.com',
      role: Role.ARTISAN,
      isActive: true,
      isApproved: true,
      lastLoginAt: null,
    },
    documentViewUrl: null,
    documentMissing: false,
    documentLinks: 'ok',
    jobCounts: { active: 0, completed: 0, declined: 0, expired: 0, other: 0, total: 0 },
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...over,
  };
}

type Sent = { method: string; url: string; body: unknown };
let sent: Sent[];
let current: AdminArtisanDto;
let detailFetches: number;
let client: QueryClient;

beforeEach(() => {
  sent = [];
  current = artisan();
  detailFetches = 0;
  const page = () => ({ items: [current], total: 1, page: 1, limit: 20, totalPages: 1 });
  server.use(
    http.get(BASE, () => HttpResponse.json({ success: true, data: page() })),
    http.get(`${BASE}/:id`, () => {
      detailFetches += 1;
      return HttpResponse.json({ success: true, data: current });
    }),
    http.patch(`${BASE}/:id`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      sent.push({ method: 'PATCH', url: request.url, body });
      if (body.servicePincode === '000') {
        return HttpResponse.json(
          { success: false, message: 'servicePincode is not valid' },
          { status: 400 },
        );
      }
      current = artisan({ ...(body as Partial<AdminArtisanDto>), team: current.team });
      return HttpResponse.json({ success: true, data: current });
    }),
    http.put(`${BASE}/:id/account-details`, async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      sent.push({ method: 'PUT', url: request.url, body });
      current = artisan({ accountDetails: { ...artisan().accountDetails!, ...body } });
      return HttpResponse.json({ success: true, data: current });
    }),
    http.patch(`${BASE}/:id/team/:memberId`, async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      sent.push({ method: 'PATCH', url: request.url, body });
      current = artisan({ team: [{ ...current.team[0], ...body }] });
      return HttpResponse.json({ success: true, data: current });
    }),
    http.delete(`${BASE}/:id/team/:memberId`, ({ request }) => {
      sent.push({ method: 'DELETE', url: request.url, body: null });
      current = artisan({ team: [] });
      return HttpResponse.json({ success: true, data: current });
    }),
  );
});

async function openPopup() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ArtisansPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('row', { name: /Mohan Lal/ }));
  return user;
}

// Decision 0058 Task 11: fix the profile and bank details, correct or remove
// a team member.
describe('ArtisansPage edits', () => {
  it('edits the profile and sends only what changed', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('Trade')).toHaveValue('PLUMBER');
    expect(screen.getByLabelText('Experience (years)')).toHaveValue(6);
    await user.selectOptions(screen.getByLabelText('Trade'), 'MASON');
    await user.clear(screen.getByLabelText('Experience (years)'));
    await user.type(screen.getByLabelText('Experience (years)'), '9');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ tradeType: 'MASON', experienceYears: 9 });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument(),
    );
  });

  it('changes availability with the checkbox', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.click(screen.getByLabelText('Available for work'));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ isAvailable: false });
  });

  it('cannot save until something changes, and treats blank boxes as unchanged', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Bio'));
    await user.clear(screen.getByLabelText('Service pincode'));
    await user.clear(screen.getByLabelText('Experience (years)'));

    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(screen.getByText(/cannot be cleared here/)).toBeInTheDocument();
  });

  it('shows the server’s reason when the profile is refused, and keeps the form open', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Service pincode'));
    await user.type(screen.getByLabelText('Service pincode'), '000');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('servicePincode is not valid');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });

  it('edits the bank details and sends all five fields', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit bank details' }));
    expect(screen.getByLabelText('Account number')).toHaveValue('123456789012');
    await user.clear(screen.getByLabelText('Bank name'));
    await user.type(screen.getByLabelText('Bank name'), 'HDFC Bank');
    await user.click(screen.getByRole('button', { name: 'Save bank details' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'PUT' });
    expect(sent[0].body).toEqual({
      accountHolderName: 'Mohan Lal',
      bankName: 'HDFC Bank',
      ifscCode: 'SBIN0001234',
      branchName: 'Koramangala',
      accountNumber: '123456789012',
    });
  });

  it('lets the admin add bank details to an ustaad who has none', async () => {
    current = artisan({ accountDetails: null });
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Add bank details' }));
    expect(screen.getByRole('button', { name: 'Save bank details' })).toBeDisabled();
  });

  it('corrects a team member and sends only what changed', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit Suresh (Helper)' }));
    expect(screen.getByLabelText('Member name')).toHaveValue('Suresh');
    await user.clear(screen.getByLabelText('Member name'));
    await user.type(screen.getByLabelText('Member name'), 'Suresh Kumar');
    await user.click(screen.getByRole('button', { name: 'Save member' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ name: 'Suresh Kumar' });
    expect(sent[0].url).toContain(`/team/${MEMBER_ID}`);
    expect(await screen.findByText('Suresh Kumar')).toBeInTheDocument();
  });

  it('removes a team member only after a confirm', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Remove Suresh (Helper)' }));
    expect(sent).toHaveLength(0);
    expect(screen.getByText(/Remove Suresh from this ustaad's team/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm remove' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'DELETE' });
    expect(await screen.findByText('No team members added.')).toBeInTheDocument();
  });

  it('lets the admin back out of removing a member', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Remove Suresh (Helper)' }));
    await user.click(screen.getByRole('button', { name: 'Keep member' }));

    expect(sent).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Remove Suresh (Helper)' })).toBeInTheDocument();
  });

  // Task 11 review: the form must diff against what it was opened with, not
  // against the live record, or an untouched field can undo someone else's change.
  it('does not undo a change made elsewhere while the form was open', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const fetchesBefore = detailFetches;
    // The ustaad switches themselves off in the app; the popup refreshes.
    current = artisan({ isAvailable: false });
    await client.invalidateQueries({ queryKey: ['artisans'] });
    await waitFor(() => expect(detailFetches).toBeGreaterThan(fetchesBefore));
    await user.clear(screen.getByLabelText('Bio'));
    await user.type(screen.getByLabelText('Bio'), 'Updated bio');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ bio: 'Updated bio' });
  });

  it('says why a fractional experience cannot be saved', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Experience (years)'));
    await user.type(screen.getByLabelText('Experience (years)'), '2.5');

    expect(screen.getByText('Whole years only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  });

  it('tells two members with the same name apart by their role', async () => {
    current = artisan({
      team: [
        artisan().team[0],
        { ...artisan().team[0], id: 'm2222222-2222-4222-8222-222222222222', roleOnTeam: 'Mason' },
      ],
    });
    await openPopup();

    expect(await screen.findByRole('button', { name: 'Edit Suresh (Helper)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Suresh (Mason)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Suresh (Mason)' })).toBeInTheDocument();
  });

  it('gives a member with no name a usable button label', async () => {
    current = artisan({ team: [{ ...artisan().team[0], name: null, roleOnTeam: null }] });
    await openPopup();

    expect(await screen.findByRole('button', { name: 'Edit team member' })).toBeInTheDocument();
  });
});
