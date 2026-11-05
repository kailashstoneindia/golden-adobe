import { Logger, NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
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
