import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { MediaService } from '../media/media.service';
import { MasterProductStatus } from '../models/master-product.model';
import { ProductReadinessService } from '../product-readiness.service';

// Decision 0063 / S10: match image file names (product code or the brand's
// part number) to products, for the bulk image upload.
describe('AdminCatalogService.lookupProductKeys (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const suffix = `lk${Date.now()}`;
  const fx = catalogFixtures(suffix);
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

  const branded = async (brandId: string, mpn: string, over: Record<string, unknown> = {}) =>
    fx.product(categoryId, { isGeneric: false, brandId, mfrPartNumber: mpn, ...over });

  it('matches a product code, case-insensitively, and says whether it has a primary image', async () => {
    const brand = await fx.brand();
    const product = await branded(brand.id, `LK-A-${suffix}`);
    await fx.image(product.id);

    const result = await service.lookupProductKeys({ keys: [product.productCode.toLowerCase()] });

    expect(result).toEqual({
      items: [
        {
          key: product.productCode.toLowerCase(),
          productId: product.id,
          matchedBy: 'code',
          hasPrimary: true,
          status: 'draft',
          productName: product.name,
          productCode: product.productCode,
        },
      ],
      ambiguousKeys: [],
    });
  });

  it('matches a part number, case-insensitively, and leaves unknown keys out', async () => {
    const brand = await fx.brand();
    const product = await branded(brand.id, `LK-B-${suffix}`);

    const result = await service.lookupProductKeys({
      keys: [`lk-b-${suffix}`, `NOTHING-${suffix}`],
    });

    expect(result.items).toEqual([
      {
        key: `lk-b-${suffix}`,
        productId: product.id,
        matchedBy: 'mpn',
        hasPrimary: false,
        status: 'draft',
        productName: product.name,
        productCode: product.productCode,
      },
    ]);
    expect(result.ambiguousKeys).toEqual([]);
  });

  it('calls a part number shared by two brands ambiguous, unless a brand is given', async () => {
    const one = await fx.brand('One');
    const two = await fx.brand('Two');
    const mpn = `LK-SHARED-${suffix}`;
    const ofOne = await branded(one.id, mpn);
    await branded(two.id, mpn);

    expect(await service.lookupProductKeys({ keys: [mpn] })).toEqual({
      items: [],
      ambiguousKeys: [mpn],
    });
    expect((await service.lookupProductKeys({ keys: [mpn], brandId: one.id })).items).toEqual([
      expect.objectContaining({ key: mpn, productId: ofOne.id, matchedBy: 'mpn' }),
    ]);
  });

  it('returns a retired product with its status, so the screen can skip it', async () => {
    const brand = await fx.brand();
    const retired = await branded(brand.id, `LK-R-${suffix}`, {
      status: MasterProductStatus.DEPRECATED,
    });

    expect((await service.lookupProductKeys({ keys: [retired.productCode] })).items).toEqual([
      expect.objectContaining({ productId: retired.id, status: 'deprecated' }),
    ]);
  });
});
