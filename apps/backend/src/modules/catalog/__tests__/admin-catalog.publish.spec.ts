import { BadRequestException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { MediaService } from '../media/media.service';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { ProductReadinessService } from '../product-readiness.service';

// Decision 0063 / S4 Task 2: publishing needs the blocking readiness checks.
describe('Publishing enforces readiness (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const fx = catalogFixtures(`pub${Date.now()}`);
  let categoryId: string;

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
        SequelizeModule.forFeature(CATALOG_TEST_MODELS),
      ],
      providers: [
        AdminCatalogService,
        ProductReadinessService,
        CatalogAttributeResolverService,
        BrandResolverService,
        { provide: MediaService, useValue: { listForProduct: async () => [] } },
      ],
    }).compile();
    service = moduleRef.get(AdminCatalogService);
    categoryId = (await fx.category()).id;
  });

  afterAll(async () => {
    await fx.cleanup();
    await moduleRef.close();
  });

  const statusOf = async (id: string) => (await MasterProduct.findByPk(id))!.status;

  it('refuses (400) to publish a product with no image, naming what is missing', async () => {
    const product = await fx.product(categoryId, { hsnCode: '8536' });

    await expect(service.setProductStatus(product.id, 'live')).rejects.toThrow(
      new BadRequestException('Cannot publish: needs at least one image'),
    );
    expect(await statusOf(product.id)).toBe(MasterProductStatus.DRAFT);
  });

  it('publishes a product with an image even without an HSN code', async () => {
    const product = await fx.product(categoryId);
    await fx.image(product.id);

    await service.setProductStatus(product.id, 'live');

    expect(await statusOf(product.id)).toBe(MasterProductStatus.LIVE);
  });

  it('never blocks unpublishing, even of a product that is not ready', async () => {
    const product = await fx.product(categoryId, { status: MasterProductStatus.LIVE });

    await service.setProductStatus(product.id, 'draft');

    expect(await statusOf(product.id)).toBe(MasterProductStatus.DRAFT);
  });

  it('bulk publish publishes the ready products and reports the others as skipped', async () => {
    const ready = await fx.product(categoryId);
    await fx.image(ready.id);
    const bare = await fx.product(categoryId);

    const result = await service.bulkPublish({ productIds: [ready.id, bare.id] });

    expect(result).toEqual({
      requested: 2,
      published: 1,
      failed: [],
      skipped: [
        {
          productId: bare.id,
          productCode: bare.productCode,
          reasons: ['needs at least one image'],
        },
      ],
    });
    expect(await statusOf(ready.id)).toBe(MasterProductStatus.LIVE);
    expect(await statusOf(bare.id)).toBe(MasterProductStatus.DRAFT);
  });

  // Found in the S11 end-to-end run: a clash with a live product said only
  // "Validation error".
  it('explains a clash with an identical live product instead of "Validation error"', async () => {
    const leaf = (await fx.category()).id;
    const finish = (await fx.variantAttribute(leaf, 'Finish')).id;
    const live = await fx.product(leaf);
    await fx.attributeValue(live.id, finish, 'Matte');
    await fx.image(live.id);
    await service.setProductStatus(live.id, 'live');
    const twin = await fx.product(leaf);
    await fx.attributeValue(twin.id, finish, 'Matte');
    await fx.image(twin.id);

    await expect(service.setProductStatus(twin.id, 'live')).rejects.toThrow(
      new BadRequestException(
        'a product with the same category and attribute combination already exists',
      ),
    );
    const result = await service.bulkPublish({ productIds: [twin.id] });
    expect(result.failed).toEqual([
      {
        productId: twin.id,
        reason: 'a product with the same category and attribute combination already exists',
      },
    ]);
  });
});
