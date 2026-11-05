import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { Role, type AdminVendorDto, type AdminVendorListingDto } from '@golden-abode/types';

import { server } from '@/test/server';

import { VendorsPage } from './VendorsPage';

const VENDOR_ID = 'v1111111-1111-4111-8111-111111111111';

function vendor(over: Partial<AdminVendorDto> = {}): AdminVendorDto {
  return {
    id: VENDOR_ID,
    userId: 'u-vend',
    shopName: 'Stone Mart',
    address: '9 Ring Road, Jaipur',
    latitude: 26.91,
    longitude: 75.79,
    upiId: 'stonemart@okbank',
    bankDetails: null,
    accountDetails: {
      id: 'ad1',
      vendorId: VENDOR_ID,
      accountHolderName: 'Vikram Singh',
      bankName: 'State Bank of India',
      ifscCode: 'SBIN0001234',
      branchName: 'MI Road',
      accountNumber: '123456789012',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    gstin: '08ABCDE1234F1Z5',
    cityId: null,
    city: null,
    hasLoadingUnloadingTeam: true,
    minOrderValue: 5000,
    status: 'PENDING',
    rejectionReason: null,
    statusUpdatedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    citySource: 'admin',
    owner: {
      userId: 'u-vend',
      name: 'Vikram Singh',
      phone: '9123456780',
      email: 'vikram@example.com',
      role: Role.VENDOR,
      isActive: true,
      isApproved: false,
      lastLoginAt: null,
    },
    categoryCount: 4,
    listingCounts: { active: 12, paused: 2, outOfStock: 1 },
    openFlagCount: 0,
    orderGroupCount: 7,
    warehouses: [],
    ...over,
  };
}

const listing = (over: Partial<AdminVendorListingDto> = {}): AdminVendorListingDto => ({
  id: 'l1',
  masterProductId: 'mp1',
  productName: 'Kota Stone 2x2',
  productCode: 'KS-22',
  vendorSku: null,
  price: 450,
  mrp: null,
  minOrderQty: null,
  statedGrade: null,
  status: 'active',
  quantityAvailable: 40,
  quantityReserved: 0,
  supportsTinting: false,
  saleUnitType: 'discrete',
  unit: null,
  openFlags: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  stockUpdatedAt: null,
  ...over,
});

type Sent = { method: string; url: string; body: unknown };
let sent: Sent[];
let vendors: AdminVendorDto[];
let listingState: AdminVendorListingDto;

beforeEach(() => {
  sent = [];
  vendors = [vendor()];
  listingState = listing();
  const empty = { success: true, data: [] };
  server.use(
    http.get('/api/admin/vendors', () => HttpResponse.json({ success: true, data: vendors })),
    http.get('/api/admin/cities', () => HttpResponse.json(empty)),
    http.get('/api/admin/catalog/categories', () => HttpResponse.json(empty)),
    http.get('/api/admin/vendors/:id/categories', () => HttpResponse.json(empty)),
    http.get('/api/admin/vendors/:id/listings', () =>
      HttpResponse.json({
        success: true,
        data: { items: [listingState], total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.patch('/api/admin/vendors/:id', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      sent.push({ method: 'PATCH', url: request.url, body });
      if (body.gstin === 'BAD') {
        return HttpResponse.json(
          { success: false, message: 'gstin must be longer than or equal to 15 characters' },
          { status: 400 },
        );
      }
      vendors = [vendor(body as Partial<AdminVendorDto>)];
      return HttpResponse.json({ success: true, data: vendors[0] });
    }),
    http.put('/api/admin/vendors/:id/account-details', async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      sent.push({ method: 'PUT', url: request.url, body });
      const base = vendor().accountDetails!;
      vendors = [vendor({ accountDetails: { ...base, ...body } })];
      return HttpResponse.json({ success: true, data: vendors[0] });
    }),
    http.patch('/api/admin/vendor-listings/:id/status', async ({ request }) => {
      const body = (await request.json()) as { status: AdminVendorListingDto['status'] };
      sent.push({ method: 'PATCH', url: request.url, body });
      if (listingState.id === 'blocked') {
        return HttpResponse.json(
          {
            success: false,
            message:
              'This listing is waiting for the vendor to confirm which product it matches, so it cannot be activated yet',
          },
          { status: 409 },
        );
      }
      listingState = { ...listingState, status: body.status };
      return HttpResponse.json({ success: true, data: listingState });
    }),
  );
});

async function openPopup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter>
        <VendorsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('row', { name: /Stone Mart/ }));
  return user;
}

// Decision 0058 Task 10: fix the profile and bank details, pause a listing.
describe('VendorsPage edits', () => {
  it('edits the profile and sends only what changed', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('Shop name')).toHaveValue('Stone Mart');
    expect(screen.getByLabelText('Minimum order (₹)')).toHaveValue(5000);
    await user.clear(screen.getByLabelText('Shop name'));
    await user.type(screen.getByLabelText('Shop name'), 'Stone Mart Jaipur');
    await user.clear(screen.getByLabelText('Minimum order (₹)'));
    await user.type(screen.getByLabelText('Minimum order (₹)'), '7500');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ shopName: 'Stone Mart Jaipur', minOrderValue: 7500 });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument(),
    );
  });

  it('sends latitude and longitude together when the pin moves', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Latitude'));
    await user.type(screen.getByLabelText('Latitude'), '27.5');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ latitude: 27.5, longitude: 75.79 });
  });

  it('cannot save the profile until something changes', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));

    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  });

  it('shows the server’s reason when the profile is refused, and keeps the form open', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('GSTIN'));
    await user.type(screen.getByLabelText('GSTIN'), 'BAD');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('gstin must be longer');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });

  it('edits the bank details, showing the full account number and sending all five fields', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit bank details' }));
    expect(screen.getByLabelText('Account number')).toHaveValue('123456789012');
    await user.clear(screen.getByLabelText('Bank name'));
    await user.type(screen.getByLabelText('Bank name'), 'HDFC Bank');
    await user.click(screen.getByRole('button', { name: 'Save bank details' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'PUT' });
    expect(sent[0].body).toEqual({
      accountHolderName: 'Vikram Singh',
      bankName: 'HDFC Bank',
      ifscCode: 'SBIN0001234',
      branchName: 'MI Road',
      accountNumber: '123456789012',
    });
  });

  it('will not save bank details with a blank field', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Edit bank details' }));
    await user.clear(screen.getByLabelText('IFSC'));

    expect(screen.getByRole('button', { name: 'Save bank details' })).toBeDisabled();
  });

  it('lets the admin add bank details to a vendor who has none', async () => {
    vendors = [vendor({ accountDetails: null })];
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Add bank details' }));
    expect(screen.getByRole('button', { name: 'Save bank details' })).toBeDisabled();
    await user.type(screen.getByLabelText('Account holder'), 'Vikram Singh');
    await user.type(screen.getByLabelText('Bank name'), 'HDFC Bank');
    await user.type(screen.getByLabelText('IFSC'), 'HDFC0000123');
    await user.type(screen.getByLabelText('Branch'), 'Vaishali Nagar');
    await user.type(screen.getByLabelText('Account number'), '555566667777');
    await user.click(screen.getByRole('button', { name: 'Save bank details' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toMatchObject({ ifscCode: 'HDFC0000123', accountNumber: '555566667777' });
  });

  it('pauses a listing and then offers to reactivate it', async () => {
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Pause Kota Stone 2x2' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ status: 'paused' });
    expect(sent[0].url).toContain('/api/admin/vendor-listings/l1/status');
    await user.click(await screen.findByRole('button', { name: 'Reactivate Kota Stone 2x2' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].body).toEqual({ status: 'active' });
  });

  it('offers an out-of-stock listing a way back to active', async () => {
    listingState = listing({ status: 'out_of_stock' });
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Reactivate Kota Stone 2x2' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({ status: 'active' });
  });

  it('shows why a listing awaiting the vendor’s confirmation cannot be activated', async () => {
    listingState = listing({ id: 'blocked', status: 'paused' });
    const user = await openPopup();

    await user.click(await screen.findByRole('button', { name: 'Reactivate Kota Stone 2x2' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('waiting for the vendor to confirm');
  });
});
