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
const DUPLICATE = brand({ name: 'Havels', productCount: 7 });
const KEEPER = brand({ id: 'b2222222-2222-4222-8222-222222222222', name: 'Keeper' });

let brands: BrandDto[];
let merges: unknown[];
let clash: boolean;

beforeEach(() => {
  brands = [DUPLICATE, KEEPER];
  merges = [];
  clash = false;
  server.use(
    http.get(BASE, ({ request }) => {
      const search = new URL(request.url).searchParams.get('search')?.toLowerCase() ?? '';
      return HttpResponse.json({
        success: true,
        data: page(brands.filter((b) => b.isActive && b.name.toLowerCase().includes(search))),
      });
    }),
    http.get(`${BASE}/:id`, ({ params }) =>
      HttpResponse.json({ success: true, data: brands.find((b) => b.id === params.id) }),
    ),
    http.post(`${BASE}/:id/merge`, async ({ request }) => {
      merges.push(await request.json());
      if (clash) {
        return HttpResponse.json(
          {
            success: false,
            message:
              'both brands have part numbers MCB-10, MCB-16. Merge or fix those products first',
            statusCode: 409,
          },
          { status: 409 },
        );
      }
      brands = brands.map((b) =>
        b.id === DUPLICATE.id ? { ...b, isActive: false, mergedIntoId: KEEPER.id } : b,
      );
      return HttpResponse.json(
        { success: true, data: { movedProducts: 7, aliasesAdded: 1 } },
        { status: 201 },
      );
    }),
  );
});

async function openMerge() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BrandsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByText('Havels'));
  const detail = await screen.findByRole('dialog', { name: 'Havels' });
  await userEvent.click(within(detail).getByRole('button', { name: 'Merge into…' }));
  return screen.getByRole('dialog', { name: 'Merge Havels' });
}

describe('BrandsPage merge', () => {
  it('warns how many products move, offers other brands only, and merges', async () => {
    const dialog = await openMerge();

    expect(
      within(dialog).getByText('This moves 7 products and cannot be undone from the screen.'),
    ).toBeInTheDocument();
    const options = await within(dialog).findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Keeper']);
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('option', { name: 'Keeper' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Merge Havels' })).not.toBeInTheDocument(),
    );
    expect(merges).toEqual([{ intoBrandId: KEEPER.id }]);
  });

  it('lists the clashing part numbers when the merge is refused', async () => {
    clash = true;
    const dialog = await openMerge();
    await userEvent.click(await within(dialog).findByRole('option', { name: 'Keeper' }));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

    expect(
      await within(dialog).findByText(
        'both brands have part numbers MCB-10, MCB-16. Merge or fix those products first',
      ),
    ).toBeInTheDocument();
  });
});
