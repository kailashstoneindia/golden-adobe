import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mediaService } from '@/services/api/mediaService';
import { brand, page } from '@/test/brandFixtures';
import { server } from '@/test/server';

import { BulkImageDialog } from './BulkImageDialog';

const HAVELLS = brand();
let lookups: { keys: string[]; brandId?: string }[];

const match = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  productId: `p-${key}`,
  matchedBy: 'code',
  hasPrimary: false,
  status: 'draft',
  productName: `Product ${key}`,
  productCode: key,
  ...over,
});

beforeEach(() => {
  lookups = [];
  server.use(
    http.post('/api/admin/catalog/products/lookup-codes', async ({ request }) => {
      const body = (await request.json()) as { keys: string[]; brandId?: string };
      lookups.push(body);
      return HttpResponse.json({
        success: true,
        data: {
          items: [
            match('GA-0000101'),
            match('MCB-10', { matchedBy: 'mpn', hasPrimary: true, productCode: 'GA-0000102' }),
            match('OLD-1', { status: 'deprecated' }),
          ],
          ambiguousKeys: ['SHARED'],
        },
      });
    }),
    http.get('/api/admin/brands', () =>
      HttpResponse.json({ success: true, data: page([HAVELLS]) }),
    ),
    http.get('/api/admin/brands/:id', () => HttpResponse.json({ success: true, data: HAVELLS })),
  );
});

afterEach(() => vi.restoreAllMocks());

const image = (name: string, type = 'image/jpeg') => new File([new Uint8Array(64)], name, { type });
const FILES = [
  image('GA-0000101.jpg'),
  image('MCB-10_2.png', 'image/png'),
  image('unknown.jpg'),
  image('SHARED.jpg'),
  image('OLD-1.webp', 'image/webp'),
];

function renderDialog() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BulkImageDialog onClose={() => undefined} />
    </QueryClientProvider>,
  );
  return screen.getByRole('dialog', { name: 'Upload images in bulk' });
}

async function chooseFiles(dialog: HTMLElement, files = FILES) {
  await userEvent
    .setup({ applyAccept: false })
    .upload(within(dialog).getByLabelText('Image files'), files);
  return within(dialog).findByRole('table', { name: 'Files' });
}

const rowFor = (table: HTMLElement, file: string) =>
  within(table).getByText(file).closest('tr') as HTMLElement;

describe('BulkImageDialog (decision 0063)', () => {
  it('looks up every candidate key and previews what each file will do', async () => {
    const dialog = renderDialog();
    const table = await chooseFiles(dialog);

    expect(lookups[0].keys.sort()).toEqual(
      ['GA-0000101', 'MCB-10_2', 'MCB-10', 'unknown', 'SHARED', 'OLD-1'].sort(),
    );
    expect(rowFor(table, 'GA-0000101.jpg')).toHaveTextContent('Product GA-0000101');
    expect(rowFor(table, 'GA-0000101.jpg')).toHaveTextContent('Will become primary');
    expect(rowFor(table, 'MCB-10_2.png')).toHaveTextContent('Product MCB-10');
    expect(rowFor(table, 'MCB-10_2.png')).not.toHaveTextContent('Will become primary');
    expect(rowFor(table, 'unknown.jpg')).toHaveTextContent('No match');
    expect(rowFor(table, 'SHARED.jpg')).toHaveTextContent('Matches several brands');
    expect(rowFor(table, 'OLD-1.webp')).toHaveTextContent('Retired product, skipped');
  });

  it('sends the chosen brand with the lookup', async () => {
    const dialog = renderDialog();
    await userEvent.click(await within(dialog).findByRole('option', { name: 'Havells' }));

    await chooseFiles(dialog);

    expect(lookups.at(-1)).toEqual(expect.objectContaining({ brandId: HAVELLS.id }));
  });

  it('uploads only the matched files, reports each, and sums up', async () => {
    const upload = vi.spyOn(mediaService, 'uploadImage').mockImplementation(async (productId) => {
      if (productId === 'p-MCB-10') throw new Error('The upload was refused');
      return {} as never;
    });
    const dialog = renderDialog();
    const table = await chooseFiles(dialog);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload 2 images' }));

    expect(await within(dialog).findByText('1 uploaded, 3 skipped, 1 failed')).toBeInTheDocument();
    expect(
      upload.mock.calls.map(([productId, file]) => [productId, (file as File).name]).sort(),
    ).toEqual([
      ['p-GA-0000101', 'GA-0000101.jpg'],
      ['p-MCB-10', 'MCB-10_2.png'],
    ]);
    expect(rowFor(table, 'GA-0000101.jpg')).toHaveTextContent('Uploaded');
    expect(rowFor(table, 'MCB-10_2.png')).toHaveTextContent('The upload was refused');
  });

  it('never runs more than 4 uploads at once', async () => {
    let running = 0;
    let peak = 0;
    vi.spyOn(mediaService, 'uploadImage').mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      return {} as never;
    });
    server.use(
      http.post('/api/admin/catalog/products/lookup-codes', async ({ request }) => {
        const { keys } = (await request.json()) as { keys: string[] };
        return HttpResponse.json({
          success: true,
          data: { items: keys.map((k) => match(k)), ambiguousKeys: [] },
        });
      }),
    );
    const dialog = renderDialog();
    await chooseFiles(
      dialog,
      Array.from({ length: 9 }, (_, i) => image(`GA-000020${i}.jpg`)),
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload 9 images' }));

    await waitFor(() =>
      expect(within(dialog).getByText('9 uploaded, 0 skipped')).toBeInTheDocument(),
    );
    expect(peak).toBe(4);
  });
});
