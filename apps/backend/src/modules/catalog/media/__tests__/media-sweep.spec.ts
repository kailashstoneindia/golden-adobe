import { randomUUID } from 'crypto';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';

import { CATALOG_TEST_MODELS } from '../../__tests__/test-db';
import { Category } from '../../models/category.model';
import { MasterProduct, MasterProductStatus } from '../../models/master-product.model';
import { MasterProductMedia } from '../../models/master-product-media.model';
import { ensureLocalBucket } from '../local-bucket';
import { originalKey, variantKeys } from '../media-keys';
import { SweepOptions, sweepOrphanMedia } from '../media-sweep';
import { S3ObjectStorage, createS3Client } from '../s3-object-storage.service';
import { jpegOfSize, testStorageConfig } from './media-test-helpers';

// Real Postgres and real MinIO, in a bucket of its own: the sweep lists whole
// prefixes, so it must not share a bucket with specs that run in parallel.
jest.setTimeout(60_000);

const BUCKET = 'golden-abode-media-sweep-test';

describe('sweepOrphanMedia (real Postgres + MinIO)', () => {
  const config = testStorageConfig({}, BUCKET);
  const storage = new S3ObjectStorage(config);
  const suffix = `s${Date.now()}`;

  let moduleRef: TestingModule;
  let categoryId: string;
  let productId: string;

  const findExistingMediaIds = async (ids: string[]) => {
    const rows = await MasterProduct.sequelize!.query<{ id: string }>(
      'SELECT id FROM master_product_media WHERE id = ANY(CAST(:ids AS uuid[]))',
      { type: QueryTypes.SELECT, replacements: { ids: `{${ids.join(',')}}` } },
    );
    return new Set(rows.map((r) => r.id));
  };

  const options = (over: Partial<SweepOptions> = {}): SweepOptions => ({
    apply: false,
    // 0: nothing in this test run is old, so the age guard is switched off
    // except in the test that checks it.
    minAgeHours: 0,
    maxDeletions: 500,
    ...over,
  });

  const run = (over: Partial<SweepOptions> = {}) =>
    sweepOrphanMedia({ storage, findExistingMediaIds }, options(over));

  async function clearBucket() {
    for (const prefix of ['original/', 'variants/']) {
      const page = await storage.list(prefix);
      await storage.deleteMany(page.objects.map((o) => o.key));
    }
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
    await ensureLocalBucket(createS3Client(config), BUCKET);

    const category = await Category.create({
      name: `Sweep Test Cat ${suffix}`,
      slug: `sweep-test-cat-${suffix}`,
      level: 1,
      path: `sweep-test-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;
    const product = await MasterProduct.create({
      categoryId,
      name: `Sweep Test Product ${suffix}`,
      slug: `sweep-test-product-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.LIVE,
    } as never);
    productId = product.id;
  });

  beforeEach(async () => {
    await clearBucket();
    await MasterProductMedia.destroy({ where: { masterProductId: productId } });
  });

  afterAll(async () => {
    await clearBucket();
    await MasterProduct.sequelize!.query(`DELETE FROM search_outbox WHERE entity_id = :productId`, {
      replacements: { productId },
    });
    await MasterProduct.destroy({ where: { id: productId } });
    await Category.destroy({ where: { id: categoryId } });
    await moduleRef.close();
  });

  async function putOriginal(mediaId: string) {
    const key = originalKey(productId, mediaId, 'image/jpeg');
    await storage.put(key, jpegOfSize(64), 'image/jpeg');
    return key;
  }

  it('keeps every object of a media row that still exists', async () => {
    const mediaId = randomUUID();
    await MasterProductMedia.create({
      id: mediaId,
      masterProductId: productId,
      url: 'x',
      type: 'image',
    } as never);
    await putOriginal(mediaId);
    await storage.put(variantKeys(productId, mediaId).thumb, jpegOfSize(64), 'image/webp');

    const report = await run({ apply: true });

    expect(report).toMatchObject({ scanned: 2, referenced: 2, orphans: [], deleted: 0 });
  });

  it('reports orphans in a dry run and deletes nothing', async () => {
    const orphan = await putOriginal(randomUUID());

    const report = await run();

    expect(report.orphans).toEqual([orphan]);
    expect(report.deleted).toBe(0);
    expect(await storage.head(orphan)).not.toBeNull();
  });

  it('deletes orphans, originals and variants alike, when told to apply', async () => {
    const mediaId = randomUUID();
    const original = await putOriginal(mediaId);
    const variant = variantKeys(productId, mediaId).large;
    await storage.put(variant, jpegOfSize(64), 'image/webp');

    const report = await run({ apply: true });

    expect(report.deleted).toBe(2);
    expect(await storage.head(original)).toBeNull();
    expect(await storage.head(variant)).toBeNull();
  });

  it('never touches a key it would not have written', async () => {
    const stranger = `original/products/not-a-uuid/${randomUUID()}.jpg`;
    await storage.put(stranger, jpegOfSize(64), 'image/jpeg');

    const report = await run({ apply: true });

    expect(report.unparseable).toEqual([stranger]);
    expect(report.deleted).toBe(0);
    expect(await storage.head(stranger)).not.toBeNull();
  });

  it('skips objects younger than the minimum age, since an upload may be in flight', async () => {
    const fresh = await putOriginal(randomUUID());

    const report = await run({ apply: true, minAgeHours: 24 });

    expect(report.tooNew).toBe(1);
    expect(report.deleted).toBe(0);
    expect(await storage.head(fresh)).not.toBeNull();
  });

  it('deletes nothing at all when more orphans than the limit are found', async () => {
    const keys = [await putOriginal(randomUUID()), await putOriginal(randomUUID())];

    const report = await run({ apply: true, maxDeletions: 1 });

    expect(report.aborted).toBe(true);
    expect(report.orphans).toHaveLength(2);
    expect(report.deleted).toBe(0);
    for (const key of keys) expect(await storage.head(key)).not.toBeNull();
  });
});
