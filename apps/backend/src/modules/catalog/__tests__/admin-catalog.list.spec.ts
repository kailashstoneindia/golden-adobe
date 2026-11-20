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

// Decision 0063 / S4 Task 5: after onboarding a brand, see just its products.
describe('AdminCatalogService.listProducts brand filter (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const suffix = `ls${Date.now()}`;
  const fx = catalogFixtures(suffix);
  let catA: string;
  let catB: string;
  let brandId: string;
  let brandName: string;
  let ids: Record<string, string>;

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

    catA = (await fx.category()).id;
    catB = (await fx.category()).id;
    // A name sharing no text with the fixture product names, so only the brand
    // clause (not the fuzzy name match) can find these products.
    const letters = Math.random()
      .toString(36)
      .replace(/[^a-z]/g, '')
      .slice(0, 6);
    const brand = await fx.brand('Quartzite', { name: `Quorvantis ${letters}` });
    const other = await fx.brand('Other');
    brandId = brand.id;
    brandName = brand.name;
    const branded = (categoryId: string, id: string, over: Record<string, unknown> = {}) =>
      fx.product(categoryId, { isGeneric: false, brandId: id, ...over });
    ids = {
      draftA: (await branded(catA, brand.id)).id,
      liveA: (await branded(catA, brand.id, { status: MasterProductStatus.LIVE })).id,
      draftB: (await branded(catB, brand.id)).id,
      otherBrand: (await branded(catA, other.id)).id,
    };
  });

  afterAll(async () => {
    await fx.cleanup();
    await moduleRef.close();
  });

  const idsOf = (result: { items: { id: string }[] }) => result.items.map((i) => i.id).sort();

  it('returns only the products of one brand', async () => {
    const result = await service.listProducts({ brandId, limit: 100 });

    expect(idsOf(result)).toEqual([ids.draftA, ids.liveA, ids.draftB].sort());
    expect(result.total).toBe(3);
  });

  it('the search box also matches the brand name', async () => {
    const result = await service.listProducts({ search: brandName, limit: 100 });

    expect(idsOf(result)).toEqual([ids.draftA, ids.liveA, ids.draftB].sort());
  });

  it('combines the brand with status and category', async () => {
    expect(
      idsOf(await service.listProducts({ brandId, status: 'draft', categoryId: catA, limit: 100 })),
    ).toEqual([ids.draftA]);
    expect(
      idsOf(await service.listProducts({ brandId, status: 'live', categoryId: catA, limit: 100 })),
    ).toEqual([ids.liveA]);
  });
});
