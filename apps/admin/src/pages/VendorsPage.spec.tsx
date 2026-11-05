import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
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
    bankDetails: 'Old free-text bank note',
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
    openFlagCount: 1,
    orderGroupCount: 7,
    warehouses: [{ id: 'w1', name: 'Main yard', address: 'Plot 9', isActive: true }],
    ...over,
  };
}

const listing = (over: Partial<AdminVendorListingDto> = {}): AdminVendorListingDto => ({
  id: 'l1',
  masterProductId: 'mp1',
  productName: 'Kota Stone 2x2',
  productCode: 'KS-22',
  vendorSku: 'SKU-9',
  price: 450,
  mrp: 500,
  minOrderQty: 10,
  statedGrade: 'A',
  status: 'active',
  quantityAvailable: 40,
  quantityReserved: 3,
  supportsTinting: false,
  saleUnitType: 'discrete',
  unit: 'Square Foot',
  openFlags: [{ reason: 'price looks wrong', flaggedAt: '2026-10-30T09:00:00.000Z' }],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  stockUpdatedAt: '2026-11-02T08:00:00.000Z',
  ...over,
});

let vendors: AdminVendorDto[];
let listingRequests: string[];

function useHandlers() {
  const empty = { success: true, data: [] };
  server.use(
    http.get('/api/admin/vendors', () => HttpResponse.json({ success: true, data: vendors })),
    http.get('/api/admin/cities', () => HttpResponse.json(empty)),
    http.get('/api/admin/catalog/categories', () => HttpResponse.json(empty)),
    http.get('/api/admin/vendors/:id/categories', () => HttpResponse.json(empty)),
    http.get('/api/admin/vendors/:id/listings', ({ request }) => {
      const url = new URL(request.url);
      listingRequests.push(url.search);
      const status = url.searchParams.get('status');
      const items =
        status === 'paused'
          ? [listing({ id: 'l2', status: 'paused', openFlags: [] })]
          : [listing()];
      return HttpResponse.json({
        success: true,
        data: { items, total: items.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
    http.patch('/api/admin/vendors/:id/approve', () => {
      vendors = [vendor({ status: 'APPROVED' })];
      // The approve reply is the plain vendor profile, without owner or counts.
      return HttpResponse.json({ success: true, data: { ...vendors[0], owner: undefined } });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <VendorsPage />
    </QueryClientProvider>,
  );
}

// Decision 0058 Task 5: everything the admin needs to know about a vendor.
describe('VendorsPage', () => {
  beforeEach(() => {
    vendors = [vendor()];
    listingRequests = [];
    useHandlers();
  });

  it('lists owner, active listings and only the last digits of the account', async () => {
    renderPage();

    const row = await screen.findByRole('row', { name: /Stone Mart/ });
    expect(row).toHaveTextContent('Vikram Singh');
    expect(row).toHaveTextContent('91234 56780');
    expect(row).toHaveTextContent('12');
    expect(row).toHaveTextContent('•••• 9012');
    expect(row).not.toHaveTextContent('123456789012');
  });

  it('shows owner, payout in full, location, commercial terms, counts and warehouses', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Stone Mart/ }));

    expect(screen.getByRole('group', { name: 'Owner' })).toHaveTextContent('vikram@example.com');
    const payout = screen.getByRole('group', { name: 'Payout' });
    expect(payout).toHaveTextContent('123456789012');
    expect(payout).toHaveTextContent('SBIN0001234');
    expect(payout).toHaveTextContent('stonemart@okbank');
    expect(payout).toHaveTextContent('Old free-text bank note');
    const location = screen.getByRole('group', { name: 'Location' });
    expect(location).toHaveTextContent('26.91, 75.79');
    expect(within(location).getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=26.91,75.79',
    );
    const business = screen.getByRole('group', { name: 'Business' });
    expect(business).toHaveTextContent('₹5000');
    expect(business).toHaveTextContent('Has a loading team');
    expect(business).toHaveTextContent('12 active · 2 paused · 1 out of stock');
    expect(business).toHaveTextContent('1 open flag');
    expect(business).toHaveTextContent('7 order groups');
    expect(business).toHaveTextContent('4 categories');
    expect(screen.getByRole('group', { name: 'Warehouses' })).toHaveTextContent('Main yard');
    expect(payout).toHaveTextContent('Last changed');
    expect(screen.getByRole('dialog')).toHaveTextContent('pinned by an admin');
  });

  it('shows the vendor’s listings with stock and flags, filterable by status', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Stone Mart/ }));
    const listings = screen.getByRole('group', { name: 'Listings' });
    const row = await within(listings).findByRole('row', { name: /Kota Stone 2x2/ });
    expect(row).toHaveTextContent('KS-22');
    expect(row).toHaveTextContent('₹450');
    expect(row).toHaveTextContent('40');
    expect(row).toHaveTextContent('price looks wrong (30 Oct 2026');
    expect(row).toHaveTextContent('40 Square Foot');

    await user.selectOptions(within(listings).getByLabelText('Listing status'), 'paused');

    await waitFor(() => expect(listingRequests.at(-1)).toContain('status=paused'));
    expect(await within(listings).findByRole('row', { name: /Paused/ })).toBeInTheDocument();
  });

  it('keeps the owner and counts on screen after approving', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Stone Mart/ }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Approved'));
    expect(screen.getByRole('group', { name: 'Owner' })).toHaveTextContent('Vikram Singh');
  });
});
