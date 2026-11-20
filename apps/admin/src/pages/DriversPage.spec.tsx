import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminDriverDto, VehicleDto } from '@golden-abode/types';

import { driver, vehicle } from '@/test/deliveryFixtures';
import { server } from '@/test/server';

import { DriversPage } from './DriversPage';

let drivers: AdminDriverDto[];
let vehicles: VehicleDto[];
let created: unknown;

function useHandlers() {
  server.use(
    http.get('/api/admin/drivers', () =>
      HttpResponse.json({
        success: true,
        data: { items: drivers, total: drivers.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.get('/api/admin/vehicles', () => HttpResponse.json({ success: true, data: vehicles })),
    http.post('/api/admin/drivers', async ({ request }) => {
      created = await request.json();
      const body = created as Partial<AdminDriverDto>;
      drivers = [
        ...drivers,
        driver({
          id: 'd2222222-2222-4222-8222-222222222222',
          name: body.name!,
          phone: body.phone!,
          licenceNumber: body.licenceNumber!,
          helperName: body.helperName ?? null,
          helperPhone: body.helperPhone ?? null,
          vehicle: null,
        }),
      ];
      return HttpResponse.json(
        { success: true, data: drivers[drivers.length - 1] },
        { status: 201 },
      );
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DriversPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  drivers = [
    driver(),
    driver({
      id: 'd3',
      name: 'Gone Driver',
      isActive: false,
      vehicle: null,
      helperName: null,
      helperPhone: null,
    }),
  ];
  vehicles = [vehicle(), vehicle({ id: 'v2', registrationNumber: 'DL2OLD0001', isActive: false })];
  created = undefined;
  useHandlers();
});

describe('DriversPage list (decision 0060)', () => {
  it('lists drivers with phone, helper, vehicle and an Active or Inactive badge', async () => {
    renderPage();
    const row = (await screen.findByText('Ramesh Kumar')).closest('tr')!;
    expect(within(row).getByText('+919876543210')).toBeInTheDocument();
    expect(within(row).getByText(/Suresh/)).toBeInTheDocument();
    expect(within(row).getByText('DL1CAB1234')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();

    const gone = screen.getByText('Gone Driver').closest('tr')!;
    expect(within(gone).getByText('Inactive')).toBeInTheDocument();
    expect(within(gone).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an empty state', async () => {
    drivers = [];
    renderPage();
    expect(await screen.findByText(/No drivers yet/)).toBeInTheDocument();
  });
});

describe('Add driver form', () => {
  async function openForm() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ramesh Kumar');
    await user.click(screen.getByRole('button', { name: 'Add driver' }));
    return { user, dialog: screen.getByRole('dialog') };
  }

  it('requires name, phone and licence number', async () => {
    const { user, dialog } = await openForm();
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));
    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Licence number is required')).toBeInTheDocument();
    expect(within(dialog).getByText(/Phone must be an Indian mobile number/)).toBeInTheDocument();
    expect(created).toBeUndefined();
  });

  it('rejects a phone that is not in +91 format', async () => {
    const { user, dialog } = await openForm();
    await user.type(within(dialog).getByLabelText('Name'), 'New Driver');
    await user.type(within(dialog).getByLabelText('Licence number'), 'DL-1');
    await user.type(within(dialog).getByLabelText('Phone'), '9876543210');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));
    expect(within(dialog).getByText(/like \+919876543210/)).toBeInTheDocument();
    expect(created).toBeUndefined();
  });

  it('a helper name without a helper phone is an inline error and does not submit', async () => {
    const { user, dialog } = await openForm();
    await user.type(within(dialog).getByLabelText('Name'), 'New Driver');
    await user.type(within(dialog).getByLabelText('Phone'), '+919811122233');
    await user.type(within(dialog).getByLabelText('Licence number'), 'DL-1');
    await user.type(within(dialog).getByLabelText('Helper name'), 'Helper Joe');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));
    expect(within(dialog).getByText('Give the helper name and phone together')).toBeInTheDocument();
    expect(created).toBeUndefined();
  });

  it('offers only active vehicles', async () => {
    const { dialog } = await openForm();
    const select = within(dialog).getByLabelText('Vehicle');
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: /DL1CAB1234/ })).toBeInTheDocument(),
    );
    expect(within(select).queryByRole('option', { name: /DL2OLD0001/ })).toBeNull();
    expect(within(select).getByRole('option', { name: 'None' })).toBeInTheDocument();
  });

  it('submits, closes the form and shows the new row', async () => {
    const { user, dialog } = await openForm();
    await user.type(within(dialog).getByLabelText('Name'), 'New Driver');
    await user.type(within(dialog).getByLabelText('Phone'), '+919811122233');
    await user.type(within(dialog).getByLabelText('Licence number'), 'DL-77');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));

    expect(await screen.findByText('New Driver')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(created).toEqual({
      name: 'New Driver',
      phone: '+919811122233',
      licenceNumber: 'DL-77',
    });
  });

  it('shows the server message when the phone is already in use', async () => {
    server.use(
      http.post('/api/admin/drivers', () =>
        HttpResponse.json(
          { success: false, message: 'That phone number is already registered' },
          { status: 409 },
        ),
      ),
    );
    const { user, dialog } = await openForm();
    await user.type(within(dialog).getByLabelText('Name'), 'New Driver');
    await user.type(within(dialog).getByLabelText('Phone'), '+919811122233');
    await user.type(within(dialog).getByLabelText('Licence number'), 'DL-77');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));
    expect(
      await within(dialog).findByText('That phone number is already registered'),
    ).toBeInTheDocument();
  });
});
