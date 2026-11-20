import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { ProductReadinessService } from '../product-readiness.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { MediaService } from '../media/media.service';
import { Category } from '../models/category.model';
import { MasterProduct, MasterProductStatus, SaleUnitType } from '../models/master-product.model';

// Decision 0058 Task 13: an admin corrects a product's name.
describe('AdminCatalogService.updateProduct (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const suffix = `pe${Date.now()}`;
  const ADMIN = 'admin-1';
  let categoryId: string;
  let productId: string;

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
        BrandResolverService,
        ProductReadinessService,
        {
          provide: CatalogAttributeResolverService,
          useValue: { resolveEffectiveAttributes: async () => [] },
        },
        { provide: MediaService, useValue: { listForProduct: async () => [] } },
      ],
    }).compile();
    service = moduleRef.get(AdminCatalogService);

    const category = await Category.create({
      name: `PE Cat ${suffix}`,
      slug: `pe-cat-${suffix}`,
      level: 1,
      path: `pe-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;
    const product = await MasterProduct.create({
      categoryId,
      name: `PE Slab ${suffix}`,
      slug: `pe-slab-${suffix}`,
      status: MasterProductStatus.DRAFT,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    productId = product.id;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await MasterProduct.destroy({ where: { id: productId } });
    await Category.destroy({ where: { id: categoryId } });
    await moduleRef.close();
  });

  it('renames the product and answers with the full detail', async () => {
    const result = await service.updateProduct(productId, ADMIN, {
      name: `PE Slab Fixed ${suffix}`,
    });

    expect(result).toMatchObject({ id: productId, name: `PE Slab Fixed ${suffix}` });
    expect(result).toHaveProperty('listings');
    expect((await MasterProduct.findByPk(productId))!.name).toBe(`PE Slab Fixed ${suffix}`);
  });

  it('logs which admin changed which field', async () => {
    const log = jest.spyOn(Logger.prototype, 'log');

    await service.updateProduct(productId, ADMIN, { name: `PE Slab Again ${suffix}` });

    expect(log.mock.calls.map((call) => String(call[0]))).toContain(
      `admin ${ADMIN} update product ${productId} name`,
    );
  });

  it('writes and logs nothing when the name is the same', async () => {
    const current = (await MasterProduct.findByPk(productId))!;
    const before = current.updatedAt.getTime();
    const log = jest.spyOn(Logger.prototype, 'log');

    await service.updateProduct(productId, ADMIN, { name: current.name });

    expect((await MasterProduct.findByPk(productId))!.updatedAt.getTime()).toBe(before);
    expect(
      log.mock.calls.map((call) => String(call[0])).filter((l) => l.startsWith('admin ')),
    ).toEqual([]);
  });

  it('logs the attribute values as changed when a set is sent', async () => {
    const log = jest.spyOn(Logger.prototype, 'log');

    await service.updateProduct(productId, ADMIN, { attributeValues: [] });

    expect(log.mock.calls.map((call) => String(call[0]))).toContain(
      `admin ${ADMIN} update product ${productId} attributeValues`,
    );
  });

  it('404s for an unknown product', async () => {
    await expect(
      service.updateProduct('11111111-1111-4111-8111-111111111111', ADMIN, { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });
});

// Decision 0063 / S4 Task 3: every field except the category can be corrected.
describe('AdminCatalogService.updateProduct, all fields (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const suffix = `pf${Date.now()}`;
  const fx = catalogFixtures(suffix);
  const ADMIN = 'admin-1';
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
        BrandResolverService,
        ProductReadinessService,
        {
          provide: CatalogAttributeResolverService,
          useValue: { resolveEffectiveAttributes: async () => [] },
        },
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

  const branded = async (over: Record<string, unknown> = {}) => {
    const brand = await fx.brand();
    return fx.product(categoryId, { isGeneric: false, brandId: brand.id, ...over });
  };
  const reload = async (id: string) => (await MasterProduct.findByPk(id))!;

  it('moves a product to another active brand', async () => {
    const product = await branded();
    const other = await fx.brand('Other');

    await service.updateProduct(product.id, ADMIN, { brandId: other.id });

    expect((await reload(product.id)).brandId).toBe(other.id);
  });

  it('refuses (400) a deactivated or merged brand, and an unknown one', async () => {
    const product = await branded();
    const keeper = await fx.brand('Keeper');
    const inactive = await fx.brand('Inactive', { isActive: false });
    const merged = await fx.brand('Merged', { mergedIntoId: keeper.id });

    for (const brandId of [inactive.id, merged.id, '00000000-0000-4000-8000-000000000000']) {
      await expect(service.updateProduct(product.id, ADMIN, { brandId })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect((await reload(product.id)).brandId).toBe(product.brandId);
  });

  it('refuses (400) a brand on a generic product', async () => {
    const product = await fx.product(categoryId);
    const brand = await fx.brand();

    await expect(service.updateProduct(product.id, ADMIN, { brandId: brand.id })).rejects.toThrow(
      new BadRequestException('a generic product has no brand'),
    );
  });

  it('refuses (400) a part number another product of the same brand already has', async () => {
    const first = await branded({ mfrPartNumber: `PF-A-${suffix}` });
    const second = await fx.product(categoryId, {
      isGeneric: false,
      brandId: first.brandId,
      mfrPartNumber: `PF-B-${suffix}`,
    });

    await expect(
      service.updateProduct(second.id, ADMIN, { mfrPartNumber: `PF-A-${suffix}` }),
    ).rejects.toThrow(new BadRequestException('a product with this brand and MPN already exists'));
  });

  it('refuses (400) a GTIN another product already has', async () => {
    const gtin = String(Date.now()).slice(-13).padStart(13, '8');
    await branded({ gtin });
    const product = await branded();

    await expect(service.updateProduct(product.id, ADMIN, { gtin })).rejects.toThrow(
      new BadRequestException('a product with this GTIN already exists'),
    );
  });

  it('copies the GST rate of a new HSN code, unless a rate is sent too', async () => {
    const product = await branded({ gstRate: 5 });

    await service.updateProduct(product.id, ADMIN, { hsnCode: '8536' });
    expect(await reload(product.id)).toMatchObject({ hsnCode: '8536', gstRate: '18.00' });

    await service.updateProduct(product.id, ADMIN, { hsnCode: '8537', gstRate: 12 });
    expect(await reload(product.id)).toMatchObject({ hsnCode: '8537', gstRate: '12.00' });
  });

  it('refuses (400) an unknown HSN code, naming it', async () => {
    const product = await branded();

    await expect(service.updateProduct(product.id, ADMIN, { hsnCode: '0000' })).rejects.toThrow(
      new BadRequestException('HSN code "0000" is not in the list. Add it first'),
    );
  });

  it('clears the part number and edits origin and importer details', async () => {
    const product = await branded({ mfrPartNumber: `PF-C-${suffix}` });

    await service.updateProduct(product.id, ADMIN, {
      mfrPartNumber: null,
      countryOfOrigin: 'Italy',
      importerDetails: 'Imported by Kailash Stones, Jaipur',
    });

    expect(await reload(product.id)).toMatchObject({
      mfrPartNumber: null,
      countryOfOrigin: 'Italy',
      importerDetails: 'Imported by Kailash Stones, Jaipur',
    });
  });

  it('a rename keeps the slug and product code, and a live product stays live', async () => {
    const product = await branded({ status: MasterProductStatus.LIVE });

    await service.updateProduct(product.id, ADMIN, { name: `Renamed ${suffix}` });

    expect(await reload(product.id)).toMatchObject({
      name: `Renamed ${suffix}`,
      slug: product.slug,
      productCode: product.productCode,
      status: MasterProductStatus.LIVE,
    });
  });

  it('logs every changed field', async () => {
    const product = await branded();
    const log = jest.spyOn(Logger.prototype, 'log');

    await service.updateProduct(product.id, ADMIN, { countryOfOrigin: 'Spain', gtin: null });

    expect(log.mock.calls.map((call) => String(call[0]))).toContain(
      `admin ${ADMIN} update product ${product.id} countryOfOrigin`,
    );
    log.mockRestore();
  });
});
