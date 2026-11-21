import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReviewQueueItem, ReviewRowPrefillDto } from '@golden-abode/types';

import { brand, page } from '@/test/brandFixtures';
import { categoryTree, LEAF_ID, productDetail } from '@/test/catalogFixtures';
import { server } from '@/test/server';

import { CatalogReviewQueuePage } from './CatalogReviewQueuePage';

const HAVELLS = brand();
const CREATED = productDetail({
  id: 'p7777777-7777-4777-8777-777777777777',
  productCode: 'GA-0000777',
});
const MATCHED: ReviewQueueItem = {
  importRowId: 'r1111111-1111-4111-8111-111111111111',
  vendorId: 'v1',
  vendorName: 'Stone Mart',
  rawRow: { productRef: 'MCB-10', productName: 'Havells MCB 10A', price: 120 },
  candidates: [
    {
      masterProductId: 'p1',
      productName: 'Havells MCB 10A SP',
      productCode: 'GA-0000101',
      score: 0.82,
      matchedOn: 'name',
    },
  ],
  createdAt: '2026-11-21T09:00:00.000Z',
};
const NEW_ONE: ReviewQueueItem = {
  importRowId: 'r2222222-2222-4222-8222-222222222222',
  vendorId: 'v1',
  vendorName: 'Stone Mart',
  rawRow: {
    productRef: 'ZX-6A',
    productName: 'Zorvex 6A switch',
    brand: 'Havells India',
    price: 90,
  },
  candidates: [],
  createdAt: '2026-11-21T09:00:00.000Z',
};

let queue: ReviewQueueItem[];
let prefill: ReviewRowPrefillDto;
let created: unknown[];
let links: { rowId: string; body: unknown }[];
let linkFails: number;

beforeEach(() => {
  queue = [MATCHED, NEW_ONE];
  created = [];
  links = [];
  linkFails = 0;
  prefill = {
    name: 'Zorvex 6A switch',
    brandText: 'Havells India',
    suggestedBrandId: HAVELLS.id,
    suggestedBrandName: 'Havells',
    productRef: 'ZX-6A',
    categoryId: null,
    attributeValues: {},
    vendorName: 'Stone Mart',
  };
  server.use(
    http.get('/api/admin/catalog-review-queue', () =>
      HttpResponse.json({ success: true, data: queue }),
    ),
    http.get(`/api/admin/catalog-review-queue/${NEW_ONE.importRowId}/prefill`, () =>
      HttpResponse.json({ success: true, data: prefill }),
    ),
    http.post('/api/admin/catalog-review-queue/:rowId/link', async ({ params, request }) => {
      links.push({ rowId: String(params.rowId), body: await request.json() });
      if (linkFails > 0) {
        linkFails -= 1;
        return HttpResponse.json(
          { success: false, message: 'Network hiccup', statusCode: 500 },
          { status: 500 },
        );
      }
      queue = queue.filter((row) => row.importRowId !== params.rowId);
      return HttpResponse.json({ success: true, data: {} }, { status: 201 });
    }),
    http.get('/api/admin/catalog/categories', () =>
      HttpResponse.json({ success: true, data: categoryTree({ parentHsn: null }) }),
    ),
    http.get('/api/admin/catalog/categories/:id/attributes', () =>
      HttpResponse.json({
        success: true,
        data: {
          category: { id: LEAF_ID, path: 'electrical/switches', name: 'Switches' },
          attributes: [],
        },
      }),
    ),
    http.get('/api/admin/catalog/hsn-codes', () => HttpResponse.json({ success: true, data: [] })),
    http.get('/api/admin/brands', () =>
      HttpResponse.json({ success: true, data: page([HAVELLS]) }),
    ),
    http.get('/api/admin/brands/:id', () => HttpResponse.json({ success: true, data: HAVELLS })),
    http.post('/api/admin/catalog/products', async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json({ success: true, data: CREATED }, { status: 201 });
    }),
  );
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CatalogReviewQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openCreate() {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: /ZX-6A/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Create product from this row' }));
  return screen.findByRole('dialog', { name: 'New product from vendor row' });
}

async function fillAndSave(dialog: HTMLElement) {
  await userEvent.selectOptions(await within(dialog).findByLabelText('Category'), LEAF_ID);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
}

describe('CatalogReviewQueuePage (decision 0063)', () => {
  it('lists rows with their vendor reference and candidate count', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /MCB-10/ })).toHaveTextContent('1 candidate');
    expect(screen.getByRole('button', { name: /ZX-6A/ })).toHaveTextContent('0 candidates');
  });

  it('offers to create a product only for a row with no candidates', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /MCB-10/ }));
    expect(
      screen.queryByRole('button', { name: 'Create product from this row' }),
    ).not.toBeInTheDocument();
  });

  it('opens the product form filled from the row, with the suggested brand selected', async () => {
    const dialog = await openCreate();

    expect(await within(dialog).findByLabelText('Name *')).toHaveValue('Zorvex 6A switch');
    expect(await within(dialog).findByText('Selected: Havells')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Stone Mart listed this as “ZX-6A”, brand “Havells India”.'),
    ).toBeInTheDocument();
  });

  it('leaves the brand empty with Add brand when the vendor’s brand matched none', async () => {
    prefill = { ...prefill, brandText: 'Nobody', suggestedBrandId: null, suggestedBrandName: null };
    const dialog = await openCreate();

    await within(dialog).findByLabelText('Name *');
    expect(within(dialog).queryByText(/^Selected:/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add brand' })).toBeInTheDocument();
  });

  it('creates the product, links the row to it, and the row leaves the queue', async () => {
    const dialog = await openCreate();

    await fillAndSave(dialog);

    await waitFor(() =>
      expect(links).toEqual([
        { rowId: NEW_ONE.importRowId, body: { masterProductId: CREATED.id } },
      ]),
    );
    expect(created).toEqual([
      expect.objectContaining({ name: 'Zorvex 6A switch', brandId: HAVELLS.id }),
    ]);
    expect(
      await screen.findByText('GA-0000777 created and linked to the vendor’s row.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /ZX-6A/ })).not.toBeInTheDocument(),
    );
  });

  it('says when the product was created but the link failed, and links on retry', async () => {
    linkFails = 1;
    const dialog = await openCreate();

    await fillAndSave(dialog);

    expect(
      await within(dialog).findByText('GA-0000777 was created but not linked: Network hiccup'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Link now' }));

    expect(
      await screen.findByText('GA-0000777 created and linked to the vendor’s row.'),
    ).toBeInTheDocument();
    expect(links).toHaveLength(2);
    expect(created).toHaveLength(1);
  });
});
