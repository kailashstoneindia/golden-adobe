import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandDto } from '@golden-abode/types';

import { brand, page } from '@/test/brandFixtures';
import { server } from '@/test/server';

import { BrandPicker } from './BrandPicker';

const HAVELLS = brand();
const POLYCAB = brand({ id: 'b3333333-3333-4333-8333-333333333333', name: 'Polycab' });
const SLEEPY = brand({
  id: 'b4444444-4444-4444-8444-444444444444',
  name: 'Sleepy',
  isActive: false,
});

let all: BrandDto[];
let listUrls: URL[];

beforeEach(() => {
  all = [HAVELLS, POLYCAB, SLEEPY];
  listUrls = [];
  server.use(
    http.get('/api/admin/brands', ({ request }) => {
      const url = new URL(request.url);
      listUrls.push(url);
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const isActive = url.searchParams.get('isActive');
      const items = all.filter(
        (b) =>
          (isActive === null || String(b.isActive) === isActive) &&
          b.name.toLowerCase().includes(search),
      );
      return HttpResponse.json({ success: true, data: page(items) });
    }),
    http.get('/api/admin/brands/:id', ({ params }) =>
      HttpResponse.json({ success: true, data: all.find((b) => b.id === params.id) }),
    ),
    http.post('/api/admin/brands', async ({ request }) => {
      const created = brand({
        ...((await request.json()) as object),
        id: 'b9999999-9999-4999-8999-999999999999',
      });
      all.push(created);
      return HttpResponse.json({ success: true, data: created }, { status: 201 });
    }),
  );
});

function Harness({
  onChange,
  allowCreate,
  excludeId,
}: {
  onChange: (id: string | null) => void;
  allowCreate?: boolean;
  excludeId?: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <BrandPicker
      value={value}
      allowCreate={allowCreate}
      excludeId={excludeId}
      onChange={(id) => {
        setValue(id);
        onChange(id);
      }}
    />
  );
}

function renderPicker(props: { allowCreate?: boolean; excludeId?: string } = {}) {
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Harness onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return onChange;
}

describe('BrandPicker (decision 0063)', () => {
  it('offers only active brands and selects one', async () => {
    const onChange = renderPicker();

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Havells', 'Polycab']);
    expect(listUrls[0].searchParams.get('isActive')).toBe('true');

    await userEvent.click(screen.getByRole('option', { name: 'Polycab' }));

    expect(onChange).toHaveBeenCalledWith(POLYCAB.id);
    expect(await screen.findByText('Selected: Polycab')).toBeInTheDocument();
  });

  it('filters as you type', async () => {
    renderPicker();
    await screen.findAllByRole('option');

    await userEvent.type(screen.getByLabelText('Find a brand'), 'hav');

    await waitFor(() =>
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Havells']),
    );
    expect(listUrls.at(-1)?.searchParams.get('search')).toBe('hav');
  });

  it('leaves out the excluded brand', async () => {
    renderPicker({ excludeId: HAVELLS.id });

    await waitFor(() =>
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Polycab']),
    );
  });

  it('with allowCreate, adds a brand and selects it', async () => {
    const onChange = renderPicker({ allowCreate: true });
    await screen.findAllByRole('option');

    await userEvent.click(screen.getByRole('button', { name: 'Add brand' }));
    const form = screen.getByRole('dialog', { name: 'Add brand' });
    for (const [label, value] of [
      ['Name', 'Zorvex'],
      ['Manufacturer name', 'Zorvex Electric'],
      ['Manufacturer address', 'Noida'],
      ['Consumer care email', 'care@zorvex.test'],
      ['Consumer care phone', '+91 1800 200 300'],
    ]) {
      await userEvent.type(within(form).getByLabelText(label), value);
    }
    await userEvent.click(within(form).getByRole('button', { name: 'Save brand' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('b9999999-9999-4999-8999-999999999999'),
    );
    expect(await screen.findByText('Selected: Zorvex')).toBeInTheDocument();
  });

  it('without allowCreate, offers no Add brand button', async () => {
    renderPicker();
    await screen.findAllByRole('option');
    expect(screen.queryByRole('button', { name: 'Add brand' })).not.toBeInTheDocument();
  });
});
