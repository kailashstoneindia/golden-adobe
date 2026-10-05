import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';
import type { MediaUploadTicket, ProductMedia } from '@/types/catalog.types';

import { ProductMediaPanel } from './ProductMediaPanel';

// Shortens the real 2 s poll so the polling tests run quickly.
vi.mock('@/constants/mediaConstants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants/mediaConstants')>();
  return { MEDIA_CONSTANTS: { ...actual.MEDIA_CONSTANTS, processingPollMs: 40 } };
});

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const BASE = `/api/admin/catalog/products/${PRODUCT}/media`;
const S3_URL = 'https://s3.test/media-bucket';

const thumb = (id: string) => `https://cdn.test/variants/products/${PRODUCT}/${id}/thumb.webp`;

function media(id: string, over: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id,
    type: 'image',
    status: 'ready',
    error: null,
    isPrimary: false,
    isRepresentative: false,
    displayOrder: 0,
    contentType: 'image/jpeg',
    sizeBytes: 1000,
    variants: { thumb: thumb(id), medium: thumb(id), large: thumb(id) },
    createdAt: '2026-10-05T00:00:00.000Z',
    ...over,
  };
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// The mock API's state, shared by the handlers below.
let items: ProductMedia[];

function useListHandler() {
  server.use(http.get(BASE, () => HttpResponse.json({ success: true, data: items })));
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductMediaPanel productId={PRODUCT} />
    </QueryClientProvider>,
  );
}

const tiles = () =>
  within(screen.getByRole('list', { name: 'Product images' })).getAllByRole('listitem');

describe('ProductMediaPanel', () => {
  beforeEach(() => {
    items = [];
    useListHandler();
  });
  afterEach(() => vi.restoreAllMocks());

  describe('what it shows', () => {
    it('explains that there are no images yet', async () => {
      renderPanel();

      expect(await screen.findByText(/No images yet/)).toBeInTheDocument();
    });

    it('says so when the images cannot be loaded', async () => {
      server.use(http.get(BASE, () => new HttpResponse(null, { status: 500 })));
      renderPanel();

      expect(await screen.findByText('Could not load the images.')).toBeInTheDocument();
    });

    it('shows a ready image, one still processing, and one that failed, with the reason', async () => {
      items = [
        media(A, { isPrimary: true, isRepresentative: true }),
        media(B, { status: 'processing', variants: null, displayOrder: 1 }),
        media(C, {
          status: 'failed',
          variants: null,
          error: 'the image could not be read (corrupt or unsupported)',
          displayOrder: 2,
        }),
      ];
      renderPanel();

      const image = await screen.findByAltText('Product image 1');
      expect(image).toHaveAttribute('src', thumb(A));

      const [first, second, third] = tiles();
      expect(within(first).getByText('Primary')).toBeInTheDocument();
      // The word is also the toggle button's label, so match the badge only.
      expect(within(first).getByText('Representative', { selector: 'span' })).toBeInTheDocument();
      expect(within(second).getByText('Processing…')).toBeInTheDocument();
      expect(within(third).getByText('Failed')).toBeInTheDocument();
      expect(within(third).getByText(/could not be read/)).toBeInTheDocument();
      expect(within(third).getByRole('button', { name: 'Retry image 3' })).toBeInTheDocument();
      expect(within(first).queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    });

    it('only offers "Make primary" on images that are not already primary', async () => {
      items = [media(A, { isPrimary: true }), media(B, { displayOrder: 1 })];
      renderPanel();
      await screen.findAllByRole('listitem');

      const [first, second] = tiles();
      expect(within(first).queryByRole('button', { name: /Make image 1 primary/ })).toBeNull();
      expect(within(second).getByRole('button', { name: 'Make image 2 primary' })).toBeEnabled();
    });

    it('cannot move the first image left or the last image right', async () => {
      items = [media(A, { isPrimary: true }), media(B, { displayOrder: 1 })];
      renderPanel();
      await screen.findAllByRole('listitem');

      expect(screen.getByRole('button', { name: 'Move image 1 left' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move image 2 right' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move image 1 right' })).toBeEnabled();
    });
  });

  describe('polling while images are processed', () => {
    it('refreshes by itself until the image is ready, then stops', async () => {
      items = [media(A, { isPrimary: true, status: 'processing', variants: null })];
      let reads = 0;
      server.use(
        http.get(BASE, () => {
          reads++;
          // Ready from the third read on, like a Lambda that took a moment.
          if (reads >= 3) items = [media(A, { isPrimary: true })];
          return HttpResponse.json({ success: true, data: items });
        }),
      );
      renderPanel();

      expect(await screen.findByText('Processing…')).toBeInTheDocument();
      expect(await screen.findByAltText('Product image 1')).toBeInTheDocument();

      const readsWhenReady = reads;
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(reads).toBe(readsWhenReady);
    });

    it('does not poll at all when nothing is processing', async () => {
      items = [media(A, { isPrimary: true })];
      let reads = 0;
      server.use(
        http.get(BASE, () => {
          reads++;
          return HttpResponse.json({ success: true, data: items });
        }),
      );
      renderPanel();
      await screen.findByAltText('Product image 1');

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(reads).toBe(1);
    });
  });

  describe('actions', () => {
    it('makes another image primary', async () => {
      items = [media(A, { isPrimary: true }), media(B, { displayOrder: 1 })];
      let body: unknown;
      server.use(
        http.patch(`${BASE}/${B}`, async ({ request }) => {
          body = await request.json();
          items = [media(A), media(B, { isPrimary: true, displayOrder: 1 })];
          return HttpResponse.json({ success: true, data: items[1] });
        }),
      );
      renderPanel();
      await screen.findAllByRole('listitem');

      await userEvent.click(screen.getByRole('button', { name: 'Make image 2 primary' }));

      expect(body).toEqual({ isPrimary: true });
      await waitFor(() => expect(within(tiles()[1]).getByText('Primary')).toBeInTheDocument());
      expect(within(tiles()[0]).queryByText('Primary')).toBeNull();
    });

    it('toggles the representative flag', async () => {
      items = [media(A, { isPrimary: true })];
      let body: unknown;
      server.use(
        http.patch(`${BASE}/${A}`, async ({ request }) => {
          body = await request.json();
          items = [media(A, { isPrimary: true, isRepresentative: true })];
          return HttpResponse.json({ success: true, data: items[0] });
        }),
      );
      renderPanel();
      const button = await screen.findByRole('button', { name: 'Mark image 1 as representative' });
      expect(button).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(button);

      expect(body).toEqual({ isRepresentative: true });
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Mark image 1 as representative' }),
        ).toHaveAttribute('aria-pressed', 'true'),
      );
    });

    it('reorders by sending every id in the new order', async () => {
      items = [
        media(A, { isPrimary: true }),
        media(B, { displayOrder: 1 }),
        media(C, { displayOrder: 2 }),
      ];
      let body: unknown;
      server.use(
        http.put(`${BASE}/order`, async ({ request }) => {
          body = await request.json();
          items = [items[1], items[0], items[2]];
          return HttpResponse.json({ success: true, data: items });
        }),
      );
      renderPanel();
      await screen.findAllByRole('listitem');

      await userEvent.click(screen.getByRole('button', { name: 'Move image 1 right' }));

      expect(body).toEqual({ mediaIds: [B, A, C] });
      await waitFor(() =>
        expect(within(tiles()[0]).getByAltText('Product image 1')).toHaveAttribute('src', thumb(B)),
      );
    });

    it('deletes only after the admin confirms', async () => {
      items = [media(A, { isPrimary: true }), media(B, { displayOrder: 1 })];
      let deleted = 0;
      server.use(
        http.delete(`${BASE}/${B}`, () => {
          deleted++;
          items = [media(A, { isPrimary: true })];
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderPanel();
      await screen.findAllByRole('listitem');
      const confirm = vi.spyOn(window, 'confirm');

      confirm.mockReturnValueOnce(false);
      await userEvent.click(screen.getByRole('button', { name: 'Delete image 2' }));
      expect(deleted).toBe(0);
      expect(tiles()).toHaveLength(2);

      confirm.mockReturnValueOnce(true);
      await userEvent.click(screen.getByRole('button', { name: 'Delete image 2' }));
      await waitFor(() => expect(tiles()).toHaveLength(1));
      expect(deleted).toBe(1);
    });

    it('retries a failed image, which then shows as processing', async () => {
      items = [media(A, { isPrimary: true, status: 'failed', variants: null, error: 'boom' })];
      let retried = 0;
      server.use(
        http.post(`${BASE}/${A}/reprocess`, () => {
          retried++;
          items = [media(A, { isPrimary: true, status: 'processing', variants: null })];
          return HttpResponse.json({ success: true, data: items[0] }, { status: 202 });
        }),
      );
      renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: 'Retry image 1' }));

      expect(retried).toBe(1);
      expect(await screen.findByText('Processing…')).toBeInTheDocument();
    });

    it("shows the server's reason when an action is refused", async () => {
      items = [media(A, { isPrimary: true }), media(B, { displayOrder: 1 })];
      server.use(
        http.patch(`${BASE}/${B}`, () =>
          HttpResponse.json(
            { success: false, statusCode: 400, message: 'nothing to update' },
            { status: 400 },
          ),
        ),
      );
      renderPanel();
      await screen.findAllByRole('listitem');

      await userEvent.click(screen.getByRole('button', { name: 'Make image 2 primary' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('nothing to update');
    });
  });

  describe('uploading', () => {
    const ticket = (mediaId: string): MediaUploadTicket => ({
      mediaId,
      upload: { url: S3_URL, fields: { key: `original/${mediaId}.jpg`, Policy: 'p' } },
      expiresAt: '2026-10-05T00:05:00.000Z',
      maxBytes: 10 * 1024 * 1024,
    });
    const photo = (name = 'tile.jpg', type = 'image/jpeg', size = 2048) =>
      new File([new Uint8Array(size)], name, { type });
    // applyAccept off: a drag-and-drop bypasses the input's accept filter, and
    // our own validation is what is under test.
    const setup = () => userEvent.setup({ applyAccept: false });

    it('uploads a picked image and then lists it as processing', async () => {
      const calls: string[] = [];
      server.use(
        http.post(`${BASE}/uploads`, async ({ request }) => {
          calls.push(`ticket ${JSON.stringify(await request.json())}`);
          return HttpResponse.json({ success: true, data: ticket(A) }, { status: 201 });
        }),
        http.post(S3_URL, () => {
          calls.push('s3');
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(BASE, async ({ request }) => {
          calls.push(`confirm ${JSON.stringify(await request.json())}`);
          items = [media(A, { isPrimary: true, status: 'processing', variants: null })];
          return HttpResponse.json({ success: true, data: items[0] }, { status: 201 });
        }),
      );
      renderPanel();
      await screen.findByText(/No images yet/);

      await setup().upload(
        screen.getByLabelText(/add images/i),
        photo('tile.jpg', 'image/jpeg', 2048),
      );

      expect(await screen.findByText('Uploaded')).toBeInTheDocument();
      expect(calls).toEqual([
        'ticket {"contentType":"image/jpeg","sizeBytes":2048}',
        's3',
        `confirm {"mediaId":"${A}"}`,
      ]);
      expect(await screen.findByText('Processing…')).toBeInTheDocument();
    });

    it('refuses HEIC and oversized files without calling the API', async () => {
      let apiCalls = 0;
      server.use(
        http.post(`${BASE}/uploads`, () => {
          apiCalls++;
          return HttpResponse.json({ success: true, data: ticket(A) });
        }),
      );
      renderPanel();
      await screen.findByText(/No images yet/);
      const input = screen.getByLabelText(/add images/i);

      await setup().upload(input, [
        photo('iphone.heic', 'image/heic'),
        photo('huge.jpg', 'image/jpeg', 11 * 1024 * 1024),
      ]);

      const alerts = await screen.findAllByRole('alert');
      expect(alerts.map((a) => a.textContent)).toEqual([
        'iphone.heic: only JPEG, PNG and WebP images are supported',
        'huge.jpg: larger than 10.0 MB',
      ]);
      expect(apiCalls).toBe(0);
    });

    it('shows why a file failed and never confirms it when S3 refuses it', async () => {
      let confirmed = 0;
      server.use(
        http.post(`${BASE}/uploads`, () =>
          HttpResponse.json({ success: true, data: ticket(A) }, { status: 201 }),
        ),
        http.post(S3_URL, () =>
          HttpResponse.text('<Error><Code>EntityTooLarge</Code></Error>', { status: 400 }),
        ),
        http.post(BASE, () => {
          confirmed++;
          return HttpResponse.json({ success: true, data: media(A) });
        }),
      );
      renderPanel();
      await screen.findByText(/No images yet/);

      await setup().upload(screen.getByLabelText(/add images/i), photo());

      expect(await screen.findByRole('alert')).toHaveTextContent('larger than the allowed size');
      expect(confirmed).toBe(0);
    });

    it("shows the API's message when it will not issue a ticket", async () => {
      server.use(
        http.post(`${BASE}/uploads`, () =>
          HttpResponse.json(
            {
              success: false,
              statusCode: 409,
              message: 'this product already has the maximum of 20 images',
            },
            { status: 409 },
          ),
        ),
      );
      renderPanel();
      await screen.findByText(/No images yet/);

      await setup().upload(screen.getByLabelText(/add images/i), photo());

      expect(await screen.findByRole('alert')).toHaveTextContent('maximum of 20 images');
    });

    it('uploads several files and lets one fail without stopping the others', async () => {
      let next = 0;
      server.use(
        http.post(`${BASE}/uploads`, async ({ request }) => {
          const body = (await request.json()) as { sizeBytes: number };
          // The 3000-byte file is refused; the others go through.
          if (body.sizeBytes === 3000) {
            return HttpResponse.json(
              { success: false, statusCode: 400, message: 'refused' },
              { status: 400 },
            );
          }
          return HttpResponse.json(
            { success: true, data: ticket([A, B, C][next++]) },
            { status: 201 },
          );
        }),
        http.post(S3_URL, () => new HttpResponse(null, { status: 204 })),
        http.post(BASE, async ({ request }) => {
          const { mediaId } = (await request.json()) as { mediaId: string };
          items = [
            ...items,
            media(mediaId, { displayOrder: items.length, isPrimary: items.length === 0 }),
          ];
          return HttpResponse.json(
            { success: true, data: items[items.length - 1] },
            { status: 201 },
          );
        }),
      );
      renderPanel();
      await screen.findByText(/No images yet/);

      await setup().upload(screen.getByLabelText(/add images/i), [
        photo('one.jpg', 'image/jpeg', 1000),
        photo('two.jpg', 'image/jpeg', 3000),
        photo('three.jpg', 'image/jpeg', 2000),
      ]);

      expect(await screen.findByRole('alert')).toHaveTextContent('refused');
      await waitFor(() => expect(screen.getAllByText('Uploaded')).toHaveLength(2));
      await waitFor(() => expect(tiles()).toHaveLength(2));
    });

    it('clears the finished uploads from the list on request', async () => {
      renderPanel();
      await screen.findByText(/No images yet/);
      await setup().upload(screen.getByLabelText(/add images/i), photo('x.heic', 'image/heic'));
      await screen.findByRole('alert');

      await userEvent.click(screen.getByRole('button', { name: 'Clear list' }));

      expect(screen.queryByRole('list', { name: 'Uploads' })).toBeNull();
    });
  });
});
