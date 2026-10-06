import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';

import { loadStorageConfig } from '../../../../config/storage.config';
import { CATALOG_TEST_MODELS } from '../../__tests__/test-db';
import { Category } from '../../models/category.model';
import { MasterProduct, MasterProductStatus } from '../../models/master-product.model';
import { MasterProductMedia } from '../../models/master-product-media.model';
import { ConfirmMediaDto } from '../dto/confirm-media.dto';
import { ensureLocalBucket } from '../local-bucket';
import { originalKey, variantKeys } from '../media-keys';
import { MediaService } from '../media.service';
import { S3ObjectStorage, createS3Client } from '../s3-object-storage.service';
import { TEST_BUCKET, jpegOfSize, postForm, testStorageConfig } from './media-test-helpers';

// Integration test: real Postgres (golden_abode_test, migrated) and a real
// S3-compatible server (the MinIO container). Nothing here is mocked, because
// the behaviour that matters (the primary-image unique index, row locking, S3
// enforcing the upload policy, the search outbox trigger) only exists in the
// real systems.
jest.setTimeout(60_000);

describe('MediaService (real Postgres + MinIO)', () => {
  const config = testStorageConfig({
    MEDIA_MAX_UPLOAD_BYTES: String(64 * 1024),
    MEDIA_MAX_PER_PRODUCT: '3',
    MEDIA_PROCESSING_TIMEOUT_SECONDS: '60',
  });
  const storage = new S3ObjectStorage(config);

  let moduleRef: TestingModule;
  let service: MediaService;
  let categoryId: string;
  const productIds: string[] = [];
  const suffix = `m${Date.now()}`;

  async function newProduct(): Promise<string> {
    const n = productIds.length;
    const product = await MasterProduct.create({
      categoryId,
      name: `Media Test Product ${suffix}-${n}`,
      slug: `media-test-product-${suffix}-${n}`,
      isGeneric: true,
      status: MasterProductStatus.LIVE,
    } as never);
    productIds.push(product.id);
    return product.id;
  }

  // The browser's two steps: ask for a ticket, then POST the file straight to S3.
  async function upload(
    productId: string,
    body: Buffer = jpegOfSize(2048),
    contentType = 'image/jpeg',
  ): Promise<string> {
    const ticket = await service.createUpload(productId, { contentType, sizeBytes: body.length });
    const res = await postForm(ticket.upload.url, ticket.upload.fields, body);
    expect(res.status).toBe(204);
    return ticket.mediaId;
  }

  async function attach(productId: string, extra: Partial<ConfirmMediaDto> = {}) {
    const mediaId = await upload(productId);
    const { item } = await service.confirm(productId, { mediaId, ...extra });
    return item;
  }

  async function outboxCount(productId: string): Promise<number> {
    const [row] = await MasterProduct.sequelize!.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM search_outbox
        WHERE entity_type = 'master_product' AND entity_id = :productId`,
      { type: QueryTypes.SELECT, replacements: { productId } },
    );
    return Number(row.c);
  }

  async function primaryCount(productId: string): Promise<number> {
    return MasterProductMedia.count({ where: { masterProductId: productId, isPrimary: true } });
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.TEST_DB_HOST ?? '127.0.0.1',
          port: Number(process.env.TEST_DB_PORT ?? 5432),
          username: process.env.TEST_DB_USER ?? 'postgres',
          password: process.env.TEST_DB_PASS ?? 'postgres',
          database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
          logging: false,
          models: CATALOG_TEST_MODELS,
        }),
      ],
    }).compile();

    await ensureLocalBucket(createS3Client(config), TEST_BUCKET);
    service = new MediaService(MasterProductMedia, MasterProduct, storage, config);

    const category = await Category.create({
      name: `Media Test Cat ${suffix}`,
      slug: `media-test-cat-${suffix}`,
      level: 1,
      path: `media-test-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const productId of productIds) {
      for (const prefix of [`original/products/${productId}/`, `variants/products/${productId}/`]) {
        const page = await storage.list(prefix);
        await storage.deleteMany(page.objects.map((o) => o.key));
      }
    }
    await MasterProduct.sequelize!.query(
      `DELETE FROM search_outbox WHERE entity_id = ANY(CAST(:ids AS uuid[]))`,
      { replacements: { ids: `{${productIds.join(',')}}` } },
    );
    await MasterProduct.destroy({ where: { id: productIds } });
    await Category.destroy({ where: { id: categoryId } });
    await moduleRef.close();
  });

  describe('upload and confirm', () => {
    it('records a confirmed upload as processing, primary, with no variants yet', async () => {
      const productId = await newProduct();
      const item = await attach(productId);

      expect(item).toMatchObject({
        type: 'image',
        status: 'processing',
        error: null,
        isPrimary: true,
        displayOrder: 0,
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        variants: null,
      });
      const row = await MasterProductMedia.findByPk(item.id);
      expect(row?.storageKey).toBe(`original/products/${productId}/${item.id}.jpg`);
    });

    it('is idempotent: confirming twice returns the same row', async () => {
      const productId = await newProduct();
      const mediaId = await upload(productId);

      const first = await service.confirm(productId, { mediaId });
      const second = await service.confirm(productId, { mediaId });

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.item.id).toBe(first.item.id);
      expect(await MasterProductMedia.count({ where: { masterProductId: productId } })).toBe(1);
    });

    it("refuses to confirm another product's upload", async () => {
      const productA = await newProduct();
      const productB = await newProduct();
      const a = await attach(productA);

      await expect(service.confirm(productB, { mediaId: a.id })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a confirm when nothing was uploaded', async () => {
      const productId = await newProduct();
      await expect(service.confirm(productId, { mediaId: randomUUID() })).rejects.toThrow(
        /no uploaded file/,
      );
    });

    it('rejects text renamed to .jpg and deletes the stored object', async () => {
      const productId = await newProduct();
      const mediaId = await upload(productId, Buffer.from('definitely not an image, just text'));

      await expect(service.confirm(productId, { mediaId })).rejects.toThrow(/not a valid/);
      expect(await storage.head(originalKey(productId, mediaId, 'image/jpeg'))).toBeNull();
      expect(await MasterProductMedia.count({ where: { masterProductId: productId } })).toBe(0);
    });

    it('rejects an upload request that is too large, the wrong type, or for no product', async () => {
      const productId = await newProduct();
      await expect(
        service.createUpload(productId, { contentType: 'image/jpeg', sizeBytes: 64 * 1024 + 1 }),
      ).rejects.toThrow(/too large/);
      await expect(
        service.createUpload(productId, { contentType: 'image/gif', sizeBytes: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createUpload(randomUUID(), { contentType: 'image/jpeg', sizeBytes: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('caps the number of images per product', async () => {
      const productId = await newProduct();
      await attach(productId);
      await attach(productId);
      await attach(productId);

      await expect(
        service.createUpload(productId, { contentType: 'image/jpeg', sizeBytes: 100 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('primary image', () => {
    it('makes a later image primary on request and leaves exactly one primary', async () => {
      const productId = await newProduct();
      const a = await attach(productId);
      const b = await attach(productId, { isPrimary: true });

      expect(a.isPrimary).toBe(true);
      expect(b.isPrimary).toBe(true);
      const items = await service.list(productId);
      expect(items.find((i) => i.id === a.id)?.isPrimary).toBe(false);
      expect(items.find((i) => i.id === b.id)?.isPrimary).toBe(true);
      expect(await primaryCount(productId)).toBe(1);
    });

    it('survives two concurrent confirms that both ask to be primary', async () => {
      const productId = await newProduct();
      const [idA, idB] = [await upload(productId), await upload(productId)];

      await Promise.all([
        service.confirm(productId, { mediaId: idA, isPrimary: true }),
        service.confirm(productId, { mediaId: idB, isPrimary: true }),
      ]);

      expect(await MasterProductMedia.count({ where: { masterProductId: productId } })).toBe(2);
      expect(await primaryCount(productId)).toBe(1);
    });

    it('moves primary with update, and refuses to leave a product with none', async () => {
      const productId = await newProduct();
      const a = await attach(productId);
      const b = await attach(productId);

      const updated = await service.update(productId, b.id, { isPrimary: true });
      expect(updated.isPrimary).toBe(true);
      expect(await primaryCount(productId)).toBe(1);

      await expect(service.update(productId, b.id, { isPrimary: false })).rejects.toThrow(
        /keep a primary/,
      );
      await expect(service.update(productId, a.id, {})).rejects.toThrow(/nothing to update/);
      expect(
        (await service.update(productId, a.id, { isRepresentative: true })).isRepresentative,
      ).toBe(true);
    });

    it("cannot edit another product's image", async () => {
      const productA = await newProduct();
      const productB = await newProduct();
      const a = await attach(productA);

      await expect(
        service.update(productB, a.id, { isRepresentative: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reorder and remove', () => {
    it('reorders, and refuses a list that is not exactly the product media', async () => {
      const productId = await newProduct();
      const [a, b, c] = [await attach(productId), await attach(productId), await attach(productId)];

      const reordered = await service.reorder(productId, { mediaIds: [c.id, a.id, b.id] });
      expect(reordered.map((i) => i.id)).toEqual([c.id, a.id, b.id]);
      expect(reordered.map((i) => i.displayOrder)).toEqual([0, 1, 2]);

      await expect(service.reorder(productId, { mediaIds: [a.id, b.id] })).rejects.toThrow(
        /exactly this product/,
      );
      await expect(
        service.reorder(productId, { mediaIds: [a.id, b.id, randomUUID()] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes the row and its objects, and promotes the next primary', async () => {
      const productId = await newProduct();
      const a = await attach(productId);
      const b = await attach(productId);
      const variant = variantKeys(productId, a.id).thumb;
      await storage.put(variant, jpegOfSize(100), 'image/webp');

      await service.remove(productId, a.id);

      expect(await MasterProductMedia.findByPk(a.id)).toBeNull();
      expect(await storage.head(originalKey(productId, a.id, 'image/jpeg'))).toBeNull();
      expect(await storage.head(variant)).toBeNull();
      const remaining = await service.list(productId);
      expect(remaining.map((i) => [i.id, i.isPrimary])).toEqual([[b.id, true]]);
      await expect(service.remove(productId, a.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the Lambda callback', () => {
    it('marks an image ready, derives its variant URLs, and reaches the search outbox', async () => {
      const productId = await newProduct();
      const item = await attach(productId);
      const before = await outboxCount(productId);

      expect(await service.applyProcessingResult(item.id, { status: 'ready' })).toEqual({
        outcome: 'updated',
      });

      const [ready] = await service.list(productId);
      const base = `${config.publicBaseUrl}/variants/products/${productId}/${item.id}`;
      expect(ready).toMatchObject({ status: 'ready', error: null });
      expect(ready.variants).toEqual({
        thumb: `${base}/thumb.webp`,
        medium: `${base}/medium.webp`,
        large: `${base}/large.webp`,
      });
      expect(await outboxCount(productId)).toBeGreaterThan(before);
    });

    it('ignores a repeated or late callback once the image is no longer processing', async () => {
      const productId = await newProduct();
      const item = await attach(productId);

      await service.applyProcessingResult(item.id, { status: 'ready' });
      expect(await service.applyProcessingResult(item.id, { status: 'ready' })).toEqual({
        outcome: 'noop',
      });
      expect(
        await service.applyProcessingResult(item.id, { status: 'failed', reason: 'too late' }),
      ).toEqual({ outcome: 'noop' });
      expect((await service.list(productId))[0].status).toBe('ready');
    });

    it('records a failure with its reason and gives no variants', async () => {
      const productId = await newProduct();
      const item = await attach(productId);

      await service.applyProcessingResult(item.id, { status: 'failed', reason: 'corrupt image' });

      expect((await service.list(productId))[0]).toMatchObject({
        status: 'failed',
        error: 'corrupt image',
        variants: null,
      });
    });

    it('answers 404 for an unknown id, so the Lambda retries until confirm commits', async () => {
      await expect(
        service.applyProcessingResult(randomUUID(), { status: 'ready' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('stuck images and reprocessing', () => {
    async function age(mediaId: string): Promise<void> {
      await MasterProduct.sequelize!.query(
        `UPDATE master_product_media SET updated_at = now() - interval '2 hours' WHERE id = :mediaId`,
        { replacements: { mediaId } },
      );
    }

    it('reports a processing image past the timeout as failed, without writing it', async () => {
      const productId = await newProduct();
      const item = await attach(productId);
      await age(item.id);

      const [shown] = await service.list(productId);
      expect(shown).toMatchObject({ status: 'failed', error: 'processing timed out' });
      expect((await MasterProductMedia.findByPk(item.id))?.processingStatus).toBe('processing');
    });

    it('reprocesses a timed-out image, but not one that is fine', async () => {
      const productId = await newProduct();
      const stuck = await attach(productId);
      const fine = await attach(productId);
      await age(stuck.id);
      await service.applyProcessingResult(fine.id, { status: 'ready' });

      const retried = await service.reprocess(productId, stuck.id);
      expect(retried.status).toBe('processing');
      // The timeout clock restarted: a fresh read must not report it failed again.
      const reread = (await service.list(productId)).find((i) => i.id === stuck.id);
      expect(reread?.status).toBe('processing');
      await expect(service.reprocess(productId, stuck.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.reprocess(productId, fine.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('fails cleanly when the original file is gone', async () => {
      const productId = await newProduct();
      const item = await attach(productId);
      await service.applyProcessingResult(item.id, { status: 'failed', reason: 'boom' });
      await storage.deleteMany([originalKey(productId, item.id, 'image/jpeg')]);

      await expect(service.reprocess(productId, item.id)).rejects.toThrow(
        /original file is missing/,
      );
      expect((await service.list(productId))[0]).toMatchObject({ status: 'failed' });
    });
  });

  describe('other row kinds and configuration', () => {
    it('shows an external-URL row as ready with that one URL for every size', async () => {
      const productId = await newProduct();
      await MasterProductMedia.create({
        masterProductId: productId,
        url: 'https://example.com/legacy.jpg',
        type: 'image',
        isPrimary: true,
      } as never);

      const [item] = await service.list(productId);
      expect(item).toMatchObject({ status: 'ready', contentType: null, sizeBytes: null });
      expect(item.variants).toEqual({
        thumb: 'https://example.com/legacy.jpg',
        medium: 'https://example.com/legacy.jpg',
        large: 'https://example.com/legacy.jpg',
      });
    });

    it('answers 503 for uploads when no bucket is configured, but still lists', async () => {
      const disabled = new MediaService(
        MasterProductMedia,
        MasterProduct,
        storage,
        loadStorageConfig({}),
      );
      const productId = await newProduct();

      await expect(
        disabled.createUpload(productId, { contentType: 'image/jpeg', sizeBytes: 100 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await disabled.list(productId)).toEqual([]);
    });
  });
});
