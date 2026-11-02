import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { CATALOG_TEST_MODELS, createTestSequelize } from './test-db';
import { VendorListingsService } from '../vendor-listings.service';
import { StockService } from '../stock.service';
import { VendorCategoriesService } from '../vendor-categories.service';
import { Category } from '../models/category.model';
import { MasterProduct, MasterProductStatus, SaleUnitType } from '../models/master-product.model';
import { VendorListing, VendorListingStatus } from '../models/vendor-listing.model';
import { Inventory } from '../models/inventory.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { User } from '../../users/models/user.model';

// Decision 0053 — a vendor creating ONE listing against an existing, live
// master_product, without a bulk sheet upload. No match ladder involved:
// the vendor already picked an exact masterProductId (via the search
// endpoint), so there is no ambiguity to resolve here.
describe('VendorListingsService.createListing (integration)', () => {
  let moduleRef: TestingModule;
  let service: VendorListingsService;
  const suffix = `t${Date.now()}`;

  let vendorId: string;
  let categoryId: string;
  let liveProductId: string;
  let draftProductId: string;
  let paintProductId: string;

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
      providers: [VendorListingsService, StockService, VendorCategoriesService],
    }).compile();
    service = moduleRef.get(VendorListingsService);

    const user = await User.create({
      name: `VLS Test Vendor ${suffix}`,
      phone: `+91${suffix.slice(-10).padStart(10, '7')}`,
      role: 'VENDOR',
    } as never);
    const vendor = await Vendor.create({
      userId: user.id,
      shopName: `VLS Test Shop ${suffix}`,
      address: 'Test Address',
      latitude: 28.6,
      longitude: 77.2,
    } as never);
    vendorId = vendor.id;

    const category = await Category.create({
      name: `VLS Test Cat ${suffix}`,
      slug: `vls-test-cat-${suffix}`,
      level: 1,
      path: `vls-test-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    const liveProduct = await MasterProduct.create({
      categoryId,
      name: `VLS Live Widget ${suffix}`,
      slug: `vls-live-widget-${suffix}`,
      status: MasterProductStatus.LIVE,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    liveProductId = liveProduct.id;

    const draftProduct = await MasterProduct.create({
      categoryId,
      name: `VLS Draft Widget ${suffix}`,
      slug: `vls-draft-widget-${suffix}`,
      status: MasterProductStatus.DRAFT,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    draftProductId = draftProduct.id;

    const paintProduct = await MasterProduct.create({
      categoryId,
      name: `VLS Paint Widget ${suffix}`,
      slug: `vls-paint-widget-${suffix}`,
      status: MasterProductStatus.LIVE,
      saleUnitType: SaleUnitType.TINTED_TO_ORDER,
    } as never);
    paintProductId = paintProduct.id;
  });

  afterAll(async () => {
    await moduleRef.close();
    const sequelize = createTestSequelize();
    await sequelize.close();
  });

  it('creates an active listing against a live product', async () => {
    const result = await service.createListing(vendorId, {
      masterProductId: liveProductId,
      price: 499,
    });
    expect(result.status).toBe(VendorListingStatus.ACTIVE);
    expect(result.masterProductId).toBe(liveProductId);
    expect(Number(result.price)).toBe(499);
  });

  it('rejects a product that is not live', async () => {
    await expect(
      service.createListing(vendorId, { masterProductId: draftProductId, price: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s for an unknown masterProductId', async () => {
    await expect(
      service.createListing(vendorId, {
        masterProductId: '00000000-0000-0000-0000-000000000000',
        price: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a duplicate (vendor, product, grade) with a 409 naming the existing listing', async () => {
    await service.createListing(vendorId, {
      masterProductId: liveProductId,
      price: 1,
      statedGrade: 'dup-test',
    });
    await expect(
      service.createListing(vendorId, {
        masterProductId: liveProductId,
        price: 2,
        statedGrade: 'dup-test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes initial stock in the same call when given', async () => {
    const result = await service.createListing(vendorId, {
      masterProductId: liveProductId,
      price: 50,
      statedGrade: `stock-test-${suffix}`,
      initialQuantityAvailable: 25,
    });
    const inventory = await Inventory.findOne({ where: { vendorListingId: result.id } as never });
    expect(Number(inventory?.quantityAvailable)).toBe(25);
  });

  it('creates a paint listing with supportsTinting true, and no inventory row', async () => {
    const result = await service.createListing(vendorId, {
      masterProductId: paintProductId,
      price: 300,
    });
    const listing = await VendorListing.findByPk(result.id);
    expect(listing?.supportsTinting).toBe(true);
    const inventory = await Inventory.findOne({ where: { vendorListingId: result.id } as never });
    expect(inventory).toBeNull();
  });

  it('rejects initialQuantityAvailable for a paint product', async () => {
    await expect(
      service.createListing(vendorId, {
        masterProductId: paintProductId,
        price: 300,
        statedGrade: `paint-stock-reject-${suffix}`,
        initialQuantityAvailable: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
