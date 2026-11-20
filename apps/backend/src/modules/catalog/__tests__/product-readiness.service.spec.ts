import { NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { ProductReadinessService } from '../product-readiness.service';
import { ProcessingStatus, MediaType } from '../models/master-product-media.model';
import { VendorListingStatus } from '../models/vendor-listing.model';

// Decision 0063 / S4 Task 1: what a product still needs before it can go live.
describe('ProductReadinessService (integration)', () => {
  let moduleRef: TestingModule;
  let service: ProductReadinessService;
  const fx = catalogFixtures(`pr${Date.now()}`);
  let categoryId: string;
  let finishId: string;

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
      providers: [ProductReadinessService, CatalogAttributeResolverService],
    }).compile();
    service = moduleRef.get(ProductReadinessService);

    categoryId = (await fx.category()).id;
    finishId = (await fx.variantAttribute(categoryId, 'Finish')).id;
  });

  afterAll(async () => {
    await fx.cleanup();
    await moduleRef.close();
  });

  // Image, HSN code, the starred attribute and an active listing.
  async function completeProduct() {
    const product = await fx.product(categoryId, { hsnCode: '8536' });
    await fx.image(product.id);
    await fx.attributeValue(product.id, finishId, 'Matte');
    await fx.listing((await fx.vendor()).id, product.id);
    return product;
  }

  const check = (
    result: Awaited<ReturnType<ProductReadinessService['getReadiness']>>,
    code: string,
  ) => result.checks.find((c) => c.code === code)!;

  it('a complete product is ready and passes every check', async () => {
    const product = await completeProduct();

    const result = await service.getReadiness(product.id);

    expect(result.ready).toBe(true);
    expect(result.checks.map((c) => [c.code, c.passed, c.blocking])).toEqual([
      ['image', true, true],
      ['required_attributes', true, true],
      ['hsn_code', true, false],
      ['listing', true, false],
    ]);
  });

  it('a product with no image is not ready (blocking)', async () => {
    const product = await fx.product(categoryId, { hsnCode: '8536' });
    await fx.attributeValue(product.id, finishId, 'Matte');

    const result = await service.getReadiness(product.id);

    expect(result.ready).toBe(false);
    expect(check(result, 'image')).toMatchObject({ passed: false, blocking: true });
  });

  it('a spec sheet or a failed upload does not count as an image', async () => {
    const product = await fx.product(categoryId, { hsnCode: '8536' });
    await fx.attributeValue(product.id, finishId, 'Matte');
    await fx.image(product.id, { type: MediaType.SPEC_SHEET_PDF });
    await fx.image(product.id, { processingStatus: ProcessingStatus.FAILED, isPrimary: false });

    expect(check(await service.getReadiness(product.id), 'image').passed).toBe(false);
  });

  it('a missing HSN code only warns: the product stays ready', async () => {
    const product = await fx.product(categoryId);
    await fx.image(product.id);
    await fx.attributeValue(product.id, finishId, 'Matte');

    const result = await service.getReadiness(product.id);

    expect(check(result, 'hsn_code')).toMatchObject({ passed: false, blocking: false });
    expect(result.ready).toBe(true);
  });

  it('a missing starred attribute blocks, naming it', async () => {
    const product = await fx.product(categoryId, { hsnCode: '8536' });
    await fx.image(product.id);

    const result = await service.getReadiness(product.id);

    expect(result.ready).toBe(false);
    expect(check(result, 'required_attributes')).toMatchObject({
      passed: false,
      blocking: true,
      detail: 'Missing: Finish',
    });
  });

  it('no active listing only warns: a paused listing does not count', async () => {
    const product = await fx.product(categoryId, { hsnCode: '8536' });
    await fx.image(product.id);
    await fx.attributeValue(product.id, finishId, 'Matte');
    await fx.listing((await fx.vendor()).id, product.id, VendorListingStatus.PAUSED);

    const result = await service.getReadiness(product.id);

    expect(check(result, 'listing')).toMatchObject({ passed: false, blocking: false });
    expect(result.ready).toBe(true);
  });

  it('refuses (404) an unknown product', async () => {
    await expect(
      service.getReadiness('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
