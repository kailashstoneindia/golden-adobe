import { ConflictException, NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Op } from 'sequelize';

import { CATALOG_TEST_MODELS } from './test-db';
import { AdminBrandsService } from '../admin-brands.service';
import { BrandResolverService } from '../brand-resolver.service';
import { Brand } from '../models/brand.model';
import { BrandAlias } from '../models/brand-alias.model';
import { Category } from '../models/category.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';

// Decision 0063 / S2: admin brand management. Real Postgres, because the
// duplicate rule is the normalize_brand_name() unique index. The test DB has
// seeded brands (a real "Havells" among them), so names here carry a suffix.
describe('AdminBrandsService (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminBrandsService;
  const suffix = `ab${Date.now()}`;
  let categoryId: string;

  const compliance = {
    manufacturerName: 'Zorvex Electric Pvt Ltd',
    manufacturerAddress: '12 Industrial Area, Noida',
    consumerCareEmail: 'care@zorvex.test',
    consumerCarePhone: '+91 1800 200 300',
  };

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
      providers: [AdminBrandsService, BrandResolverService],
    }).compile();
    service = moduleRef.get(AdminBrandsService);

    const category = await Category.create({
      name: `AB Cat ${suffix}`,
      slug: `ab-cat-${suffix}`,
      level: 1,
      path: `ab-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;
  });

  afterAll(async () => {
    const mine = await Brand.findAll({ where: { name: { [Op.iLike]: `%${suffix}%` } } });
    const ids = mine.map((b) => b.id);
    await MasterProduct.destroy({ where: { categoryId } });
    await BrandAlias.destroy({ where: { brandId: ids } });
    await Brand.update({ mergedIntoId: null } as never, { where: { id: ids } });
    await Brand.destroy({ where: { id: ids } });
    await Category.destroy({ where: { id: categoryId } });
    await moduleRef.close();
  });

  describe('create', () => {
    it('stores the four compliance fields and a slug made from the name', async () => {
      const brand = await service.create({ name: `Zorvex${suffix} India`, ...compliance });

      expect(brand).toMatchObject({
        name: `Zorvex${suffix} India`,
        slug: `zorvex${suffix}-india`,
        ...compliance,
        isActive: true,
        mergedIntoId: null,
        logoUrl: null,
        productCount: 0,
        aliases: [],
      });
    });

    it('refuses (409) a brand whose normalized name already exists, naming the existing brand', async () => {
      await expect(
        service.create({ name: `ZORVEX${suffix.toUpperCase()} Ltd`, ...compliance }),
      ).rejects.toThrow(new ConflictException(`brand "Zorvex${suffix} India" already exists`));
    });

    it('refuses (409) a name that is already an alias of another brand', async () => {
      // The resolver checks aliases first, so such a brand could never be
      // found by its own name.
      const owner = await service.create({ name: `Owner${suffix}`, ...compliance });
      await BrandAlias.create({ brandId: owner.id, alias: `kestrel${suffix}` } as never);

      await expect(service.create({ name: `Kestrel${suffix}`, ...compliance })).rejects.toThrow(
        new ConflictException(`"Kestrel${suffix}" is already an alias of brand "Owner${suffix}"`),
      );
    });

    it('adds a numeric suffix when the slug is already taken', async () => {
      // "-India" (no space) is not stripped by normalize_brand_name, so the
      // name is distinct while the slug is the same.
      const brand = await service.create({ name: `Zorvex${suffix}-India`, ...compliance });

      expect(brand.slug).toBe(`zorvex${suffix}-india-2`);
    });
  });

  describe('list and get', () => {
    it('finds a brand by part of its name and counts its products', async () => {
      const brand = await service.create({ name: `Halcyon${suffix}`, ...compliance });
      await MasterProduct.create({
        categoryId,
        brandId: brand.id,
        name: `AB Product ${suffix}`,
        slug: `ab-product-${suffix}`,
        mfrPartNumber: `AB-${suffix}`,
        status: MasterProductStatus.DRAFT,
      } as never);

      const page = await service.list({ search: `halcyon${suffix}` });

      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({ id: brand.id, productCount: 1 });
    });

    it('filters by active state', async () => {
      const inactive = await service.create({ name: `Dormant${suffix}`, ...compliance });
      await Brand.update({ isActive: false } as never, { where: { id: inactive.id } });

      const inactiveIds = (
        await service.list({ search: suffix, isActive: false, limit: 100 })
      ).items.map((b) => b.id);
      const activeIds = (
        await service.list({ search: suffix, isActive: true, limit: 100 })
      ).items.map((b) => b.id);

      expect(inactiveIds).toContain(inactive.id);
      expect(activeIds).not.toContain(inactive.id);
    });

    it('get returns the brand with its aliases', async () => {
      const brand = await service.create({ name: `Aliased${suffix}`, ...compliance });
      await BrandAlias.create({ brandId: brand.id, alias: `aliased co ${suffix}` } as never);

      expect((await service.get(brand.id)).aliases).toEqual([`aliased co ${suffix}`]);
    });

    it('get refuses (404) an unknown brand', async () => {
      await expect(service.get('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
