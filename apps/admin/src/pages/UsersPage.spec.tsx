import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { Role, type AdminUserDetailDto, type AdminUserDto } from '@golden-abode/types';
import { MemoryRouter } from 'react-router-dom';

import { server } from '@/test/server';

import { UsersPage } from './UsersPage';

const ustaad = {
  id: 'u-ustaad',
  name: 'Suresh Ustaad',
  phone: '9876500000',
  email: null,
  role: Role.ARTISAN,
  pushEnabled: false,
  isActive: true,
  isApproved: false,
  onboardingCompleted: true,
  onboardingCompletedAt: null,
  onboardingStage: null,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
} satisfies AdminUserDto;

describe('UsersPage', () => {
  it('shows the server reason when approving an ustaad fails (decision 0058)', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          success: true,
          data: { items: [ustaad], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.patch('/api/admin/users/:id/approve', () =>
        HttpResponse.json(
          {
            success: false,
            message: 'This ustaad has not created a profile or uploaded a document yet',
          },
          { status: 400 },
        ),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByText('Suresh Ustaad'));
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText('This ustaad has not created a profile or uploaded a document yet'),
    ).toBeInTheDocument();
  });
});

describe('UsersPage vendor rejection (decision 0058 F2)', () => {
  it('asks for a reason and sends it, because the vendor record keeps it', async () => {
    const vendorUser = { ...ustaad, id: 'u-vendor', name: 'Vikram Vendor', role: Role.VENDOR };
    const bodies: unknown[] = [];
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          success: true,
          data: { items: [vendorUser], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.patch('/api/admin/users/:id/reject', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ success: true, data: vendorUser });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByText('Vikram Vendor'));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(screen.getByRole('textbox'), 'GSTIN does not match');
    await user.click(screen.getByRole('button', { name: 'Confirm reject' }));

    await waitFor(() => expect(bodies).toEqual([{ reason: 'GSTIN does not match' }]));
  });
});

// Decision 0058 Task 7.
describe('UsersPage list and popup', () => {
  it('lists email, active and onboarding stage, and the popup shows the server’s detail', async () => {
    const vendorUser = {
      ...ustaad,
      id: 'u-vendor',
      name: 'Vikram Vendor',
      role: Role.VENDOR,
      email: 'vikram@example.com',
      isActive: false,
      onboardingStage: 'BANK_DETAILS' as const,
    } satisfies AdminUserDto;
    const detail: AdminUserDetailDto = {
      ...vendorUser,
      pushEnabled: true,
      activeSessionCount: 3,
      customerProfile: null,
    };
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          success: true,
          data: { items: [vendorUser], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.get('/api/admin/users/:id', () => HttpResponse.json({ success: true, data: detail })),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    const row = await screen.findByRole('row', { name: /Vikram Vendor/ });
    expect(row).toHaveTextContent('vikram@example.com');
    expect(row).toHaveTextContent('Deactivated');
    expect(row).toHaveTextContent('Bank details');

    await user.click(row);

    expect(await screen.findByText('Signed-in devices')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('pages through users beyond the first page', async () => {
    const pages: string[] = [];
    server.use(
      http.get('/api/admin/users', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        pages.push(page);
        const name = page === '2' ? 'Second Page User' : 'First Page User';
        return HttpResponse.json({
          success: true,
          data: {
            items: [{ ...ustaad, id: `u-${page}`, name }],
            total: 21,
            page: Number(page),
            limit: 20,
            totalPages: 2,
          },
        });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    await screen.findByText('First Page User');
    expect(screen.getByText('Page 1 of 2 (21 users)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Second Page User')).toBeInTheDocument();
    expect(pages).toContain('2');
  });
});

// Task 7 review: a failed or slow detail must not read as "not a customer".
describe('UsersPage popup while the detail is not there', () => {
  function serve(detail: () => Response | Promise<Response>) {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          success: true,
          data: { items: [ustaad], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.get('/api/admin/users/:id', detail),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('says the details are loading', async () => {
    serve(() => new Promise<Response>(() => undefined));
    const user = userEvent.setup();

    await user.click(await screen.findByText('Suresh Ustaad'));

    expect(screen.getByText('Loading sessions and customer details…')).toBeInTheDocument();
  });

  it('says the details could not be loaded', async () => {
    serve(() => HttpResponse.json({ success: false, message: 'boom' }, { status: 500 }));
    const user = userEvent.setup();

    await user.click(await screen.findByText('Suresh Ustaad'));

    expect(
      await screen.findByText('Could not load sessions and customer details.'),
    ).toBeInTheDocument();
  });
});

// Decision 0058 Task 9: edit and save updates the popup and the list.
describe('UsersPage edits', () => {
  let stored: AdminUserDetailDto;
  const requests: { method: string; url: string; body: unknown }[] = [];

  beforeEach(() => {
    requests.length = 0;
    stored = {
      ...ustaad,
      id: 'u-edit',
      name: 'Asha Rao',
      role: Role.CUSTOMER,
      email: 'asha@example.com',
      phone: '+919876543210',
      isActive: true,
      isApproved: true,
      pushEnabled: true,
      activeSessionCount: 2,
      customerProfile: null,
    };
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          success: true,
          data: { items: [stored], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.get('/api/admin/users/:id', () => HttpResponse.json({ success: true, data: stored })),
      http.patch('/api/admin/users/:id', async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        requests.push({ method: 'PATCH', url: request.url, body });
        if (body.phone === '+919000000001') {
          return HttpResponse.json(
            { success: false, message: 'This phone number is already used by another account' },
            { status: 409 },
          );
        }
        stored = { ...stored, ...body };
        return HttpResponse.json({ success: true, data: stored });
      }),
      http.patch('/api/admin/users/:id/active', async ({ request }) => {
        const body = (await request.json()) as { isActive: boolean };
        requests.push({ method: 'PATCH', url: request.url, body });
        stored = { ...stored, isActive: body.isActive, activeSessionCount: 0 };
        return HttpResponse.json({ success: true, data: stored });
      }),
      http.post('/api/admin/users/:id/revoke-sessions', async ({ request }) => {
        requests.push({ method: 'POST', url: request.url, body: null });
        stored = { ...stored, activeSessionCount: 0 };
        return HttpResponse.json({ success: true, data: stored });
      }),
    );
  });

  function renderUsers() {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return userEvent.setup();
  }

  it('saves a corrected name and shows it in the popup and the list', async () => {
    const user = renderUsers();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Asha R. Rao');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('row', { name: /Asha R\. Rao/ })).toBeInTheDocument();
    expect(requests[0].body).toEqual({ name: 'Asha R. Rao' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Asha R. Rao');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('shows the server’s reason when the phone belongs to someone else', async () => {
    const user = renderUsers();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '+919000000001');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This phone number is already used by another account'),
    ).toBeInTheDocument();
  });

  it('deactivates after a confirm, and the popup then offers to reactivate', async () => {
    const user = renderUsers();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));
    await user.click(await screen.findByRole('button', { name: 'Deactivate account' }));
    await user.click(screen.getByRole('button', { name: 'Confirm deactivate' }));

    expect(await screen.findByRole('button', { name: 'Reactivate account' })).toBeInTheDocument();
    expect(requests[0]).toMatchObject({ method: 'PATCH', body: { isActive: false } });
    expect(screen.getByRole('row', { name: /Asha Rao/ })).toHaveTextContent('Deactivated');
  });

  it('signs out everywhere and the device count drops to zero', async () => {
    const user = renderUsers();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    await user.click(screen.getByRole('button', { name: 'Confirm sign out' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeDisabled(),
    );
    expect(requests[0].method).toBe('POST');
  });
});
