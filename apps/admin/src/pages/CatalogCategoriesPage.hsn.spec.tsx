import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { categoryTree, LEAF_ID } from '@/test/catalogFixtures';
import { server } from '@/test/server';

import { CatalogCategoriesPage } from './CatalogCategoriesPage';

let tree: ReturnType<typeof categoryTree>;
let patches: { id: string; body: unknown }[];

beforeEach(() => {
  tree = categoryTree({ parentHsn: null });
  patches = [];
  server.use(
    http.get('/api/admin/catalog/categories', () =>
      HttpResponse.json({ success: true, data: tree }),
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
    http.get('/api/admin/catalog/hsn-codes', () =>
      HttpResponse.json({
        success: true,
        data: [{ code: '8536', description: 'Switches and sockets', gstRate: 18 }],
      }),
    ),
    http.patch('/api/admin/catalog/categories/:id', async ({ params, request }) => {
      const body = (await request.json()) as { hsnCodeDefault: string | null };
      patches.push({ id: String(params.id), body });
      tree = categoryTree({ parentHsn: null, leafHsn: body.hsnCodeDefault });
      return HttpResponse.json({ success: true, data: { id: params.id, ...body } });
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
        <CatalogCategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectLeaf() {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Expand Electrical' }));
  await userEvent.click(screen.getByRole('button', { name: /Switches/ }));
  return screen.findByRole('region', { name: 'Default HSN code' });
}

describe('CatalogCategoriesPage default HSN code (decision 0063)', () => {
  it('shows a leaf category’s default HSN code, or that it has none', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Expand Electrical' }));

    expect(screen.getByRole('button', { name: /Switches/ })).toHaveTextContent('No default HSN');
  });

  it('sets a default through the HSN picker', async () => {
    const section = await selectLeaf();
    expect(
      within(section).getByText('No default. New products start without an HSN code.'),
    ).toBeInTheDocument();

    await userEvent.click(within(section).getByRole('button', { name: 'Set default' }));
    await userEvent.click(
      await within(section).findByRole('option', { name: '8536 · Switches and sockets · 18%' }),
    );

    await waitFor(() =>
      expect(patches).toEqual([{ id: LEAF_ID, body: { hsnCodeDefault: '8536' } }]),
    );
    expect(await within(section).findByText('8536 (set on this category)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switches/ })).toHaveTextContent('HSN 8536');
  });

  it('clears a default', async () => {
    tree = categoryTree({ parentHsn: null, leafHsn: '8536' });
    const section = await selectLeaf();

    await userEvent.click(within(section).getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(patches).toEqual([{ id: LEAF_ID, body: { hsnCodeDefault: null } }]));
  });

  it('says when the default comes from a parent group', async () => {
    tree = categoryTree({ parentHsn: '8536', leafHsn: null });
    const section = await selectLeaf();

    expect(within(section).getByText('8536 (from Electrical)')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });
});
