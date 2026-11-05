import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/test/server';
import type { ProductDetail } from '@/types/catalog.types';

import { ProductDetailModal } from './ProductDetailModal';

const PRODUCT_ID = 'p1111111-1111-4111-8111-111111111111';

function product(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: 'GRN-001',
    name: 'Black Galaxy Slab',
    slug: 'black-galaxy-slab',
    status: 'live',
    categoryId: 'c1',
    categoryPath: 'stone.granite',
    brand: null,
    mfrPartNumber: null,
    gtin: null,
    hsnCode: '6802',
    gstRate: 18,
    countryOfOrigin: 'India',
    isGeneric: true,
    attributesFlat: {},
    listingCount: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    attributeValues: [],
    media: [],
    description: 'Polished slab for kitchen tops',
    productFamily: 'Slabs',
    stoneVariety: 'Black Galaxy',
    unitOfMeasure: 'Square foot',
    saleUnitType: 'discrete',
    packContentQty: 4,
    hasNaturalVariation: true,
    importerDetails: 'Imported by Stone Co, Jaipur',
    cachedBestPrice: 900,
    cachedBestVendorName: 'Stone Mart',
    listings: [
      {
        id: 'l1',
        vendorId: 'v1',
        shopName: 'Stone Mart',
        vendorApproved: true,
        price: 900,
        mrp: 1000,
        status: 'active',
        quantityAvailable: 12,
        quantityReserved: 2,
        updatedAt: '2026-11-03T00:00:00.000Z',
      },
      {
        id: 'l2',
        vendorId: 'v2',
        shopName: 'Rock House',
        vendorApproved: false,
        price: 1200,
        mrp: null,
        status: 'paused',
        quantityAvailable: null,
        quantityReserved: null,
        updatedAt: '2026-11-03T00:00:00.000Z',
      },
    ],
    ...over,
  };
}

let current: ProductDetail;

function renderModal() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProductDetailModal
        productId={PRODUCT_ID}
        isSubmitting={false}
        onClose={() => undefined}
        onPublish={() => undefined}
        onUnpublish={() => undefined}
      />
    </QueryClientProvider>,
  );
}

const row = (label: string) => screen.getByText(label).closest('div') as HTMLElement;

// Decision 0058 Task 8.
describe('ProductDetailModal', () => {
  beforeEach(() => {
    current = product();
    server.use(
      http.get(`/api/admin/catalog/products/${PRODUCT_ID}`, () =>
        HttpResponse.json({ success: true, data: current }),
      ),
      http.get(`/api/admin/catalog/products/${PRODUCT_ID}/media`, () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    );
  });

  it('shows the description, family, variety, unit and sale facts', async () => {
    renderModal();

    expect(await screen.findByText('Polished slab for kitchen tops')).toBeInTheDocument();
    expect(within(row('Family')).getByText('Slabs')).toBeInTheDocument();
    expect(within(row('Stone variety')).getByText('Black Galaxy')).toBeInTheDocument();
    expect(within(row('Unit')).getByText('Square foot')).toBeInTheDocument();
    expect(within(row('Sold as')).getByText('Single items · 4 per pack')).toBeInTheDocument();
    expect(within(row('Natural variation')).getByText('Yes')).toBeInTheDocument();
    expect(within(row('Importer')).getByText('Imported by Stone Co, Jaipur')).toBeInTheDocument();
    expect(within(row('Best price')).getByText('₹900.00 at Stone Mart')).toBeInTheDocument();
  });

  it('lists every vendor selling it with price, stock and approval', async () => {
    renderModal();

    const listings = await screen.findByRole('group', { name: 'Vendor listings' });
    const rows = within(listings).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Stone Mart');
    expect(rows[1]).toHaveTextContent('₹900.00');
    expect(rows[1]).toHaveTextContent('MRP ₹1000.00');
    expect(rows[1]).toHaveTextContent('12 available · 2 held');
    expect(rows[2]).toHaveTextContent('Rock House');
    expect(rows[2]).toHaveTextContent('Vendor not approved');
    expect(rows[2]).toHaveTextContent('No stock row');
    expect(rows[2]).toHaveTextContent('Paused');
  });

  it('says when nobody sells it and nothing optional is filled in', async () => {
    current = product({
      description: null,
      productFamily: null,
      stoneVariety: null,
      unitOfMeasure: null,
      packContentQty: null,
      importerDetails: null,
      cachedBestPrice: null,
      cachedBestVendorName: null,
      listings: [],
    });
    renderModal();

    expect(await screen.findByText('No vendor sells this product yet.')).toBeInTheDocument();
    expect(within(row('Family')).getByText('—')).toBeInTheDocument();
    expect(within(row('Best price')).getByText('—')).toBeInTheDocument();
  });
});
