import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BrandDto } from '@golden-abode/types';

import { brand, page } from '@/test/brandFixtures';
import { server } from '@/test/server';

import { BrandsPage } from './BrandsPage';

const BASE = '/api/admin/brands';
const KEEPER = brand({ id: 'b2222222-2222-4222-8222-222222222222', name: 'Keeper' });

let brands: BrandDto[];
let listUrls: URL[];

function useHandlers() {
  listUrls = [];
  server.use(
    http.get(BASE, ({ request }) => {
      const url = new URL(request.url);
      listUrls.push(url);
      const isActive = url.searchParams.get('isActive');
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const items = brands.filter(
        (b) =>
          (isActive === null || String(b.isActive) === isActive) &&
          b.name.toLowerCase().includes(search),
      );
      return HttpResponse.json({ success: true, data: page(items) });
    }),
    http.get(`${BASE}/:id`, ({ params }) =>
      HttpResponse.json({
        success: true,
        data: [...brands, KEEPER].find((b) => b.id === params.id),
      }),
    ),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BrandsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BrandsPage list', () => {
  beforeEach(() => {
    brands = [
      brand(),
      brand({
        id: 'b3333333-3333-4333-8333-333333333333',
        name: 'Polycab',
        manufacturerName: 'Polycab India Ltd',
        productCount: 3,
      }),
    ];
    useHandlers();
  });

  it('shows each active brand with manufacturer, product count and status', async () => {
    renderPage();

    const row = (await screen.findByText('Havells')).closest('tr')!;
    expect(within(row).getByText('Havells India Ltd')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Polycab')).toBeInTheDocument();
    expect(listUrls[0].searchParams.get('isActive')).toBe('true');
  });

  it('filters by name through the search parameter', async () => {
    renderPage();
    await screen.findByText('Havells');

    await userEvent.type(screen.getByLabelText('Search brands'), 'poly');

    await waitFor(() => expect(screen.queryByText('Havells')).not.toBeInTheDocument());
    expect(screen.getByText('Polycab')).toBeInTheDocument();
    expect(listUrls.at(-1)?.searchParams.get('search')).toBe('poly');
  });

  it('shows deactivated brands, and where a merged one went, with the Inactive toggle', async () => {
    brands.push(
      brand({
        id: 'b4444444-4444-4444-8444-444444444444',
        name: 'Old Spelling',
        isActive: false,
        productCount: 0,
      }),
      brand({
        id: 'b5555555-5555-4555-8555-555555555555',
        name: 'Duplicate Co',
        isActive: false,
        mergedIntoId: KEEPER.id,
        productCount: 0,
      }),
    );
    renderPage();
    await screen.findByText('Havells');
    expect(screen.queryByText('Old Spelling')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Show inactive brands' }));

    const row = (await screen.findByText('Old Spelling')).closest('tr')!;
    expect(within(row).getByText('Inactive')).toBeInTheDocument();
    const merged = screen.getByText('Duplicate Co').closest('tr')!;
    expect(await within(merged).findByText('Merged into Keeper')).toBeInTheDocument();
    expect(listUrls.at(-1)?.searchParams.get('isActive')).toBe('false');
  });
});
