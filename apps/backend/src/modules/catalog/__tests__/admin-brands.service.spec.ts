import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { CatalogMergeLog } from '../models/catalog-merge-log.model';
import { MEDIA_STORAGE_CONFIG, OBJECT_STORAGE } from '../media/object-storage';
import { User } from '../../users/models/user.model';

// Decision 0063 / S2: admin brand management. Real Postgres, because the
// duplicate rule is the normalize_brand_name() unique index. The test DB has
// seeded brands (a real "Havells" among them), so names here carry a suffix.
describe('AdminBrandsService (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminBrandsService;
  let resolver: BrandResolverService;
  const suffix = `ab${Date.now()}`;
  let categoryId: string;
  let adminId: string;
  const storage = {
    presignPost: jest.fn(async (input: { key: string }) => ({
      url: 'https://upload.example.test',
      fields: { key: input.key },
    })),
    head: jest.fn(async (_key: string): Promise<{ contentLength: number } | null> => null),
  };
  const storageConfig = { enabled: true, publicBaseUrl: 'https://cdn.example.test/' };

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
      providers: [
        AdminBrandsService,
        BrandResolverService,
        { provide: OBJECT_STORAGE, useValue: storage },
        { provide: MEDIA_STORAGE_CONFIG, useValue: storageConfig },
      ],
    }).compile();
    service = moduleRef.get(AdminBrandsService);
    resolver = moduleRef.get(BrandResolverService);

    const category = await Category.create({
      name: `AB Cat ${suffix}`,
      slug: `ab-cat-${suffix}`,
      level: 1,
      path: `ab-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    const admin = await User.create({
      name: `AB Admin ${suffix}`,
      phone: `+91${suffix.slice(-10).padStart(10, '5')}`,
      role: 'ADMIN',
    } as never);
    adminId = admin.id;
  });

  afterAll(async () => {
    const mine = await Brand.findAll({ where: { name: { [Op.iLike]: `%${suffix}%` } } });
    const ids = mine.map((b) => b.id);
    await CatalogMergeLog.destroy({ where: { adminUserId: adminId } });
    await User.destroy({ where: { id: adminId } });
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

  describe('update and activation', () => {
    it('renames a brand and edits its compliance fields, keeping the slug', async () => {
      const brand = await service.create({ name: `Renamee${suffix}`, ...compliance });

      const updated = await service.update(brand.id, {
        name: `Renamed${suffix}`,
        consumerCareEmail: 'help@renamed.test',
      });

      expect(updated).toMatchObject({
        name: `Renamed${suffix}`,
        slug: brand.slug,
        consumerCareEmail: 'help@renamed.test',
        manufacturerAddress: compliance.manufacturerAddress,
      });
    });

    it('allows a rename that only changes case (same normalized name as itself)', async () => {
      const brand = await service.create({ name: `Casey${suffix}`, ...compliance });

      expect((await service.update(brand.id, { name: `CASEY${suffix}` })).name).toBe(
        `CASEY${suffix}`,
      );
    });

    it('refuses (409) a rename onto another brand by normalized name', async () => {
      await service.create({ name: `Taken${suffix}`, ...compliance });
      const brand = await service.create({ name: `Mover${suffix}`, ...compliance });

      await expect(
        service.update(brand.id, { name: `TAKEN${suffix.toUpperCase()} Ltd` }),
      ).rejects.toThrow(new ConflictException(`brand "Taken${suffix}" already exists`));
    });

    it('deactivating hides the brand from the active list and leaves its products alone', async () => {
      const brand = await service.create({ name: `Pauser${suffix}`, ...compliance });
      const product = await MasterProduct.create({
        categoryId,
        brandId: brand.id,
        name: `AB Pauser Product ${suffix}`,
        slug: `ab-pauser-product-${suffix}`,
        mfrPartNumber: `AB-P-${suffix}`,
        status: MasterProductStatus.LIVE,
      } as never);

      const result = await service.setActive(brand.id, false);

      expect(result.isActive).toBe(false);
      const active = await service.list({ search: `pauser${suffix}`, isActive: true });
      expect(active.items).toEqual([]);
      const reloaded = await MasterProduct.findByPk(product.id);
      expect(reloaded).toMatchObject({ brandId: brand.id, status: MasterProductStatus.LIVE });
    });

    it('refuses (400) to edit or reactivate a brand that was merged away', async () => {
      const target = await service.create({ name: `MergeTarget${suffix}`, ...compliance });
      const merged = await service.create({ name: `MergedAway${suffix}`, ...compliance });
      await Brand.update({ mergedIntoId: target.id, isActive: false } as never, {
        where: { id: merged.id },
      });

      await expect(service.update(merged.id, { name: `Revived${suffix}` })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.setActive(merged.id, true)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update refuses (404) an unknown brand', async () => {
      await expect(
        service.update('00000000-0000-4000-8000-000000000000', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('aliases', () => {
    it('an added alias resolves to the brand', async () => {
      const brand = await service.create({ name: `Hilco${suffix}`, ...compliance });

      const result = await service.addAlias(brand.id, `H.I.L ${suffix}`);

      expect(result.aliases).toContain(`h.i.l ${suffix}`);
      expect((await resolver.resolve(`h.i.l ${suffix}`))?.id).toBe(brand.id);
    });

    it('refuses (409) an alias another brand already uses, and keeps it on that brand', async () => {
      const first = await service.create({ name: `FirstOwner${suffix}`, ...compliance });
      const second = await service.create({ name: `SecondOwner${suffix}`, ...compliance });
      await service.addAlias(first.id, `shared ${suffix}`);

      await expect(service.addAlias(second.id, `SHARED ${suffix}`)).rejects.toThrow(
        new ConflictException(
          `alias "shared ${suffix}" already belongs to brand "FirstOwner${suffix}"`,
        ),
      );
      expect((await resolver.resolve(`shared ${suffix}`))?.id).toBe(first.id);
    });

    it('refuses (409) an alias that is another brand’s own name', async () => {
      // Aliases are checked first, so this would steal that brand's name.
      await service.create({ name: `Proper${suffix}`, ...compliance });
      const thief = await service.create({ name: `Thief${suffix}`, ...compliance });

      await expect(service.addAlias(thief.id, `proper${suffix} ltd`)).rejects.toThrow(
        new ConflictException(`"proper${suffix} ltd" is the name of brand "Proper${suffix}"`),
      );
    });

    it('removes an alias', async () => {
      const brand = await service.create({ name: `Dropper${suffix}`, ...compliance });
      await service.addAlias(brand.id, `drop me ${suffix}`);
      const [alias] = await resolver.listAliases(brand.id);

      const result = await service.removeAlias(brand.id, alias.id);

      expect(result.aliases).toEqual([]);
      expect(await resolver.resolve(`drop me ${suffix}`)).toBeNull();
    });
  });

  describe('logo', () => {
    const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    let brandId: string;

    beforeAll(async () => {
      brandId = (await service.create({ name: `Logoed${suffix}`, ...compliance })).id;
    });

    beforeEach(() => jest.clearAllMocks());

    it('presigns an upload under the brand’s own public logo prefix', async () => {
      const result = await service.createLogoUploadUrl(brandId, 'image/png');

      expect(result.key).toMatch(new RegExp(`^variants/brands/${brandId}/logo-${UUID}\\.png$`));
      expect(storage.presignPost).toHaveBeenCalledWith(
        expect.objectContaining({
          key: result.key,
          contentType: 'image/png',
          maxBytes: 2 * 1024 * 1024,
        }),
      );
    });

    it.each(['application/pdf', 'image/svg+xml', 'text/html'])(
      'refuses (400) content type %s',
      async (contentType) => {
        await expect(service.createLogoUploadUrl(brandId, contentType)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(storage.presignPost).not.toHaveBeenCalled();
      },
    );

    it('refuses (404) an upload URL for an unknown brand', async () => {
      await expect(
        service.createLogoUploadUrl('00000000-0000-4000-8000-000000000000', 'image/png'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses (503) when this server has no media storage', async () => {
      storageConfig.enabled = false;
      try {
        await expect(service.createLogoUploadUrl(brandId, 'image/png')).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      } finally {
        storageConfig.enabled = true;
      }
    });

    it('confirm refuses (400) a key outside this brand’s logo prefix', async () => {
      const other = await service.create({ name: `OtherLogo${suffix}`, ...compliance });
      storage.head.mockResolvedValue({ contentLength: 10 });

      for (const key of [
        `variants/brands/${other.id}/logo-x.png`,
        `variants/products/${brandId}/x/thumb.webp`,
        `variants/brands/${brandId}/../${other.id}/logo-x.png`,
      ]) {
        await expect(service.confirmLogo(brandId, key)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect((await service.get(brandId)).logoUrl).toBeNull();
    });

    it('confirm refuses (400) a key with no uploaded object', async () => {
      storage.head.mockResolvedValue(null);
      const { key } = await service.createLogoUploadUrl(brandId, 'image/webp');

      await expect(service.confirmLogo(brandId, key)).rejects.toBeInstanceOf(BadRequestException);
      expect((await service.get(brandId)).logoUrl).toBeNull();
    });

    it('confirm sets the public logo URL', async () => {
      const { key } = await service.createLogoUploadUrl(brandId, 'image/jpeg');
      storage.head.mockResolvedValue({ contentLength: 2048 });

      const result = await service.confirmLogo(brandId, key);

      expect(storage.head).toHaveBeenCalledWith(key);
      expect(result.logoUrl).toBe(`https://cdn.example.test/${key}`);
    });
  });

  describe('merge', () => {
    let n = 0;
    const product = (brandId: string, mpn: string) => {
      n += 1;
      return MasterProduct.create({
        categoryId,
        brandId,
        name: `AB Merge Product ${n} ${suffix}`,
        slug: `ab-merge-product-${n}-${suffix}`,
        mfrPartNumber: mpn,
        status: MasterProductStatus.DRAFT,
      } as never);
    };
    const countFor = (brandId: string) => MasterProduct.count({ where: { brandId } });

    it('moves products and aliases to the target, retires the source, and logs it', async () => {
      const into = await service.create({ name: `Keeper${suffix}`, ...compliance });
      const from = await service.create({ name: `Duplicate${suffix}`, ...compliance });
      await service.addAlias(from.id, `dup co ${suffix}`);
      const p1 = await product(from.id, `MRG-A-${suffix}`);
      const p2 = await product(from.id, `MRG-B-${suffix}`);
      await product(into.id, `MRG-C-${suffix}`);

      const result = await service.merge(adminId, from.id, into.id);

      expect(result).toEqual({ movedProducts: 2, aliasesAdded: 2 });
      expect((await MasterProduct.findByPk(p1.id))?.brandId).toBe(into.id);
      expect((await MasterProduct.findByPk(p2.id))?.brandId).toBe(into.id);
      expect(await countFor(into.id)).toBe(3);

      const source = await Brand.findByPk(from.id);
      expect(source).toMatchObject({ isActive: false, mergedIntoId: into.id });
      expect((await service.get(into.id)).aliases).toEqual(
        expect.arrayContaining([`dup co ${suffix}`, `duplicate${suffix}`]),
      );

      expect((await resolver.resolve(`Duplicate${suffix}`))?.id).toBe(into.id);
      expect((await resolver.resolve(`dup co ${suffix}`))?.id).toBe(into.id);

      const log = await CatalogMergeLog.findOne({ where: { fromId: from.id } });
      expect(log).toMatchObject({
        entityType: 'brand',
        intoId: into.id,
        adminUserId: adminId,
        summary: expect.objectContaining({ movedProducts: 2, aliasesAdded: 2 }),
      });
    });

    it('refuses (409) when a part number exists under both brands, listing it, and moves nothing', async () => {
      const into = await service.create({ name: `ClashKeep${suffix}`, ...compliance });
      const from = await service.create({ name: `ClashDup${suffix}`, ...compliance });
      await service.addAlias(from.id, `clash alias ${suffix}`);
      await product(from.id, `CLASH-1-${suffix}`);
      await product(from.id, `FREE-1-${suffix}`);
      await product(into.id, `CLASH-1-${suffix}`);

      await expect(service.merge(adminId, from.id, into.id)).rejects.toThrow(
        new ConflictException(
          `both brands have part number CLASH-1-${suffix}. Merge or fix those products first`,
        ),
      );

      expect(await countFor(from.id)).toBe(2);
      expect(await countFor(into.id)).toBe(1);
      expect(await Brand.findByPk(from.id)).toMatchObject({ isActive: true, mergedIntoId: null });
      expect((await resolver.resolve(`clash alias ${suffix}`))?.id).toBe(from.id);
      expect(await CatalogMergeLog.count({ where: { fromId: from.id } })).toBe(0);
    });

    it('refuses (400) merging a brand into itself', async () => {
      const brand = await service.create({ name: `Selfie${suffix}`, ...compliance });

      await expect(service.merge(adminId, brand.id, brand.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses (400) merging into an inactive brand', async () => {
      const into = await service.create({ name: `SleepyTarget${suffix}`, ...compliance });
      const from = await service.create({ name: `AwakeSource${suffix}`, ...compliance });
      await service.setActive(into.id, false);

      await expect(service.merge(adminId, from.id, into.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses (400) merging a brand that was already merged', async () => {
      const into = await service.create({ name: `Final${suffix}`, ...compliance });
      const from = await service.create({ name: `Twice${suffix}`, ...compliance });
      await service.merge(adminId, from.id, into.id);
      const other = await service.create({ name: `Elsewhere${suffix}`, ...compliance });

      await expect(service.merge(adminId, from.id, other.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses (404) an unknown brand on either side', async () => {
      const brand = await service.create({ name: `Lonely${suffix}`, ...compliance });
      const missing = '00000000-0000-4000-8000-000000000000';

      await expect(service.merge(adminId, missing, brand.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.merge(adminId, brand.id, missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
