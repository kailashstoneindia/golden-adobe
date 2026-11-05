import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { MediaService } from '../media/media.service';
import { Category } from '../models/category.model';
import { Inventory } from '../models/inventory.model';
import { MasterProduct, MasterProductStatus, SaleUnitType } from '../models/master-product.model';
import { ProductFamily } from '../models/product-family.model';
import { StoneVariety } from '../models/stone-variety.model';
import { UnitOfMeasure } from '../models/unit-of-measure.model';
import { VendorListing, VendorListingStatus } from '../models/vendor-listing.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { User } from '../../users/models/user.model';

// Decision 0058 Task 8: the admin product popup shows the whole product and
// every vendor selling it.
describe('AdminCatalogService.getProduct (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  const suffix = `pd${Date.now()}`;
  const created: { model: { destroy: (o: object) => Promise<unknown> }; id: string }[] = [];
  const track = <T extends { id: string }>(model: unknown, row: T): T => {
    created.unshift({ model: model as never, id: row.id });
    return row;
  };

  let productId: string;
  let cheapVendorId: string;
  let pricierVendorId: string;

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
        { provide: CatalogAttributeResolverService, useValue: {} },
        { provide: MediaService, useValue: { listForProduct: async () => [] } },
      ],
    }).compile();
    service = moduleRef.get(AdminCatalogService);

    const vendorFor = async (label: string, isApproved: boolean) => {
      const user = track(
        User,
        await User.create({
          name: `PD ${label} ${suffix}`,
          phone: `3${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0').slice(0, 10),
          role: 'VENDOR',
          isApproved,
        } as never),
      );
      return track(
        Vendor,
        await Vendor.create({
          userId: user.id,
          shopName: `PD ${label} Shop ${suffix}`,
          address: 'Test Address',
          latitude: 28.6,
          longitude: 77.2,
        } as never),
      );
    };

    const category = track(
      Category,
      await Category.create({
        name: `PD Cat ${suffix}`,
        slug: `pd-cat-${suffix}`,
        level: 1,
        path: `pd-cat-${suffix}`,
        isLeaf: true,
      } as never),
    );
    const family = track(
      ProductFamily,
      await ProductFamily.create({
        name: `PD Family ${suffix}`,
        slug: `pd-family-${suffix}`,
      } as never),
    );
    const variety = track(
      StoneVariety,
      await StoneVariety.create({
        name: `PD Granite ${suffix}`,
        slug: `pd-granite-${suffix}`,
        stoneType: 'granite',
      } as never),
    );
    const unit = track(
      UnitOfMeasure,
      await UnitOfMeasure.create({ code: `PD${Date.now() % 1e9}`, name: `Box ${suffix}` } as never),
    );

    const cheap = await vendorFor('Cheap', true);
    const pricier = await vendorFor('Pricier', false);
    cheapVendorId = cheap.id;
    pricierVendorId = pricier.id;

    const product = track(
      MasterProduct,
      await MasterProduct.create({
        categoryId: category.id,
        productFamilyId: family.id,
        stoneVarietyId: variety.id,
        unitOfMeasureId: unit.id,
        name: `PD Product ${suffix}`,
        slug: `pd-product-${suffix}`,
        description: 'Polished slab for kitchen tops',
        status: MasterProductStatus.LIVE,
        saleUnitType: SaleUnitType.DISCRETE,
        packContentQty: 4,
        hasNaturalVariation: true,
        importerDetails: 'Imported by Stone Co, Jaipur',
      } as never),
    );
    productId = product.id;

    const cheapListing = track(
      VendorListing,
      await VendorListing.create({
        vendorId: cheap.id,
        masterProductId: product.id,
        price: 900,
        mrp: 1000,
        status: VendorListingStatus.ACTIVE,
      } as never),
    );
    track(
      Inventory,
      await Inventory.create({
        vendorListingId: cheapListing.id,
        quantityAvailable: 12,
        quantityReserved: 2,
      } as never),
    );
    track(
      VendorListing,
      await VendorListing.create({
        vendorId: pricier.id,
        masterProductId: product.id,
        price: 1200,
        status: VendorListingStatus.PAUSED,
      } as never),
    );
    await product.update({ cachedBestPrice: 900, cachedBestVendorListingId: cheapListing.id });
  });

  afterAll(async () => {
    for (const { model, id } of created) {
      await model.destroy({ where: { id } });
    }
    await moduleRef.close();
  });

  it('includes the description, family, variety, unit and sale facts', async () => {
    const product = await service.getProduct(productId);

    expect(product).toMatchObject({
      description: 'Polished slab for kitchen tops',
      productFamily: `PD Family ${suffix}`,
      stoneVariety: `PD Granite ${suffix}`,
      unitOfMeasure: `Box ${suffix}`,
      saleUnitType: 'discrete',
      packContentQty: 4,
      hasNaturalVariation: true,
      importerDetails: 'Imported by Stone Co, Jaipur',
      cachedBestPrice: 900,
      cachedBestVendorName: `PD Cheap Shop ${suffix}`,
    });
  });

  it('lists every vendor selling it, active first, with stock and approval', async () => {
    const { listings } = await service.getProduct(productId);

    expect(listings).toEqual([
      expect.objectContaining({
        vendorId: cheapVendorId,
        shopName: `PD Cheap Shop ${suffix}`,
        vendorApproved: true,
        price: 900,
        mrp: 1000,
        status: 'active',
        quantityAvailable: 12,
        quantityReserved: 2,
      }),
      expect.objectContaining({
        vendorId: pricierVendorId,
        vendorApproved: false,
        price: 1200,
        mrp: null,
        status: 'paused',
        quantityAvailable: null,
        quantityReserved: null,
      }),
    ]);
  });

  it('gives a product with no family, variety, unit or listings nulls and an empty list', async () => {
    const bare = await MasterProduct.create({
      categoryId: (await MasterProduct.findByPk(productId))!.categoryId,
      name: `PD Bare ${suffix}`,
      slug: `pd-bare-${suffix}`,
      status: MasterProductStatus.DRAFT,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    created.unshift({ model: MasterProduct as never, id: bare.id });

    expect(await service.getProduct(bare.id)).toMatchObject({
      description: null,
      productFamily: null,
      stoneVariety: null,
      unitOfMeasure: null,
      packContentQty: null,
      cachedBestPrice: null,
      cachedBestVendorName: null,
      listings: [],
    });
  });
});
