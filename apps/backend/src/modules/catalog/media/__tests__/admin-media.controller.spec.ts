import { randomUUID } from 'crypto';
import request from 'supertest';

import { jpegOfSize, postForm } from './media-test-helpers';
import { MediaTestApp, createMediaTestApp } from './media-test-app';

// Over real HTTP, through the real guards, validation pipe, exception filter and
// response envelope. The service rules are covered in media.service.spec.ts;
// this is about who may call what, and the shape of what comes back.
jest.setTimeout(60_000);

describe('AdminMediaController (real HTTP, Postgres and MinIO)', () => {
  let t: MediaTestApp;
  let productId: string;

  const base = (id = productId) => `/api/admin/catalog/products/${id}/media`;
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);

  beforeAll(async () => {
    t = await createMediaTestApp();
  });

  beforeEach(async () => {
    productId = await t.newProductId();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('who may call it', () => {
    it('answers 401 without a token', async () => {
      const res = await request(t.app.getHttpServer()).get(base());
      expect(res.status).toBe(401);
    });

    it('answers 403 for a vendor, since vendors never upload images', async () => {
      const res = await request(t.app.getHttpServer())
        .get(base())
        .set('Authorization', `Bearer ${t.vendorToken}`);
      expect(res.status).toBe(403);
    });

    it('lets an admin through, in the standard response envelope', async () => {
      const res = await asAdmin(request(t.app.getHttpServer()).get(base()));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [] });
    });
  });

  describe('validation', () => {
    it('answers 400 for a product id that is not a UUID', async () => {
      const res = await asAdmin(
        request(t.app.getHttpServer()).get('/api/admin/catalog/products/nope/media'),
      );
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, statusCode: 400 });
    });

    it('answers 404 for a product that does not exist', async () => {
      const res = await asAdmin(request(t.app.getHttpServer()).get(base(randomUUID())));
      expect(res.status).toBe(404);
    });

    it('rejects an unsupported content type, a bad size and unknown fields', async () => {
      const post = (body: object) =>
        asAdmin(request(t.app.getHttpServer()).post(`${base()}/uploads`).send(body));

      expect((await post({ contentType: 'image/gif', sizeBytes: 100 })).status).toBe(400);
      expect((await post({ contentType: 'image/jpeg', sizeBytes: 0 })).status).toBe(400);
      expect((await post({ contentType: 'image/jpeg', sizeBytes: 'big' })).status).toBe(400);
      expect(
        (await post({ contentType: 'image/jpeg', sizeBytes: 100, objectKey: '../x' })).status,
      ).toBe(400);
    });

    it('rejects a confirm with no mediaId, and a reorder with a duplicate id', async () => {
      const confirm = await asAdmin(request(t.app.getHttpServer()).post(base()).send({}));
      expect(confirm.status).toBe(400);

      const id = randomUUID();
      const reorder = await asAdmin(
        request(t.app.getHttpServer())
          .put(`${base()}/order`)
          .send({ mediaIds: [id, id] }),
      );
      expect(reorder.status).toBe(400);
    });
  });

  describe('the whole flow', () => {
    it('presigns, accepts the browser upload, confirms, edits, and deletes', async () => {
      const server = t.app.getHttpServer();
      const file = jpegOfSize(4096);

      // 1. ticket
      const ticket = await asAdmin(
        request(server)
          .post(`${base()}/uploads`)
          .send({ contentType: 'image/jpeg', sizeBytes: file.length }),
      );
      expect(ticket.status).toBe(201);
      expect(ticket.body.success).toBe(true);
      const { mediaId, upload } = ticket.body.data;

      // 2. the browser sends the file straight to S3
      expect((await postForm(upload.url, upload.fields, file)).status).toBe(204);

      // 3. confirm: 201 the first time, 200 on a repeat
      const first = await asAdmin(request(server).post(base()).send({ mediaId }));
      expect(first.status).toBe(201);
      expect(first.body.data).toMatchObject({ id: mediaId, status: 'processing', isPrimary: true });
      const repeat = await asAdmin(request(server).post(base()).send({ mediaId }));
      expect(repeat.status).toBe(200);

      // listed
      const list = await asAdmin(request(server).get(base()));
      expect(list.body.data.map((i: { id: string }) => i.id)).toEqual([mediaId]);

      // edited
      const patched = await asAdmin(
        request(server).patch(`${base()}/${mediaId}`).send({ isRepresentative: true }),
      );
      expect(patched.status).toBe(200);
      expect(patched.body.data.isRepresentative).toBe(true);

      // a second image can be reordered ahead of the first
      const second = await asAdmin(
        request(server)
          .post(`${base()}/uploads`)
          .send({ contentType: 'image/jpeg', sizeBytes: file.length }),
      );
      await postForm(second.body.data.upload.url, second.body.data.upload.fields, file);
      await asAdmin(request(server).post(base()).send({ mediaId: second.body.data.mediaId }));
      const reordered = await asAdmin(
        request(server)
          .put(`${base()}/order`)
          .send({ mediaIds: [second.body.data.mediaId, mediaId] }),
      );
      expect(reordered.status).toBe(200);
      expect(reordered.body.data.map((i: { id: string }) => i.id)).toEqual([
        second.body.data.mediaId,
        mediaId,
      ]);

      // not failed, so it cannot be reprocessed
      const reprocess = await asAdmin(request(server).post(`${base()}/${mediaId}/reprocess`));
      expect(reprocess.status).toBe(409);

      // deleted
      const removed = await asAdmin(request(server).delete(`${base()}/${mediaId}`));
      expect(removed.status).toBe(204);
      const after = await asAdmin(request(server).get(base()));
      expect(after.body.data).toHaveLength(1);
    });

    it('answers 400 when confirming an id nothing was uploaded for', async () => {
      const res = await asAdmin(
        request(t.app.getHttpServer()).post(base()).send({ mediaId: randomUUID() }),
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no uploaded file/);
    });
  });
});
