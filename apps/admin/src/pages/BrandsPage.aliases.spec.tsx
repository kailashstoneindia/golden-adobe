import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandDto } from '@golden-abode/types';

import { brand, page } from '@/test/brandFixtures';
import { server } from '@/test/server';

const uploadToS3 = vi.hoisted(() => vi.fn());
vi.mock('@/services/api/mediaService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api/mediaService')>()),
  uploadToS3,
}));

import { BrandsPage } from './BrandsPage';

const BASE = '/api/admin/brands';
const ALIAS_ID = 'a1111111-1111-4111-8111-111111111111';
let current: BrandDto;
let calls: string[];

function useHandlers() {
  calls = [];
  current = brand({ aliases: [{ id: ALIAS_ID, alias: 'havells india' }] });
  const at = (suffix: string) => `${BASE}/${current.id}${suffix}`;
  server.use(
    http.get(BASE, () => HttpResponse.json({ success: true, data: page([current]) })),
    http.get(`${BASE}/:id`, () => HttpResponse.json({ success: true, data: current })),
    http.delete(at('/aliases/:aliasId'), ({ params }) => {
      calls.push(`delete ${params.aliasId}`);
      current = { ...current, aliases: current.aliases.filter((a) => a.id !== params.aliasId) };
      return HttpResponse.json({ success: true, data: current });
    }),
    http.post(at('/aliases'), async ({ request }) => {
      const { alias } = (await request.json()) as { alias: string };
      calls.push(`add ${alias}`);
      if (alias === 'Polycab') {
        return HttpResponse.json(
          {
            success: false,
            message: 'alias "polycab" already belongs to brand "Polycab"',
            statusCode: 409,
          },
          { status: 409 },
        );
      }
      current = {
        ...current,
        aliases: [...current.aliases, { id: 'a2', alias: alias.toLowerCase() }],
      };
      return HttpResponse.json({ success: true, data: current }, { status: 201 });
    }),
    http.post(at('/logo-upload-url'), async ({ request }) => {
      calls.push(`ticket ${JSON.stringify(await request.json())}`);
      return HttpResponse.json(
        {
          success: true,
          data: {
            url: 'https://s3.test/media',
            fields: { key: 'k' },
            key: 'variants/brands/x/logo-1.png',
          },
        },
        { status: 201 },
      );
    }),
    http.post(at('/logo/confirm'), async ({ request }) => {
      calls.push(`confirm ${JSON.stringify(await request.json())}`);
      current = { ...current, logoUrl: 'https://cdn.test/variants/brands/x/logo-1.png' };
      return HttpResponse.json({ success: true, data: current }, { status: 201 });
    }),
  );
}

async function openDetail() {
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
  await userEvent.click(await screen.findByText('Havells'));
  return screen.findByRole('dialog', { name: 'Havells' });
}

describe('BrandsPage aliases and logo', () => {
  beforeEach(() => {
    useHandlers();
    uploadToS3.mockReset();
    uploadToS3.mockImplementation(async () => {
      calls.push('s3');
    });
  });

  it('lists aliases and removes one', async () => {
    const detail = await openDetail();
    expect(within(detail).getByText('havells india')).toBeInTheDocument();

    await userEvent.click(
      within(detail).getByRole('button', { name: 'Remove alias havells india' }),
    );

    await waitFor(() =>
      expect(within(detail).queryByText('havells india')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([`delete ${ALIAS_ID}`]);
  });

  it('adds an alias and shows it', async () => {
    const detail = await openDetail();

    await userEvent.type(within(detail).getByLabelText('New alias'), 'H.I.L');
    await userEvent.click(within(detail).getByRole('button', { name: 'Add alias' }));

    expect(await within(detail).findByText('h.i.l')).toBeInTheDocument();
    expect(calls).toEqual(['add H.I.L']);
    expect(within(detail).getByLabelText('New alias')).toHaveValue('');
  });

  it('shows the server message when the alias belongs to another brand', async () => {
    const detail = await openDetail();

    await userEvent.type(within(detail).getByLabelText('New alias'), 'Polycab');
    await userEvent.click(within(detail).getByRole('button', { name: 'Add alias' }));

    expect(
      await within(detail).findByText('alias "polycab" already belongs to brand "Polycab"'),
    ).toBeInTheDocument();
  });

  it('uploads a logo: ticket, file to storage, confirm, then shows it', async () => {
    const detail = await openDetail();
    const file = new File([new Uint8Array(512)], 'logo.png', { type: 'image/png' });

    await userEvent.upload(within(detail).getByLabelText('Upload logo'), file);

    const image = await within(detail).findByRole('img', { name: 'Havells logo' });
    expect(image).toHaveAttribute('src', 'https://cdn.test/variants/brands/x/logo-1.png');
    expect(calls).toEqual([
      'ticket {"contentType":"image/png"}',
      's3',
      'confirm {"key":"variants/brands/x/logo-1.png"}',
    ]);
    expect(uploadToS3).toHaveBeenCalledWith(
      { url: 'https://s3.test/media', fields: { key: 'k' } },
      file,
    );
  });

  it('refuses a logo that is not JPEG, PNG or WebP without calling the API', async () => {
    const detail = await openDetail();
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });

    await userEvent
      .setup({ applyAccept: false })
      .upload(within(detail).getByLabelText('Upload logo'), file);

    expect(await within(detail).findByText('Use a JPEG, PNG or WebP image')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
