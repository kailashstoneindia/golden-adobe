import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDriverDto, QueueItemDto } from '@golden-abode/types';

import { driver } from '@/test/deliveryFixtures';
import { server } from '@/test/server';

import { DeliveryQueuePage } from './DeliveryQueuePage';

const NOW = new Date('2026-11-12T12:00:00.000Z');

function item(over: Partial<QueueItemDto> = {}): QueueItemDto {
  return {
    groupId: 'g1111111-1111-4111-8111-111111111111',
    orderId: 'o1111111-1111-4111-8111-111111111111',
    vendorName: 'Kailash Stones',
    vendorCity: 'Jaipur',
    dropCity: 'Delhi',
    dropPincode: '110001',
    itemCount: 3,
    readyAt: '2026-11-12T09:45:00.000Z',
    ...over,
  };
}

let queue: QueueItemDto[];
let drivers: AdminDriverDto[];
let driverQueryUrl: string;
let assigned: unknown;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  queue = [
    item(),
    item({
      groupId: 'g2',
      orderId: 'o2222222-2222-4222-8222-222222222222',
      vendorName: 'Marble Co',
      itemCount: 1,
      readyAt: '2026-11-12T11:30:00.000Z',
    }),
  ];
  drivers = [
    driver(),
    driver({ id: 'd2', name: 'Solo Driver', helperName: null, helperPhone: null, vehicle: null }),
  ];
  assigned = undefined;
  driverQueryUrl = '';
  server.use(
    http.get('/api/admin/delivery/queue', () =>
      HttpResponse.json({
        success: true,
        data: { items: queue, total: queue.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.get('/api/admin/drivers', ({ request }) => {
      driverQueryUrl = request.url;
      return HttpResponse.json({
        success: true,
        data: { items: drivers, total: drivers.length, page: 1, limit: 100, totalPages: 1 },
      });
    }),
    http.post('/api/admin/delivery/assignments', async ({ request }) => {
      assigned = await request.json();
      queue = queue.filter(
        (q) => q.groupId !== (assigned as { orderVendorGroupId: string }).orderVendorGroupId,
      );
      return HttpResponse.json({ success: true, data: {} }, { status: 201 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeliveryQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeliveryQueuePage (decision 0060)', () => {
  it('lists ready groups with order, vendor, drop, item count and waiting time', async () => {
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    expect(within(row).getByText(/o1111111/)).toBeInTheDocument();
    expect(within(row).getByText('Delhi 110001')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('2h 15m')).toBeInTheDocument();
    const second = screen.getByText('Marble Co').closest('tr')!;
    expect(within(second).getByText('30m')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is waiting', async () => {
    queue = [];
    renderPage();
    expect(await screen.findByText(/Nothing is waiting for a driver/)).toBeInTheDocument();
  });

  it('Assign opens a driver select with active drivers only, showing helper and vehicle', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));

    const dialog = await screen.findByRole('dialog', { name: 'Assign driver' });
    const select = await within(dialog).findByLabelText('Driver');
    expect(await within(select).findByRole('option', { name: /Ramesh Kumar/ })).toHaveTextContent(
      /helper Suresh.*DL1CAB1234/,
    );
    expect(within(select).getByRole('option', { name: /Solo Driver/ })).toBeInTheDocument();
    expect(new URL(driverQueryUrl).searchParams.get('isActive')).toBe('true');
  });

  it('confirming posts the group and driver, closes the dialog and drops the row', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign driver' });
    const confirm = within(dialog).getByRole('button', { name: 'Assign driver' });
    expect(confirm).toBeDisabled();

    await user.selectOptions(await within(dialog).findByLabelText('Driver'), 'd2');
    await user.click(confirm);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(assigned).toEqual({
      orderVendorGroupId: 'g1111111-1111-4111-8111-111111111111',
      driverId: 'd2',
    });
    await waitFor(() => expect(screen.queryByText('Kailash Stones')).toBeNull());
    expect(screen.getByText('Marble Co')).toBeInTheDocument();
  });

  it('a 409 says "Already assigned" and refreshes the list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(
      http.post('/api/admin/delivery/assignments', () => {
        queue = queue.filter((q) => q.groupId !== 'g1111111-1111-4111-8111-111111111111');
        return HttpResponse.json(
          { success: false, message: 'this group already has an open delivery assignment' },
          { status: 409 },
        );
      }),
    );
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign driver' });
    await user.selectOptions(await within(dialog).findByLabelText('Driver'), 'd2');
    await user.click(within(dialog).getByRole('button', { name: 'Assign driver' }));

    expect(await screen.findByText('Already assigned')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Kailash Stones')).toBeNull());
  });

  it('shows another server message as is', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(
      http.post('/api/admin/delivery/assignments', () =>
        HttpResponse.json(
          { success: false, message: 'that driver is deactivated' },
          { status: 400 },
        ),
      ),
    );
    renderPage();
    const row = (await screen.findByText('Kailash Stones')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign driver' });
    await user.selectOptions(await within(dialog).findByLabelText('Driver'), 'd2');
    await user.click(within(dialog).getByRole('button', { name: 'Assign driver' }));
    expect(await within(dialog).findByText('that driver is deactivated')).toBeInTheDocument();
  });
});
