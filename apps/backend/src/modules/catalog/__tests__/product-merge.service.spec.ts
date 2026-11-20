import { BadRequestException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { ProductMergeService } from '../product-merge.service';
import { CatalogMergeLog } from '../models/catalog-merge-log.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { MasterProductMedia } from '../models/master-product-media.model';
import { VendorListing, VendorListingStatus } from '../models/vendor-listing.model';
import { VendorProductMap } from '../models/vendor-product-map.model';
import { User } from '../../users/models/user.model';

// Decision 0063 / S5: fold a duplicate product into the one that stays.
// Nothing is deleted: a listing that would clash is paused on the source.
describe('ProductMergeService (integration)', () => {
  let moduleRef: TestingModule;
  let service: ProductMergeService;
  let sequelize: Sequelize;
  const suffix = `pm${Date.now()}`;
  const fx = catalogFixtures(suffix);
  let categoryId: string;
  let otherCategoryId: string;
  let adminId: string;

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
      providers: [ProductMergeService],
    }).compile();
    service = moduleRef.get(ProductMergeService);
    sequelize = moduleRef.get(Sequelize);

    categoryId = (await fx.category()).id;
    otherCategoryId = (await fx.category()).id;
    adminId = fx.track(
      User,
      await User.create({
        name: `PM Admin ${suffix}`,
        phone: `+91${String(Date.now()).slice(-10)}`,
        role: 'ADMIN',
      } as never),
    ).id;
  });

  afterAll(async () => {
    await CatalogMergeLog.destroy({ where: { adminUserId: adminId } });
    await fx.cleanup();
    await moduleRef.close();
  });

  const pair = async () => ({
    source: await fx.product(categoryId),
    target: await fx.product(categoryId),
  });
  const reload = async (id: string) => (await MasterProduct.findByPk(id))!;
  const listing = async (id: string) => (await VendorListing.findByPk(id))!;

  it('re-points a listing that only the source has', async () => {
    const { source, target } = await pair();
    const vendor = await fx.vendor();
    const only = await fx.listing(vendor.id, source.id);

    const result = await service.merge(adminId, source.id, target.id);

    expect(result.movedListings).toBe(1);
    expect(result.pausedListings).toEqual([]);
    expect((await listing(only.id)).masterProductId).toBe(target.id);
  });

  it('pauses (never deletes) the source listing of a vendor who sells both', async () => {
    const { source, target } = await pair();
    const vendor = await fx.vendor();
    const onSource = await fx.listing(vendor.id, source.id);
    const onTarget = await fx.listing(vendor.id, target.id, VendorListingStatus.ACTIVE, {
      price: 700,
    });
    const before = await VendorListing.count({ where: { vendorId: vendor.id } });

    const result = await service.merge(adminId, source.id, target.id);

    expect(result.movedListings).toBe(0);
    expect(result.pausedListings).toEqual([
      { listingId: onSource.id, vendorName: vendor.shopName, reason: expect.any(String) },
    ]);
    expect(await listing(onSource.id)).toMatchObject({
      masterProductId: source.id,
      status: VendorListingStatus.PAUSED,
    });
    expect(await listing(onTarget.id)).toMatchObject({
      masterProductId: target.id,
      status: VendorListingStatus.ACTIVE,
      price: '700.00',
    });
    expect(await VendorListing.count({ where: { vendorId: vendor.id } })).toBe(before);
  });

  it('moves the vendor SKU mappings to the target', async () => {
    const { source, target } = await pair();
    const vendor = await fx.vendor();
    await VendorProductMap.create({
      vendorId: vendor.id,
      vendorSku: `SKU-${suffix}`,
      masterProductId: source.id,
      confirmedBy: 'test',
      confirmedAt: new Date(),
    } as never);

    const result = await service.merge(adminId, source.id, target.id);

    expect(result.movedMappings).toBe(1);
    expect(
      (
        await VendorProductMap.findOne({
          where: { vendorId: vendor.id, vendorSku: `SKU-${suffix}` },
        })
      )?.masterProductId,
    ).toBe(target.id);
  });

  it('moves the images only when the target has none', async () => {
    const empty = await pair();
    const picture = await fx.image(empty.source.id);
    expect((await service.merge(adminId, empty.source.id, empty.target.id)).mediaMoved).toBe(true);
    expect((await MasterProductMedia.findByPk(picture.id))?.masterProductId).toBe(empty.target.id);

    const both = await pair();
    const kept = await fx.image(both.source.id);
    await fx.image(both.target.id);
    expect((await service.merge(adminId, both.source.id, both.target.id)).mediaMoved).toBe(false);
    expect((await MasterProductMedia.findByPk(kept.id))?.masterProductId).toBe(both.source.id);
  });

  it('retires the source, points it at the target, and logs the merge', async () => {
    const { source, target } = await pair();

    const result = await service.merge(adminId, source.id, target.id);

    const merged = await reload(source.id);
    expect(merged).toMatchObject({
      status: MasterProductStatus.DEPRECATED,
      mergedIntoId: target.id,
    });
    expect(merged.mergedAt).toBeInstanceOf(Date);
    const log = await CatalogMergeLog.findOne({ where: { fromId: source.id } });
    expect(log).toMatchObject({
      entityType: 'product',
      intoId: target.id,
      adminUserId: adminId,
      summary: expect.objectContaining({ movedListings: result.movedListings }),
    });
  });

  it('leaves past order lines on the source product', async () => {
    const { source, target } = await pair();
    const vendor = await fx.vendor();
    const sold = await fx.listing(vendor.id, source.id);
    const orderItemId = await seedOrderLine(vendor.id, sold.id, source.id);

    try {
      await service.merge(adminId, source.id, target.id);

      const [row] = await sequelize.query<{ master_product_id: string }>(
        'SELECT master_product_id FROM order_items WHERE id = :id',
        { replacements: { id: orderItemId }, type: QueryTypes.SELECT },
      );
      expect(row.master_product_id).toBe(source.id);
    } finally {
      await removeOrderLine(orderItemId);
    }
  });

  it('refuses (400) different categories, a retired product on either side, and itself', async () => {
    const { source, target } = await pair();
    const elsewhere = await fx.product(otherCategoryId);
    const retired = await fx.product(categoryId, { status: MasterProductStatus.DEPRECATED });

    for (const [from, into] of [
      [source.id, elsewhere.id],
      [retired.id, target.id],
      [source.id, retired.id],
      [source.id, source.id],
    ]) {
      await expect(service.merge(adminId, from, into)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect((await reload(source.id)).status).toBe(MasterProductStatus.DRAFT);
  });

  it('updates the target’s cached best price when a cheaper listing moves over', async () => {
    const { source, target } = await pair();
    await fx.listing((await fx.vendor()).id, target.id, VendorListingStatus.ACTIVE, { price: 900 });
    const cheap = await fx.listing((await fx.vendor()).id, source.id, VendorListingStatus.ACTIVE, {
      price: 500,
    });

    await service.merge(adminId, source.id, target.id);

    expect(await reload(target.id)).toMatchObject({
      cachedBestPrice: '500.00',
      cachedBestVendorListingId: cheap.id,
    });
  });

  // A customer, address, order, vendor group and one order line, by SQL: the
  // order models are not part of the catalog test model list.
  async function seedOrderLine(vendorId: string, listingId: string, productId: string) {
    const user = await User.create({
      name: `PM Customer ${suffix}`,
      phone: `+91${String(Date.now() + 7).slice(-10)}`,
      role: 'CUSTOMER',
    } as never);
    const one = async (sql: string, replacements: Record<string, unknown>) => {
      const rows = await sequelize.query<{ id: string }>(`${sql} RETURNING id`, {
        replacements,
        type: QueryTypes.SELECT,
      });
      return rows[0]!.id;
    };
    const customerId = await one(
      'INSERT INTO customers (id, user_id, full_name, created_at, updated_at) VALUES (gen_random_uuid(), :userId, :name, now(), now())',
      { userId: user.id, name: 'PM Customer' },
    );
    const addressId = await one(
      `INSERT INTO customer_addresses (id, customer_id, label, address_line_1, city, pincode, created_at, updated_at)
       VALUES (gen_random_uuid(), :customerId, 'Home', '1 Test Road', 'Jaipur', '302001', now(), now())`,
      { customerId },
    );
    const orderId = await one(
      `INSERT INTO orders (id, customer_id, delivery_address_id, grand_total, created_at, updated_at)
       VALUES (gen_random_uuid(), :customerId, :addressId, 900, now(), now())`,
      { customerId, addressId },
    );
    const groupId = await one(
      `INSERT INTO order_vendor_group (id, order_id, vendor_id, subtotal, created_at, updated_at)
       VALUES (gen_random_uuid(), :orderId, :vendorId, 900, now(), now())`,
      { orderId, vendorId },
    );
    const itemId = await one(
      `INSERT INTO order_items (id, order_vendor_group_id, vendor_listing_id, master_product_id, quantity, unit_price_snapshot, created_at, updated_at)
       VALUES (gen_random_uuid(), :groupId, :listingId, :productId, 1, 900, now(), now())`,
      { groupId, listingId, productId },
    );
    cleanup.set(itemId, { groupId, orderId, addressId, customerId, userId: user.id });
    return itemId;
  }

  const cleanup = new Map<string, Record<string, string>>();
  async function removeOrderLine(itemId: string) {
    const ids = cleanup.get(itemId)!;
    for (const [table, id] of [
      ['order_items', itemId],
      ['order_vendor_group', ids.groupId],
      ['orders', ids.orderId],
      ['customer_addresses', ids.addressId],
      ['customers', ids.customerId],
      ['users', ids.userId],
    ]) {
      await sequelize.query(`DELETE FROM ${table} WHERE id = :id`, { replacements: { id } });
    }
  }
});
