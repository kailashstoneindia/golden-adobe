import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { brand, page } from '@/test/brandFixtures';
import { server } from '@/test/server';
import type { ProductListItem } from '@/types/catalog.types';

import { CatalogProductsPage } from './CatalogProductsPage';

const HAVELLS = brand();

function item(over: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: 'p1111111-1111-4111-8111-111111111111',
    productCode: 'GA-0000101',
    name: 'Havells MCB 10A',
    status: 'draft',
    categoryPath: 'electrical/mcb',
    brand: 'Havells',
    listingCount: 0,
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...over,
  };
}

let productUrls: URL[];
let bulkBodies: unknown[];

beforeEach(() => {
  productUrls = [];
  bulkBodies = [];
  server.use(
    http.get('/api/admin/catalog/categories', () => HttpResponse.json({ success: true, data: [] })),
    http.get('/api/admin/catalog/products', ({ request }) => {
      productUrls.push(new URL(request.url));
      return HttpResponse.json({
        success: true,
        data: { items: [item()], total: 1, page: 1, limit: 50 },
      });
    }),
    http.get('/api/admin/brands', () =>
      HttpResponse.json({ success: true, data: page([HAVELLS]) }),
    ),
    http.get('/api/admin/brands/:id', () => HttpResponse.json({ success: true, data: HAVELLS })),
    http.patch('/api/admin/catalog/products/bulk-publish', async ({ request }) => {
      bulkBodies.push(await request.json());
      return HttpResponse.json({
        success: true,
        data: {
          requested: 2,
          published: 1,
          failed: [],
          skipped: [
            {
              productId: 'p2',
              productCode: 'GA-0000102',
              reasons: ['needs at least one image', 'Missing: Rated current'],
            },
          ],
        },
      });
    }),
  );
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CatalogProductsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pickBrand() {
  await userEvent.click(screen.getByRole('button', { name: 'Brand: All brands' }));
  await userEvent.click(await screen.findByRole('option', { name: 'Havells' }));
}

describe('CatalogProductsPage brand filter (decision 0063)', () => {
  it('filters the list by the picked brand', async () => {
    renderPage();
    await screen.findByText('Havells MCB 10A');

    await pickBrand();

    await waitFor(() => expect(productUrls.at(-1)?.searchParams.get('brandId')).toBe(HAVELLS.id));
    expect(screen.getByRole('button', { name: 'Brand: Havells' })).toBeInTheDocument();
  });

  it('still searches by text', async () => {
    renderPage();
    await screen.findByText('Havells MCB 10A');

    await userEvent.type(screen.getByPlaceholderText(/Search by name/), 'mcb');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(productUrls.at(-1)?.searchParams.get('search')).toBe('mcb'));
  });

  it('publishes every draft of the brand and lists what was skipped, with reasons', async () => {
    renderPage();
    await screen.findByText('Havells MCB 10A');
    expect(screen.queryByRole('button', { name: /Publish all drafts of/ })).not.toBeInTheDocument();

    await pickBrand();
    await userEvent.click(screen.getByRole('button', { name: 'Draft' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Publish all drafts of Havells' }),
    );

    expect(bulkBodies).toEqual([{ brandId: HAVELLS.id }]);
    expect(await screen.findByText(/Published 1 of 2\./)).toBeInTheDocument();
    expect(
      screen.getByText('GA-0000102: needs at least one image; Missing: Rated current'),
    ).toBeInTheDocument();
  });

  it('opens the bulk image upload from the products page', async () => {
    renderPage();
    await screen.findByText('Havells MCB 10A');

    await userEvent.click(screen.getByRole('button', { name: 'Upload images' }));

    expect(screen.getByRole('dialog', { name: 'Upload images in bulk' })).toBeInTheDocument();
  });
});
