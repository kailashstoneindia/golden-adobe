import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { brand, page } from '@/test/brandFixtures';
import { attribute, categoryTree, LEAF_ID, productDetail, readiness } from '@/test/catalogFixtures';
import { server } from '@/test/server';
import type { ProductDetail } from '@/types/catalog.types';

import { ProductDetailModal } from './ProductDetailModal';

const HAVELLS = brand();
const POLYCAB = brand({ id: 'b3333333-3333-4333-8333-333333333333', name: 'Polycab' });
let current: ProductDetail;
let patches: unknown[];
let ready: ReturnType<typeof readiness>;

beforeEach(() => {
  current = productDetail({ brandId: HAVELLS.id });
  patches = [];
  ready = readiness({ image: false });
  const base = `/api/admin/catalog/products/${current.id}`;
  server.use(
    http.get(base, () => HttpResponse.json({ success: true, data: current })),
    http.get(`${base}/media`, () => HttpResponse.json({ success: true, data: [] })),
    http.get(`${base}/readiness`, () => HttpResponse.json({ success: true, data: ready })),
    http.patch(base, async ({ request }) => {
      const body = (await request.json()) as Partial<ProductDetail>;
      patches.push(body);
      current = { ...current, ...body };
      return HttpResponse.json({ success: true, data: current });
    }),
    http.get('/api/admin/catalog/categories', () =>
      HttpResponse.json({ success: true, data: categoryTree() }),
    ),
    http.get('/api/admin/catalog/categories/:id/attributes', () =>
      HttpResponse.json({
        success: true,
        data: {
          category: { id: LEAF_ID, path: 'electrical/switches', name: 'Switches' },
          attributes: [attribute()],
        },
      }),
    ),
    http.get('/api/admin/catalog/hsn-codes', () =>
      HttpResponse.json({
        success: true,
        data: [{ code: '8536', description: 'Switches and sockets', gstRate: 18 }],
      }),
    ),
    http.get('/api/admin/brands', () =>
      HttpResponse.json({ success: true, data: page([HAVELLS, POLYCAB]) }),
    ),
    http.get('/api/admin/brands/:id', ({ params }) =>
      HttpResponse.json({
        success: true,
        data: [HAVELLS, POLYCAB].find((b) => b.id === params.id),
      }),
    ),
  );
});

function renderModal(onPublish = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProductDetailModal
        productId={current.id}
        isSubmitting={false}
        onClose={() => undefined}
        onPublish={onPublish}
        onUnpublish={() => undefined}
      />
    </QueryClientProvider>,
  );
  return onPublish;
}

async function openEdit() {
  renderModal();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  return screen.findByRole('form', { name: 'Edit product' });
}

describe('ProductDetailModal edit and readiness (decision 0063)', () => {
  it('opens the form pre-filled, with the category shown but not editable', async () => {
    const form = await openEdit();

    expect(within(form).getByLabelText('Name *')).toHaveValue('Modular switch 6A');
    expect(within(form).getByLabelText('Part number (MPN)')).toHaveValue('SW-6A');
    expect(await within(form).findByText('Selected: Havells')).toBeInTheDocument();
    expect(
      within(form).getByText('Category: electrical/switches (cannot be changed)'),
    ).toBeInTheDocument();
    expect(within(form).queryByLabelText('Category')).not.toBeInTheDocument();
    expect(await within(form).findByLabelText('Finish *')).toHaveValue('Matte');
  });

  it('saves only what changed: a new part number and a new brand', async () => {
    const form = await openEdit();
    const mpn = within(form).getByLabelText('Part number (MPN)');
    await userEvent.clear(mpn);
    await userEvent.type(mpn, 'SW-6A-NEW');
    await userEvent.click(await within(form).findByRole('option', { name: 'Polycab' }));

    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(patches).toEqual([{ mfrPartNumber: 'SW-6A-NEW', brandId: POLYCAB.id }]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Edit product' })).not.toBeInTheDocument(),
    );
  });

  it('shows the readiness checklist for a draft and keeps Publish disabled while blocked', async () => {
    const onPublish = renderModal();

    const checklist = await screen.findByRole('list', { name: 'Readiness' });
    expect(within(checklist).getByText(/needs at least one image/)).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('enables Publish once nothing blocking is missing', async () => {
    ready = readiness({ image: true });
    const onPublish = renderModal();

    const publish = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(publish).toBeEnabled());
    await userEvent.click(publish);
    expect(onPublish).toHaveBeenCalledWith(current.id);
  });
});
