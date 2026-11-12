import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDriverDto, VehicleDto } from '@golden-abode/types';

import { driver, vehicle } from '@/test/deliveryFixtures';
import { server } from '@/test/server';

const uploadToS3 = vi.hoisted(() => vi.fn());
vi.mock('@/services/api/mediaService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api/mediaService')>()),
  uploadToS3,
}));

import { DriversPage } from './DriversPage';

const DRIVER_ID = 'd1111111-1111-4111-8111-111111111111';
const USER_ID = 'u1111111-1111-4111-8111-111111111111';

let drivers: AdminDriverDto[];
let vehicles: VehicleDto[];
let patched: unknown;
let activeBody: unknown;
let uploadUrlBody: unknown;
let confirmBody: unknown;

function useHandlers() {
  server.use(
    http.get('/api/admin/drivers', () =>
      HttpResponse.json({
        success: true,
        data: { items: drivers, total: drivers.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.get(`/api/admin/drivers/${DRIVER_ID}`, () =>
      HttpResponse.json({ success: true, data: drivers[0] }),
    ),
    http.get('/api/admin/vehicles', () => HttpResponse.json({ success: true, data: vehicles })),
    http.patch(`/api/admin/drivers/${DRIVER_ID}`, async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ success: true, data: drivers[0] });
    }),
    http.patch(`/api/admin/users/${USER_ID}/active`, async ({ request }) => {
      activeBody = await request.json();
      drivers = [{ ...drivers[0], isActive: (activeBody as { isActive: boolean }).isActive }];
      return HttpResponse.json({ success: true, data: {} });
    }),
    http.post(`/api/admin/drivers/${DRIVER_ID}/document-upload-url`, async ({ request }) => {
      uploadUrlBody = await request.json();
      return HttpResponse.json(
        {
          success: true,
          data: {
            url: 'https://s3.test/upload',
            fields: { key: 'k1' },
            key: 'drivers/d1/licence-1.jpg',
          },
        },
        { status: 201 },
      );
    }),
    http.post(`/api/admin/drivers/${DRIVER_ID}/documents/confirm`, async ({ request }) => {
      confirmBody = await request.json();
      drivers = [{ ...drivers[0], licenceDocViewUrl: 'https://signed.test/licence.jpg' }];
      return HttpResponse.json({ success: true, data: drivers[0] });
    }),
  );
}

async function openDetail() {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DriversPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByText('Ramesh Kumar'));
  const dialog = await screen.findByRole('dialog', { name: /Ramesh Kumar/ });
  await within(dialog).findByLabelText('Licence number');
  return { user, dialog };
}

beforeEach(() => {
  drivers = [driver()];
  vehicles = [
    vehicle(),
    vehicle({ id: 'v2', registrationNumber: 'DL3NEW0002', type: 'Truck' }),
    vehicle({ id: 'v3', registrationNumber: 'DL9OLD0003', isActive: false }),
  ];
  patched = activeBody = uploadUrlBody = confirmBody = undefined;
  uploadToS3.mockReset();
  uploadToS3.mockResolvedValue(undefined);
  useHandlers();
});

describe('driver detail (decision 0060)', () => {
  it('shows licence number, helper and the assigned vehicle with active vehicles to choose from', async () => {
    const { dialog } = await openDetail();
    expect(within(dialog).getByLabelText('Licence number')).toHaveValue('DL-0420110012345');
    expect(within(dialog).getByLabelText('Helper name')).toHaveValue('Suresh');
    expect(within(dialog).getByLabelText('Helper phone')).toHaveValue('+919876500000');
    const select = within(dialog).getByLabelText('Vehicle');
    expect(select).toHaveValue('v1111111-1111-4111-8111-111111111111');
    expect(within(select).getByRole('option', { name: 'None' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: /DL3NEW0002/ })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /DL9OLD0003/ })).toBeNull();
  });

  it('saves only what changed with PATCH /admin/drivers/:id', async () => {
    const { user, dialog } = await openDetail();
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    const licence = within(dialog).getByLabelText('Licence number');
    await user.clear(licence);
    await user.type(licence, 'DL-NEW-1');
    await user.selectOptions(within(dialog).getByLabelText('Vehicle'), 'v2');
    await user.click(save);

    await waitFor(() => expect(patched).toEqual({ licenceNumber: 'DL-NEW-1', vehicleId: 'v2' }));
  });

  it('unassigns the vehicle with null and clears the helper with nulls', async () => {
    const { user, dialog } = await openDetail();
    await user.selectOptions(within(dialog).getByLabelText('Vehicle'), '');
    await user.clear(within(dialog).getByLabelText('Helper name'));
    await user.clear(within(dialog).getByLabelText('Helper phone'));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(patched).toEqual({ vehicleId: null, helperName: null, helperPhone: null }),
    );
  });

  it('refuses a helper name without a helper phone and does not save', async () => {
    const { user, dialog } = await openDetail();
    await user.clear(within(dialog).getByLabelText('Helper phone'));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(within(dialog).getByText('Give the helper name and phone together')).toBeInTheDocument();
    expect(patched).toBeUndefined();
  });

  it('uploads a licence: presigned URL, then S3, then confirm, then a View link', async () => {
    const { user, dialog } = await openDetail();
    expect(within(dialog).queryByRole('link', { name: 'View licence' })).toBeNull();

    const file = new File(['x'], 'licence.jpg', { type: 'image/jpeg' });
    await user.upload(within(dialog).getByLabelText('Upload licence'), file);

    const link = await within(dialog).findByRole('link', { name: 'View licence' });
    expect(link).toHaveAttribute('href', 'https://signed.test/licence.jpg');
    expect(uploadUrlBody).toEqual({ kind: 'licence', contentType: 'image/jpeg' });
    expect(uploadToS3).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://s3.test/upload', fields: { key: 'k1' } }),
      file,
    );
    expect(confirmBody).toEqual({ kind: 'licence', key: 'drivers/d1/licence-1.jpg' });
  });

  it('does not confirm when the S3 upload fails, and says so', async () => {
    uploadToS3.mockRejectedValue(new Error('Upload failed (403)'));
    const { user, dialog } = await openDetail();
    await user.upload(
      within(dialog).getByLabelText('Upload Aadhaar'),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    expect(await within(dialog).findByText('Upload failed (403)')).toBeInTheDocument();
    expect(confirmBody).toBeUndefined();
  });

  it('deactivating goes through the existing user active switch', async () => {
    const { user, dialog } = await openDetail();
    const toggle = within(dialog).getByRole('checkbox', { name: 'Active' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(activeBody).toEqual({ isActive: false }));
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: 'Active' })).not.toBeChecked(),
    );
  });
});
