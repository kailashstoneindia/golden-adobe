import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LEAF_ID, productDetail, readiness } from '@/test/catalogFixtures';
import { server } from '@/test/server';
import type { ProductDetail, ProductListItem } from '@/types/catalog.types';

import { ProductDetailModal } from './ProductDetailModal';

const KEEPER: ProductListItem = {
  id: 'p8888888-8888-4888-8888-888888888888',
  productCode: 'GA-0000800',
  name: 'Modular switch 6A (original)',
  status: 'live',
  categoryPath: 'electrical/switches',
  brand: 'Havells',
  listingCount: 2,
  updatedAt: '2026-11-20T10:00:00.000Z',
};

let current: ProductDetail;
let calls: string[];
let productListUrls: URL[];
let deleteRefused: boolean;

beforeEach(() => {
  current = productDetail({ status: 'live' });
  calls = [];
  productListUrls = [];
  deleteRefused = false;
  const base = `/api/admin/catalog/products/${current.id}`;
  server.use(
    http.get(base, () => HttpResponse.json({ success: true, data: current })),
    http.get(`${base}/media`, () => HttpResponse.json({ success: true, data: [] })),
    http.get(`${base}/readiness`, () => HttpResponse.json({ success: true, data: readiness() })),
    http.patch(`${base}/retire`, () => {
      calls.push('retire');
      current = { ...current, status: 'deprecated' };
      return HttpResponse.json({ success: true, data: current });
    }),
    http.patch(`${base}/restore`, () => {
      calls.push('restore');
      current = { ...current, status: 'draft' };
      return HttpResponse.json({ success: true, data: current });
    }),
    http.delete(base, () => {
      calls.push('delete');
      if (deleteRefused) {
        return HttpResponse.json(
          {
            success: false,
            message:
              'Only a draft with no listings, orders or import rows can be deleted. Retire it instead',
            statusCode: 409,
          },
          { status: 409 },
        );
      }
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/admin/catalog/products', ({ request }) => {
      productListUrls.push(new URL(request.url));
      return HttpResponse.json({
        success: true,
        data: {
          items: [KEEPER, { ...KEEPER, id: current.id, productCode: current.productCode }],
          total: 2,
          page: 1,
          limit: 20,
        },
      });
    }),
    http.post(`${base}/merge`, async ({ request }) => {
      calls.push(`merge ${JSON.stringify(await request.json())}`);
      return HttpResponse.json(
        {
          success: true,
          data: {
            movedListings: 1,
            movedMappings: 0,
            mediaMoved: false,
            pausedListings: [
              { listingId: 'l1', vendorName: 'Stone Mart', reason: 'already lists it' },
            ],
          },
        },
        { status: 201 },
      );
    }),
  );
});

function renderModal(onClose = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProductDetailModal
        productId={current.id}
        isSubmitting={false}
        onClose={onClose}
        onPublish={() => undefined}
        onUnpublish={() => undefined}
      />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('ProductDetailModal retire, restore, delete, merge (decision 0063)', () => {
  it('retires after a confirmation that listings will be paused', async () => {
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Retire' }));

    const confirm = screen.getByRole('alertdialog', { name: 'Retire this product?' });
    expect(within(confirm).getByText(/Active vendor listings will be paused/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Retire product' }));

    await waitFor(() => expect(calls).toEqual(['retire']));
    expect(await screen.findByText('Retired')).toBeInTheDocument();
  });

  it('offers Restore on a retired product', async () => {
    current = { ...current, status: 'deprecated' };
    renderModal();

    const restore = await screen.findByRole('button', { name: 'Restore' });
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();

    await userEvent.click(restore);

    await waitFor(() => expect(calls).toEqual(['restore']));
    expect(await screen.findByRole('button', { name: 'Retire' })).toBeInTheDocument();
  });

  it('offers Delete only on a draft', async () => {
    renderModal();
    await screen.findByRole('button', { name: 'Retire' });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('deletes a draft and closes', async () => {
    current = { ...current, status: 'draft' };
    const onClose = renderModal();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Delete this draft?' })).getByRole('button', {
        name: 'Delete draft',
      }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(['delete']);
  });

  it('shows the server’s "retire it instead" when a delete is refused', async () => {
    current = { ...current, status: 'draft' };
    deleteRefused = true;
    const onClose = renderModal();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Delete this draft?' })).getByRole('button', {
        name: 'Delete draft',
      }),
    );

    expect(await screen.findByText(/Retire it instead/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('merges into a product of the same category and reports the paused listings', async () => {
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Merge into…' }));
    const dialog = screen.getByRole('dialog', { name: `Merge ${current.productCode}` });
    expect(
      within(dialog).getByText(/a vendor who lists both keeps the listing/i),
    ).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Find the product to keep'), 'switch');
    const option = await within(dialog).findByRole('option', {
      name: 'GA-0000800 · Modular switch 6A (original)',
    });
    expect(within(dialog).getAllByRole('option')).toHaveLength(1);
    const url = productListUrls.at(-1)!;
    expect(url.searchParams.get('categoryId')).toBe(LEAF_ID);
    expect(url.searchParams.get('search')).toBe('switch');

    await userEvent.click(option);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

    expect(await within(dialog).findByText('Moved 1 listing.')).toBeInTheDocument();
    expect(within(dialog).getByText('Paused: Stone Mart (already lists it)')).toBeInTheDocument();
    expect(calls).toEqual([`merge {"intoProductId":"${KEEPER.id}"}`]);
  });
});
