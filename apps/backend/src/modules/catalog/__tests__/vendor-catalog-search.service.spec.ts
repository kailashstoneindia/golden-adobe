import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';

import { CATALOG_TEST_MODELS, createTestSequelize } from './test-db';
import { VendorCatalogSearchService } from '../vendor-catalog-search.service';
import { Category } from '../models/category.model';
import { Brand } from '../models/brand.model';
import { MasterProduct, MasterProductStatus, SaleUnitType } from '../models/master-product.model';

// Decision 0053 — vendor-facing catalog search, so a vendor can find a
// master_product id to list against without a bulk sheet upload.
describe('VendorCatalogSearchService (integration)', () => {
  let moduleRef: TestingModule;
  let service: VendorCatalogSearchService;
  const suffix = `t${Date.now()}`;

  let categoryId: string;
  let otherCategoryId: string;
  let brandId: string;
  let liveProductId: string;

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
      providers: [VendorCatalogSearchService],
    }).compile();
    service = moduleRef.get(VendorCatalogSearchService);

    const category = await Category.create({
      name: `VCS Test Cat ${suffix}`,
      slug: `vcs-test-cat-${suffix}`,
      level: 1,
      path: `vcs-test-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    const otherCategory = await Category.create({
      name: `VCS Other Cat ${suffix}`,
      slug: `vcs-other-cat-${suffix}`,
      level: 1,
      path: `vcs-other-cat-${suffix}`,
      isLeaf: true,
    } as never);
    otherCategoryId = otherCategory.id;

    const brand = await Brand.create({
      name: `VCS Test Brand ${suffix}`,
      slug: `vcs-test-brand-${suffix}`,
      manufacturerName: 'Test',
      manufacturerAddress: 'Test',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);
    brandId = brand.id;

    const liveProduct = await MasterProduct.create({
      categoryId,
      brandId,
      name: `VCS Searchable Widget ${suffix}`,
      slug: `vcs-searchable-widget-${suffix}`,
      status: MasterProductStatus.LIVE,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    liveProductId = liveProduct.id;

    await MasterProduct.create({
      categoryId,
      brandId,
      name: `VCS Draft Widget ${suffix}`,
      slug: `vcs-draft-widget-${suffix}`,
      status: MasterProductStatus.DRAFT,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);

    await MasterProduct.create({
      categoryId: otherCategoryId,
      name: `VCS Other Category Widget ${suffix}`,
      slug: `vcs-other-category-widget-${suffix}`,
      status: MasterProductStatus.LIVE,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
  });

  afterAll(async () => {
    await moduleRef.close();
    const sequelize = createTestSequelize();
    await sequelize.close();
  });

  it('returns only live products, never draft/pending_review/deprecated', async () => {
    const result = await service.search({ categoryId, page: 1, limit: 25 });
    const ids = result.items.map((item) => item.masterProductId);
    expect(ids).toContain(liveProductId);
    expect(result.items.every((item) => item.masterProductId !== undefined)).toBe(true);
    // the draft widget in the same category must never appear
    expect(result.items.some((item) => item.name.includes('Draft Widget'))).toBe(false);
  });

  it('matches by exact product_code', async () => {
    const product = await MasterProduct.findByPk(liveProductId);
    const result = await service.search({ search: product!.productCode, page: 1, limit: 25 });
    expect(result.items.map((item) => item.masterProductId)).toContain(liveProductId);
  });

  it('matches by fuzzy name', async () => {
    const result = await service.search({
      search: `Searchable Widget ${suffix}`,
      page: 1,
      limit: 25,
    });
    expect(result.items.map((item) => item.masterProductId)).toContain(liveProductId);
  });

  it('restricts to the given category only', async () => {
    const result = await service.search({ categoryId, page: 1, limit: 100 });
    expect(result.items.some((item) => item.masterProductId === liveProductId)).toBe(true);
    const otherCategoryResult = await service.search({
      categoryId: otherCategoryId,
      page: 1,
      limit: 100,
    });
    expect(otherCategoryResult.items.some((item) => item.masterProductId === liveProductId)).toBe(
      false,
    );
  });

  it('reports brand name and category path', async () => {
    const result = await service.search({ categoryId, page: 1, limit: 100 });
    const found = result.items.find((item) => item.masterProductId === liveProductId);
    expect(found?.brand).toBe(`VCS Test Brand ${suffix}`);
    expect(found?.categoryPath).toBe(`vcs-test-cat-${suffix}`);
    expect(found?.saleUnitType).toBe('discrete');
  });
});
