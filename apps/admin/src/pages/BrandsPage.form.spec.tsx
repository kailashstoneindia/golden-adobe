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
const HAVELLS = brand();

let requests: { method: string; path: string; body: unknown }[];
let current: BrandDto;

function useHandlers() {
  requests = [];
  current = HAVELLS;
  const record = async (request: Request) => {
    const body = request.method === 'GET' ? undefined : await request.json().catch(() => undefined);
    requests.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body as Record<string, unknown> | undefined;
  };
  server.use(
    http.get(BASE, () => HttpResponse.json({ success: true, data: page([current]) })),
    http.get(`${BASE}/:id`, () => HttpResponse.json({ success: true, data: current })),
    http.post(BASE, async ({ request }) => {
      const body = await record(request);
      if (body?.name === 'HAVELLS') {
        return HttpResponse.json(
          { success: false, message: 'brand "Havells" already exists', statusCode: 409 },
          { status: 409 },
        );
      }
      return HttpResponse.json({ success: true, data: brand({ ...body, id: 'new' }) });
    }),
    http.patch(`${BASE}/:id`, async ({ request }) => {
      const body = await record(request);
      current = { ...current, ...body };
      return HttpResponse.json({ success: true, data: current });
    }),
    http.patch(`${BASE}/:id/active`, async ({ request }) => {
      const body = await record(request);
      current = { ...current, isActive: Boolean(body?.isActive) };
      return HttpResponse.json({ success: true, data: current });
    }),
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

const fill = async (dialog: HTMLElement, label: string, value: string) => {
  const input = within(dialog).getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
};

async function openAddForm() {
  renderPage();
  await screen.findByText('Havells');
  await userEvent.click(screen.getByRole('button', { name: 'Add brand' }));
  return screen.getByRole('dialog', { name: 'Add brand' });
}

describe('BrandsPage add and edit', () => {
  beforeEach(useHandlers);

  it('shows an inline error for every missing required field and sends nothing', async () => {
    const dialog = await openAddForm();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save brand' }));

    for (const message of [
      'Name is required',
      'Manufacturer name is required',
      'Manufacturer address is required',
      'Consumer care email is required',
      'Consumer care phone is required',
    ]) {
      expect(within(dialog).getByText(message)).toBeInTheDocument();
    }
    expect(requests).toEqual([]);
  });

  it('checks the email and phone shape before sending', async () => {
    const dialog = await openAddForm();
    await fill(dialog, 'Consumer care email', 'not-an-email');
    await fill(dialog, 'Consumer care phone', '1800-CALL');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save brand' }));

    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Use 7 to 20 digits, spaces, brackets or dashes, optionally starting with +',
      ),
    ).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  async function fillValid(dialog: HTMLElement, name: string) {
    await fill(dialog, 'Name', name);
    await fill(dialog, 'Manufacturer name', 'Zorvex Electric Pvt Ltd');
    await fill(dialog, 'Manufacturer address', '12 Industrial Area, Noida');
    await fill(dialog, 'Consumer care email', 'care@zorvex.test');
    await fill(dialog, 'Consumer care phone', '+91 1800 200 300');
  }

  it('creates a brand and closes the form', async () => {
    const dialog = await openAddForm();
    await fillValid(dialog, 'Zorvex');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save brand' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([
      {
        method: 'POST',
        path: BASE,
        body: {
          name: 'Zorvex',
          manufacturerName: 'Zorvex Electric Pvt Ltd',
          manufacturerAddress: '12 Industrial Area, Noida',
          consumerCareEmail: 'care@zorvex.test',
          consumerCarePhone: '+91 1800 200 300',
        },
      },
    ]);
  });

  it('shows the server message for a duplicate brand and keeps the form open', async () => {
    const dialog = await openAddForm();
    await fillValid(dialog, 'HAVELLS');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save brand' }));

    expect(await within(dialog).findByText('brand "Havells" already exists')).toBeInTheDocument();
  });

  async function openDetail() {
    renderPage();
    await userEvent.click(await screen.findByText('Havells'));
    return screen.findByRole('dialog', { name: 'Havells' });
  }

  it('edits a brand from its detail view, pre-filled, sending only what changed', async () => {
    const detail = await openDetail();
    await userEvent.click(within(detail).getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: 'Edit brand' });
    expect(within(form).getByLabelText('Manufacturer name')).toHaveValue('Havells India Ltd');

    await fill(form, 'Consumer care email', 'help@havells.test');
    await userEvent.click(within(form).getByRole('button', { name: 'Save brand' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit brand' })).not.toBeInTheDocument(),
    );
    expect(requests).toEqual([
      {
        method: 'PATCH',
        path: `${BASE}/${HAVELLS.id}`,
        body: { consumerCareEmail: 'help@havells.test' },
      },
    ]);
  });

  it('deactivates a brand with the Active switch', async () => {
    const detail = await openDetail();

    await userEvent.click(within(detail).getByRole('checkbox', { name: 'Active' }));

    await waitFor(() =>
      expect(requests).toEqual([
        { method: 'PATCH', path: `${BASE}/${HAVELLS.id}/active`, body: { isActive: false } },
      ]),
    );
    await waitFor(() =>
      expect(within(detail).getByRole('checkbox', { name: 'Active' })).not.toBeChecked(),
    );
  });
});
