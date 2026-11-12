import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminAssignmentDto, AdminDriverDto } from '@golden-abode/types';

import { driver } from '@/test/deliveryFixtures';
import { server } from '@/test/server';

import { DeliveryBoardPage } from './DeliveryBoardPage';

function assignment(over: Partial<AdminAssignmentDto> = {}): AdminAssignmentDto {
  return {
    id: 'a1111111-1111-4111-8111-111111111111',
    status: 'assigned',
    attemptNo: 1,
    groupId: 'g1111111-1111-4111-8111-111111111111',
    orderId: 'o1111111-1111-4111-8111-111111111111',
    vendorName: 'Kailash Stones',
    driver: { id: 'd1', name: 'Ramesh Kumar', phone: '+919876543210' },
    assignedAt: '2026-11-12T09:00:00.000Z',
    vendorHandedOverAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    deliveryPhotoViewUrl: null,
    failurePhotoViewUrl: null,
    ...over,
  };
}

let rows: Record<string, AdminAssignmentDto[]>;
let drivers: AdminDriverDto[];
let listUrls: string[];
let posted: { path: string; body: unknown }[];

beforeEach(() => {
  rows = {
    assigned: [assignment()],
    picked_up: [
      assignment({
        id: 'a2',
        status: 'picked_up',
        vendorName: 'Marble Co',
        orderId: 'o2222222-2222-4222-8222-222222222222',
        pickedUpAt: '2026-11-12T10:00:00.000Z',
      }),
    ],
    failed: [
      assignment({
        id: 'a3',
        status: 'failed',
        vendorName: 'Tiles Ltd',
        orderId: 'o3333333-3333-4333-8333-333333333333',
        groupId: 'g3333333-3333-4333-8333-333333333333',
        failedAt: '2026-11-12T11:00:00.000Z',
        failureReason: 'customer_unavailable',
        failurePhotoViewUrl: 'https://signed.test/failed.jpg',
      }),
    ],
    delivered: [
      assignment({
        id: 'a4',
        status: 'delivered',
        vendorName: 'Sand Depot',
        orderId: 'o4444444-4444-4444-8444-444444444444',
        deliveredAt: '2026-11-12T11:30:00.000Z',
        deliveryPhotoViewUrl: 'https://signed.test/delivered.jpg',
      }),
    ],
  };
  drivers = [
    driver({ id: 'd1' }),
    driver({ id: 'd2', name: 'Solo Driver', helperName: null, helperPhone: null, vehicle: null }),
  ];
  listUrls = [];
  posted = [];
  server.use(
    http.get('/api/admin/delivery/assignments', ({ request }) => {
      listUrls.push(request.url);
      const status = new URL(request.url).searchParams.get('status') ?? '';
      const items = rows[status] ?? [];
      return HttpResponse.json({
        success: true,
        data: { items, total: items.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
    http.get('/api/admin/drivers', () =>
      HttpResponse.json({
        success: true,
        data: { items: drivers, total: drivers.length, page: 1, limit: 100, totalPages: 1 },
      }),
    ),
    http.post('/api/admin/delivery/assignments/:id/reassign', async ({ request, params }) => {
      posted.push({ path: `reassign/${params.id}`, body: await request.json() });
      return HttpResponse.json({ success: true, data: {} }, { status: 201 });
    }),
    http.post('/api/admin/delivery/groups/:groupId/reattempt', async ({ request, params }) => {
      posted.push({ path: `reattempt/${params.groupId}`, body: await request.json() });
      return HttpResponse.json({ success: true, data: {} }, { status: 201 });
    }),
  );
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeliveryBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const statusOfLastCall = () => new URL(listUrls[listUrls.length - 1]).searchParams.get('status');

describe('DeliveryBoardPage (decision 0060)', () => {
  it('opens on Assigned and each tab asks the list for its own status', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Kailash Stones')).toBeInTheDocument();
    expect(statusOfLastCall()).toBe('assigned');

    for (const [tab, status, vendor] of [
      ['Picked up', 'picked_up', 'Marble Co'],
      ['Failed', 'failed', 'Tiles Ltd'],
      ['Delivered', 'delivered', 'Sand Depot'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: tab }));
      expect(await screen.findByText(vendor)).toBeInTheDocument();
      expect(statusOfLastCall()).toBe(status);
    }
    // Back to the first tab: served from cache, so no new request, but the right rows.
    await user.click(screen.getByRole('button', { name: 'Assigned' }));
    expect(await screen.findByText('Kailash Stones')).toBeInTheDocument();
  });

  it('shows the driver, vendor and order on each row, and an empty state', async () => {
    const user = userEvent.setup();
    rows.picked_up = [];
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    expect(within(row).getByText('Ramesh Kumar')).toBeInTheDocument();
    expect(within(row).getByText(/o1111111/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Picked up' }));
    expect(await screen.findByText('Nothing here right now.')).toBeInTheDocument();
  });

  it('an assigned row can be reassigned to another driver', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Reassign' }));

    const dialog = await screen.findByRole('dialog', { name: 'Reassign driver' });
    const select = await within(dialog).findByLabelText('Driver');
    // The driver already on the job is not offered again.
    await waitFor(() =>
      expect(within(select).queryByRole('option', { name: /Ramesh Kumar/ })).toBeNull(),
    );
    await user.selectOptions(select, 'd2');
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posted).toEqual([
      { path: 'reassign/a1111111-1111-4111-8111-111111111111', body: { driverId: 'd2' } },
    ]);
  });

  it('picked-up and delivered rows have no Reassign or Re-attempt', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Kailash Stones');
    for (const tab of ['Picked up', 'Delivered']) {
      await user.click(screen.getByRole('button', { name: tab }));
      await screen.findAllByRole('row');
      expect(screen.queryByRole('button', { name: 'Reassign' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Re-attempt' })).toBeNull();
    }
  });

  it('a failed row shows the reason, a photo link and Re-attempt with a driver select', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Failed' }));
    const row = (await screen.findByText('Tiles Ltd')).closest('tr')!;
    expect(within(row).getByText('Customer unavailable')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'View photo' })).toHaveAttribute(
      'href',
      'https://signed.test/failed.jpg',
    );

    await user.click(within(row).getByRole('button', { name: 'Re-attempt' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-attempt delivery' });
    await user.selectOptions(await within(dialog).findByLabelText('Driver'), 'd2');
    await user.click(within(dialog).getByRole('button', { name: 'Start re-attempt' }));

    await waitFor(() =>
      expect(posted).toEqual([
        { path: 'reattempt/g3333333-3333-4333-8333-333333333333', body: { driverId: 'd2' } },
      ]),
    );
  });

  it('a delivered row has a View photo link from deliveryPhotoViewUrl', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delivered' }));
    const row = (await screen.findByText('Sand Depot')).closest('tr')!;
    expect(within(row).getByRole('link', { name: 'View photo' })).toHaveAttribute(
      'href',
      'https://signed.test/delivered.jpg',
    );
  });

  it('a delivered row without a photo link shows no link', async () => {
    const user = userEvent.setup();
    rows.delivered = [
      assignment({
        id: 'a5',
        status: 'delivered',
        vendorName: 'No Photo Co',
        deliveryPhotoViewUrl: null,
      }),
    ];
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delivered' }));
    const row = (await screen.findByText('No Photo Co')).closest('tr')!;
    expect(within(row).queryByRole('link', { name: 'View photo' })).toBeNull();
  });
});
