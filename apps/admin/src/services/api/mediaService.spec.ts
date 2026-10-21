import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';
import type { MediaUploadTicket, ProductMedia } from '@/types/catalog.types';

import { mediaService, uploadToS3 } from './mediaService';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const MEDIA = '22222222-2222-4222-8222-222222222222';
const BASE = `/api/admin/catalog/products/${PRODUCT}/media`;

const item = (over: Partial<ProductMedia> = {}): ProductMedia => ({
  id: MEDIA,
  type: 'image',
  status: 'processing',
  error: null,
  isPrimary: true,
  isRepresentative: false,
  displayOrder: 0,
  contentType: 'image/jpeg',
  sizeBytes: 1000,
  variants: null,
  createdAt: '2026-10-05T00:00:00.000Z',
  ...over,
});

const ticket: MediaUploadTicket = {
  mediaId: MEDIA,
  upload: {
    url: 'https://s3.test/media-bucket',
    fields: {
      key: 'original/k.jpg',
      'Content-Type': 'image/jpeg',
      Policy: 'p',
      'X-Amz-Signature': 's',
    },
  },
  expiresAt: '2026-10-05T00:05:00.000Z',
  maxBytes: 10485760,
};

const photo = () => new File([new Uint8Array(2048)], 'tile.jpg', { type: 'image/jpeg' });

// A stand-in XMLHttpRequest that records what was sent and lets a test drive the
// progress and result events.
class FakeXHR {
  static instances: FakeXHR[] = [];
  upload: { onprogress: ((e: ProgressEventInit & { lengthComputable: boolean }) => void) | null } =
    {
      onprogress: null,
    };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  body: FormData | null = null;
  headers: Record<string, string> = {};

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  finish(status: number, responseText = '') {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

describe('uploadToS3', () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the policy fields first and the file LAST, as S3 requires', async () => {
    const pending = uploadToS3(ticket.upload, photo());
    const xhr = FakeXHR.instances[0];
    xhr.finish(204);
    await pending;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://s3.test/media-bucket');
    expect([...xhr.body!.keys()]).toEqual([
      'key',
      'Content-Type',
      'Policy',
      'X-Amz-Signature',
      'file',
    ]);
    expect(xhr.body!.get('key')).toBe('original/k.jpg');
    expect((xhr.body!.get('file') as File).name).toBe('tile.jpg');
  });

  it('sets no headers, so the admin token is never sent to S3', async () => {
    const pending = uploadToS3(ticket.upload, photo());
    FakeXHR.instances[0].finish(204);
    await pending;

    expect(FakeXHR.instances[0].headers).toEqual({});
  });

  it('reports progress as a fraction, ignores unmeasurable events, and ends at 1', async () => {
    const seen: number[] = [];
    const pending = uploadToS3(ticket.upload, photo(), (fraction) => seen.push(fraction));
    const xhr = FakeXHR.instances[0];

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 0 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.finish(204);
    await pending;

    expect(seen).toEqual([0.25, 1, 1]);
  });

  it.each([
    [400, '<Error><Code>EntityTooLarge</Code></Error>', /larger than the allowed size/],
    [403, '<Error><Code>AccessDenied</Code></Error>', /refused/],
    [403, 'Policy Condition failed: ["eq", "$Content-Type"]', /refused/],
    [500, '', /Upload failed \(500\)/],
  ])('turns an S3 %i into a message an admin can act on', async (status, body, message) => {
    const pending = uploadToS3(ticket.upload, photo());
    FakeXHR.instances[0].finish(status, body);

    await expect(pending).rejects.toThrow(message);
  });

  it('rejects on a network error and on an abort', async () => {
    const network = uploadToS3(ticket.upload, photo());
    FakeXHR.instances[0].onerror?.();
    await expect(network).rejects.toThrow(/Network error/);

    const aborted = uploadToS3(ticket.upload, photo());
    FakeXHR.instances[1].onabort?.();
    await expect(aborted).rejects.toThrow(/cancelled/);
  });
});

describe('mediaService (against a mock API)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists, and unwraps the response envelope', async () => {
    server.use(http.get(BASE, () => HttpResponse.json({ success: true, data: [item()] })));

    expect(await mediaService.list(PRODUCT)).toEqual([item()]);
  });

  it('asks for an upload ticket with the file type and exact size', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/uploads`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: ticket }, { status: 201 });
      }),
    );

    const result = await mediaService.requestUpload(PRODUCT, { type: 'image/png', size: 4242 });

    expect(body).toEqual({ contentType: 'image/png', sizeBytes: 4242 });
    expect(result.mediaId).toBe(MEDIA);
  });

  it('confirms with only the media id', async () => {
    let body: unknown;
    server.use(
      http.post(BASE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: item() }, { status: 201 });
      }),
    );

    await mediaService.confirmUpload(PRODUCT, MEDIA);

    expect(body).toEqual({ mediaId: MEDIA });
  });

  it('patches flags, reorders, reprocesses and deletes against the right routes', async () => {
    const seen: string[] = [];
    server.use(
      http.patch(`${BASE}/${MEDIA}`, async ({ request }) => {
        seen.push(`PATCH ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ success: true, data: item() });
      }),
      http.put(`${BASE}/order`, async ({ request }) => {
        seen.push(`PUT ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ success: true, data: [item()] });
      }),
      http.post(`${BASE}/${MEDIA}/reprocess`, () => {
        seen.push('POST reprocess');
        return HttpResponse.json({ success: true, data: item() }, { status: 202 });
      }),
      http.delete(`${BASE}/${MEDIA}`, () => {
        seen.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await mediaService.update(PRODUCT, MEDIA, { isPrimary: true });
    await mediaService.reorder(PRODUCT, [MEDIA]);
    await mediaService.reprocess(PRODUCT, MEDIA);
    await mediaService.remove(PRODUCT, MEDIA);

    expect(seen).toEqual([
      'PATCH {"isPrimary":true}',
      `PUT {"mediaIds":["${MEDIA}"]}`,
      'POST reprocess',
      'DELETE',
    ]);
  });

  it('runs the whole upload in order: ticket, then S3, then confirm', async () => {
    const order: string[] = [];
    // The S3 step is replaced (see mediaService.uploadFile): the real transport is
    // covered by the uploadToS3 tests above and by a real-browser run.
    const upload = vi.spyOn(mediaService, 'uploadFile').mockImplementation(async () => {
      order.push('s3');
    });
    server.use(
      http.post(`${BASE}/uploads`, () => {
        order.push('ticket');
        return HttpResponse.json({ success: true, data: ticket }, { status: 201 });
      }),
      http.post(BASE, () => {
        order.push('confirm');
        return HttpResponse.json({ success: true, data: item() }, { status: 201 });
      }),
    );

    const result = await mediaService.uploadImage(PRODUCT, photo());

    expect(order).toEqual(['ticket', 's3', 'confirm']);
    expect(result.id).toBe(MEDIA);
    // It is handed the ticket's own form, and the file.
    expect(upload).toHaveBeenCalledWith(ticket.upload, expect.any(File), undefined);
  });

  it('does not confirm when S3 refuses the file', async () => {
    let confirmed = false;
    vi.spyOn(mediaService, 'uploadFile').mockRejectedValue(
      new Error('The file is larger than the allowed size'),
    );
    server.use(
      http.post(`${BASE}/uploads`, () =>
        HttpResponse.json({ success: true, data: ticket }, { status: 201 }),
      ),
      http.post(BASE, () => {
        confirmed = true;
        return HttpResponse.json({ success: true, data: item() });
      }),
    );

    await expect(mediaService.uploadImage(PRODUCT, photo())).rejects.toThrow(/larger than/);
    expect(confirmed).toBe(false);
  });
});
