import { BadRequestException, ConflictException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { MediaService } from '../media/media.service';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { MasterProductMedia } from '../models/master-product-media.model';
import { VendorListing, VendorListingStatus } from '../models/vendor-listing.model';
import { ProductReadinessService } from '../product-readiness.service';

// Decision 0063 / S4 Task 4: a mistaken product can be retired, restored to
// draft, or (if nothing depends on it) deleted.
describe('Retire, restore and delete products (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const fx = catalogFixtures(`rt${Date.now()}`);
  let categoryId: string;
  // Stands in for S3: removes the row as MediaService.remove would, and
  // records which images were removed (their objects go with them).
  const media = {
    listForProduct: async () => [],
    remove: jest.fn(async (_productId: string, mediaId: string) => {
      await MasterProductMedia.destroy({ where: { id: mediaId } });
    }),
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
        AdminCatalogService,
        ProductReadinessService,
        CatalogAttributeResolverService,
        BrandResolverService,
        { provide: MediaService, useValue: media },
      ],
    }).compile();
    service = moduleRef.get(AdminCatalogService);
    categoryId = (await fx.category()).id;
  });

  afterAll(async () => {
    await fx.cleanup();
    await moduleRef.close();
  });

  beforeEach(() => media.remove.mockClear());

  const statusOf = async (id: string) => (await MasterProduct.findByPk(id))?.status;
  const listingStatus = async (id: string) => (await VendorListing.findByPk(id))!.status;

  describe('retire', () => {
    it('deprecates the product and pauses its active listings', async () => {
      const product = await fx.product(categoryId, { status: MasterProductStatus.LIVE });
      const vendorA = await fx.vendor();
      const vendorB = await fx.vendor();
      const active = await fx.listing(vendorA.id, product.id);
      const outOfStock = await fx.listing(vendorB.id, product.id, VendorListingStatus.OUT_OF_STOCK);

      await service.retireProduct(product.id, 'admin-1');

      expect(await statusOf(product.id)).toBe(MasterProductStatus.DEPRECATED);
      expect(await listingStatus(active.id)).toBe(VendorListingStatus.PAUSED);
      expect(await listingStatus(outOfStock.id)).toBe(VendorListingStatus.OUT_OF_STOCK);
    });

    it('refuses (400) to retire a product that is already retired', async () => {
      const product = await fx.product(categoryId, { status: MasterProductStatus.DEPRECATED });

      await expect(service.retireProduct(product.id, 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('restore', () => {
    it('returns a retired product to draft, never straight to live', async () => {
      const product = await fx.product(categoryId, { status: MasterProductStatus.DEPRECATED });

      await service.restoreProduct(product.id, 'admin-1');

      expect(await statusOf(product.id)).toBe(MasterProductStatus.DRAFT);
    });

    it('refuses (400) to restore a product that is not retired', async () => {
      const product = await fx.product(categoryId);

      await expect(service.restoreProduct(product.id, 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses (400) to publish or unpublish a retired product: restore it first', async () => {
      const product = await fx.product(categoryId, { status: MasterProductStatus.DEPRECATED });
      await fx.image(product.id);

      for (const status of ['live', 'draft'] as const) {
        await expect(service.setProductStatus(product.id, status)).rejects.toThrow(
          new BadRequestException('This product is retired. Restore it to draft first'),
        );
      }
    });
  });

  describe('delete', () => {
    it('deletes a draft with no listings, removing its images through MediaService', async () => {
      const product = await fx.product(categoryId);
      const first = await fx.image(product.id);
      const second = await fx.image(product.id, { isPrimary: false });

      await service.deleteProduct(product.id, 'admin-1');

      expect(await MasterProduct.findByPk(product.id)).toBeNull();
      expect(media.remove.mock.calls.map((call) => call[1]).sort()).toEqual(
        [first.id, second.id].sort(),
      );
    });

    it('refuses (409) to delete a live product', async () => {
      const product = await fx.product(categoryId, { status: MasterProductStatus.LIVE });

      await expect(service.deleteProduct(product.id, 'admin-1')).rejects.toThrow(
        new ConflictException(
          'Only a draft with no listings, orders or import rows can be deleted. Retire it instead',
        ),
      );
      expect(await statusOf(product.id)).toBe(MasterProductStatus.LIVE);
    });

    it('refuses (409) to delete a draft that a vendor lists', async () => {
      const product = await fx.product(categoryId);
      await fx.image(product.id);
      await fx.listing((await fx.vendor()).id, product.id, VendorListingStatus.PAUSED);

      await expect(service.deleteProduct(product.id, 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(await MasterProduct.findByPk(product.id)).not.toBeNull();
      expect(media.remove).not.toHaveBeenCalled();
    });
  });
});
