import { randomUUID } from 'crypto';
import request from 'supertest';

import { MasterProductMedia } from '../../models/master-product-media.model';
import { computeSignature } from '../media-callback-signature';
import { jpegOfSize, postForm } from './media-test-helpers';
import { MediaTestApp, createMediaTestApp } from './media-test-app';

// The Lambda's callback, over real HTTP. There is no JWT on this route: the HMAC
// signature is the only credential, so every way of getting it wrong is tested.
jest.setTimeout(60_000);

describe('InternalMediaController (real HTTP, Postgres and MinIO)', () => {
  let t: MediaTestApp;

  const url = (mediaId: string) => `/api/internal/media/${mediaId}/processing-result`;
  const now = () => String(Math.floor(Date.now() / 1000));

  // The Lambda signs the exact bytes it sends.
  function signed(
    mediaId: string,
    body: string,
    over: { timestamp?: string; secret?: string; signature?: string } = {},
  ) {
    const timestamp = over.timestamp ?? now();
    const signature =
      over.signature ??
      computeSignature(over.secret ?? t.config.callbackSecret, timestamp, Buffer.from(body));
    return request(t.app.getHttpServer())
      .post(url(mediaId))
      .set('Content-Type', 'application/json')
      .set('X-Media-Timestamp', timestamp)
      .set('X-Media-Signature', signature)
      .send(body);
  }

  // A confirmed upload, i.e. a row in 'processing' for the Lambda to report on.
  async function processingRow(): Promise<string> {
    const productId = await t.newProductId();
    const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
    const server = t.app.getHttpServer();
    const file = jpegOfSize(1024);
    const ticket = await asAdmin(
      request(server)
        .post(`/api/admin/catalog/products/${productId}/media/uploads`)
        .send({ contentType: 'image/jpeg', sizeBytes: file.length }),
    );
    const { mediaId, upload } = ticket.body.data;
    await postForm(upload.url, upload.fields, file);
    await asAdmin(
      request(server).post(`/api/admin/catalog/products/${productId}/media`).send({ mediaId }),
    );
    return mediaId;
  }

  beforeAll(async () => {
    t = await createMediaTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('accepts a correctly signed ready callback and moves the row out of processing', async () => {
    const mediaId = await processingRow();

    const res = await signed(mediaId, '{"status":"ready"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { outcome: 'updated' } });
    expect((await MasterProductMedia.findByPk(mediaId))?.processingStatus).toBe('ready');
  });

  it('records a failure and its reason', async () => {
    const mediaId = await processingRow();

    const res = await signed(mediaId, '{"status":"failed","reason":"corrupt image"}');

    expect(res.status).toBe(200);
    const row = await MasterProductMedia.findByPk(mediaId);
    expect(row).toMatchObject({ processingStatus: 'failed', processingError: 'corrupt image' });
  });

  it('treats a repeated delivery as a harmless no-op', async () => {
    const mediaId = await processingRow();
    await signed(mediaId, '{"status":"ready"}');

    const again = await signed(mediaId, '{"status":"ready"}');

    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ outcome: 'noop' });
  });

  it('answers 404 for an unknown id, so the Lambda retries', async () => {
    const res = await signed(randomUUID(), '{"status":"ready"}');
    expect(res.status).toBe(404);
  });

  describe('refuses anything that is not correctly signed', () => {
    it('with no signature headers at all', async () => {
      const mediaId = await processingRow();
      const res = await request(t.app.getHttpServer())
        .post(url(mediaId))
        .set('Content-Type', 'application/json')
        .send('{"status":"ready"}');
      expect(res.status).toBe(401);
    });

    it('with a signature made from the wrong secret', async () => {
      const mediaId = await processingRow();
      const res = await signed(mediaId, '{"status":"ready"}', { secret: 'x'.repeat(40) });
      expect(res.status).toBe(401);
    });

    it('with a body changed after it was signed', async () => {
      const mediaId = await processingRow();
      const timestamp = now();
      const signature = computeSignature(
        t.config.callbackSecret,
        timestamp,
        Buffer.from('{"status":"failed"}'),
      );
      const res = await signed(mediaId, '{"status":"ready"}', { timestamp, signature });
      expect(res.status).toBe(401);
      expect((await MasterProductMedia.findByPk(mediaId))?.processingStatus).toBe('processing');
    });

    it('with a timestamp outside the replay window', async () => {
      const mediaId = await processingRow();
      const stale = String(Math.floor(Date.now() / 1000) - 3600);
      const res = await signed(mediaId, '{"status":"ready"}', { timestamp: stale });
      expect(res.status).toBe(401);
    });

    it('with a garbage signature', async () => {
      const mediaId = await processingRow();
      const res = await signed(mediaId, '{"status":"ready"}', { signature: 'sha256=abc' });
      expect(res.status).toBe(401);
    });

    it('with an admin JWT instead of a signature', async () => {
      const mediaId = await processingRow();
      const res = await request(t.app.getHttpServer())
        .post(url(mediaId))
        .set('Authorization', `Bearer ${t.adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{"status":"ready"}');
      expect(res.status).toBe(401);
    });
  });

  describe('validates the body after the signature is accepted', () => {
    it('rejects an unknown status', async () => {
      const mediaId = await processingRow();
      expect((await signed(mediaId, '{"status":"weird"}')).status).toBe(400);
    });

    it('rejects extra fields', async () => {
      const mediaId = await processingRow();
      expect((await signed(mediaId, '{"status":"ready","isPrimary":true}')).status).toBe(400);
    });

    it('rejects an id that is not a UUID', async () => {
      expect((await signed('not-a-uuid', '{"status":"ready"}')).status).toBe(400);
    });
  });
});
