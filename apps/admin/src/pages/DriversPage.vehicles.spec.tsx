import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { VehicleDto } from '@golden-abode/types';

import { driver, vehicle } from '@/test/deliveryFixtures';
import { server } from '@/test/server';

import { DriversPage } from './DriversPage';

let vehicles: VehicleDto[];
let created: unknown;
let patched: unknown;

beforeEach(() => {
  vehicles = [
    vehicle(),
    vehicle({ id: 'v2', registrationNumber: 'DL9OLD0003', type: 'Truck', isActive: false }),
  ];
  created = patched = undefined;
  server.use(
    http.get('/api/admin/drivers', () =>
      HttpResponse.json({
        success: true,
        data: { items: [driver()], total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.get('/api/admin/vehicles', () => HttpResponse.json({ success: true, data: vehicles })),
    http.post('/api/admin/vehicles', async ({ request }) => {
      created = await request.json();
      const body = created as { registrationNumber: string; type: string; notes?: string };
      vehicles = [
        ...vehicles,
        vehicle({ id: 'v9', registrationNumber: body.registrationNumber, type: body.type }),
      ];
      return HttpResponse.json(
        { success: true, data: vehicles[vehicles.length - 1] },
        { status: 201 },
      );
    }),
    http.patch('/api/admin/vehicles/:id', async ({ request, params }) => {
      patched = { id: params.id, body: await request.json() };
      vehicles = vehicles.map((v) =>
        v.id === params.id ? { ...v, ...(patched as { body: object }).body } : v,
      );
      return HttpResponse.json({ success: true, data: {} });
    }),
  );
});

async function openVehicles() {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DriversPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('Ramesh Kumar');
  await user.click(screen.getByRole('button', { name: 'Vehicles' }));
  return user;
}

describe('Vehicles tab (decision 0060)', () => {
  it('lists registration, type and an Active or Inactive badge', async () => {
    await openVehicles();
    const row = (await screen.findByText('DL1CAB1234')).closest('tr')!;
    expect(within(row).getByText('Tempo')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    const old = screen.getByText('DL9OLD0003').closest('tr')!;
    expect(within(old).getByText('Inactive')).toBeInTheDocument();
  });

  it('requires a registration number and a type', async () => {
    const user = await openVehicles();
    await user.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create vehicle' }));
    expect(within(dialog).getByText('Registration number is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Type is required')).toBeInTheDocument();
    expect(created).toBeUndefined();
  });

  it('creates a vehicle, closes the form and shows the new row', async () => {
    const user = await openVehicles();
    await user.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Registration number'), 'DL5NEW9999');
    await user.type(within(dialog).getByLabelText('Type'), 'Pickup');
    await user.click(within(dialog).getByRole('button', { name: 'Create vehicle' }));

    expect(await screen.findByText('DL5NEW9999')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(created).toEqual({ registrationNumber: 'DL5NEW9999', type: 'Pickup' });
  });

  it('shows the server message inline for a duplicate registration (409)', async () => {
    server.use(
      http.post('/api/admin/vehicles', () =>
        HttpResponse.json(
          { success: false, message: 'A vehicle with that registration already exists' },
          { status: 409 },
        ),
      ),
    );
    const user = await openVehicles();
    await user.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Registration number'), 'DL1CAB1234');
    await user.type(within(dialog).getByLabelText('Type'), 'Tempo');
    await user.click(within(dialog).getByRole('button', { name: 'Create vehicle' }));

    expect(
      await within(dialog).findByText('A vehicle with that registration already exists'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('deactivates and reactivates a vehicle from its row', async () => {
    const user = await openVehicles();
    const row = (await screen.findByText('DL1CAB1234')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(patched).toEqual({ id: vehicle().id, body: { isActive: false } }));

    const old = screen.getByText('DL9OLD0003').closest('tr')!;
    await user.click(within(old).getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(patched).toEqual({ id: 'v2', body: { isActive: true } }));
  });
});
