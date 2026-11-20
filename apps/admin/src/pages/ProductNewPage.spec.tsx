import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { brand, page } from '@/test/brandFixtures';
import { attribute, categoryTree, LEAF_ID, productDetail, readiness } from '@/test/catalogFixtures';
import { server } from '@/test/server';

import { ProductNewPage } from './ProductNewPage';

const HAVELLS = brand();
const CREATED = productDetail();
let created: unknown[];
let ready: ReturnType<typeof readiness>;
let published: string[];

beforeEach(() => {
  created = [];
  published = [];
  ready = readiness({ image: false });
  server.use(
    http.get('/api/admin/catalog/categories', () =>
      HttpResponse.json({ success: true, data: categoryTree() }),
    ),
    http.get('/api/admin/catalog/categories/:id/attributes', () =>
      HttpResponse.json({
        success: true,
        data: {
          category: { id: LEAF_ID, path: 'electrical/switches', name: 'Switches' },
          attributes: [
            attribute(),
            attribute({
              id: 'a2',
              code: 'warranty',
              name: 'Warranty',
              dataType: 'text',
              isVariantDefining: false,
              options: [],
            }),
          ],
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
      HttpResponse.json({ success: true, data: page([HAVELLS]) }),
    ),
    http.get('/api/admin/brands/:id', () => HttpResponse.json({ success: true, data: HAVELLS })),
    http.post('/api/admin/catalog/products', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      created.push(body);
      if (body.mfrPartNumber === 'DUP-1') {
        return HttpResponse.json(
          {
            success: false,
            message: 'a product with this brand and MPN already exists',
            statusCode: 400,
          },
          { status: 400 },
        );
      }
      return HttpResponse.json({ success: true, data: CREATED }, { status: 201 });
    }),
    http.get(`/api/admin/catalog/products/${CREATED.id}`, () =>
      HttpResponse.json({ success: true, data: CREATED }),
    ),
    http.get(`/api/admin/catalog/products/${CREATED.id}/readiness`, () =>
      HttpResponse.json({ success: true, data: ready }),
    ),
    http.get(`/api/admin/catalog/products/${CREATED.id}/media`, () =>
      HttpResponse.json({ success: true, data: [] }),
    ),
    http.patch(`/api/admin/catalog/products/${CREATED.id}/publish`, () => {
      published.push(CREATED.id);
      return HttpResponse.json({ success: true, data: { ...CREATED, status: 'live' } });
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
        <ProductNewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function chooseCategory() {
  renderPage();
  const select = await screen.findByLabelText('Category');
  await screen.findByRole('option', { name: 'electrical/switches' });
  await userEvent.selectOptions(select, LEAF_ID);
}

async function fillValid(mpn = 'SW-6A') {
  await chooseCategory();
  await userEvent.type(screen.getByLabelText('Name *'), 'Modular switch 6A');
  await userEvent.click(await screen.findByRole('option', { name: 'Havells' }));
  await userEvent.type(screen.getByLabelText('Part number (MPN)'), mpn);
  await userEvent.selectOptions(screen.getByLabelText('Finish *'), 'Matte');
}

describe('ProductNewPage add-product form (decision 0063)', () => {
  it('shows a field per attribute of the chosen category, required ones starred', async () => {
    await chooseCategory();

    const finish = await screen.findByLabelText('Finish *');
    expect(
      within(finish)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose…', 'Matte', 'Gloss']);
    expect(screen.getByLabelText('Warranty')).toHaveAttribute('type', 'text');
  });

  it('offers the brand picker with Add brand', async () => {
    await chooseCategory();
    expect(await screen.findByRole('option', { name: 'Havells' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add brand' })).toBeInTheDocument();
  });

  it('pre-fills the HSN code and GST rate from the category default', async () => {
    await chooseCategory();

    expect(await screen.findByText('HSN code: 8536 (Switches and sockets)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('GST rate (%) *')).toHaveValue(18));
  });

  it('checks the name and country of origin before sending', async () => {
    await chooseCategory();
    await userEvent.clear(screen.getByLabelText('Country of origin *'));

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Country of origin is required')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('creates the draft, then shows its images and readiness checklist', async () => {
    await fillValid();

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await screen.findByRole('region', { name: 'Images' });
    expect(created).toEqual([
      {
        categoryId: LEAF_ID,
        name: 'Modular switch 6A',
        brandId: HAVELLS.id,
        mfrPartNumber: 'SW-6A',
        hsnCode: '8536',
        gstRate: 18,
        countryOfOrigin: 'India',
        attributeValues: [{ code: 'finish', value: 'Matte' }],
      },
    ]);
    const checklist = await screen.findByRole('list', { name: 'Readiness' });
    expect(within(checklist).getByText(/needs at least one image/)).toBeInTheDocument();
  });

  it('keeps Publish disabled while a blocking check fails, and publishes once ready', async () => {
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('list', { name: 'Readiness' });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(published).toEqual([]);
  });

  it('enables Publish when nothing blocking is missing', async () => {
    ready = readiness({ image: true, hsn_code: false });
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    const publish = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(publish).toBeEnabled());
    await userEvent.click(publish);

    await waitFor(() => expect(published).toEqual([CREATED.id]));
  });

  it('shows a duplicate brand + part number error inline and stays on the form', async () => {
    await fillValid('DUP-1');

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText('a product with this brand and MPN already exists'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Images' })).not.toBeInTheDocument();
  });
});
